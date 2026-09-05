import { useEffect, useState } from 'react';
import { ApiError, fetchAggregate, fetchScatter } from '../api';
import type { AxisConfig, ChartType, ScatterDatum, SeriesPoint } from '../types';

export interface ChartSeries {
  status: 'idle' | 'loading' | 'ready' | 'error';
  series: SeriesPoint[];
  points: ScatterDatum[];
  subtitle: string | null;
  error: string | null;
}

interface Loaded {
  key: string;
  series: SeriesPoint[];
  points: ScatterDatum[];
  subtitle: string | null;
  error: string | null;
}

const EMPTY: ChartSeries = {
  status: 'idle',
  series: [],
  points: [],
  subtitle: null,
  error: null,
};

function requestKey(
  datasetId: string | null,
  type: ChartType,
  config: AxisConfig,
): string | null {
  if (!datasetId || !config.x) return null;
  if (type === 'scatter') {
    return config.y ? `${datasetId}|scatter|${config.x}|${config.y}` : null;
  }
  if (config.agg !== 'count' && !config.y) return null;
  return `${datasetId}|agg|${config.x}|${config.y}|${config.agg}`;
}

/**
 * Fetch one chart's data from the API.
 *
 * Aggregation runs server-side against the stored frame, so the browser holds
 * at most a few dozen points per chart instead of the whole dataset. Loading
 * is derived by comparing the settled result's key against the current one,
 * which avoids a synchronous setState inside the effect.
 */
export function useChartSeries(
  datasetId: string | null,
  type: ChartType,
  config: AxisConfig,
  labelColumn: string | null,
): ChartSeries {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = requestKey(datasetId, type, config);

  useEffect(() => {
    if (!key || !datasetId) return;

    const controller = new AbortController();
    const settle = (patch: Omit<Loaded, 'key'>) => {
      if (!controller.signal.aborted) setLoaded({ key, ...patch });
    };
    const fail = (error: unknown) => {
      if (controller.signal.aborted) return;
      const message =
        error instanceof ApiError ? error.message : 'Failed to load chart data.';
      settle({ series: [], points: [], subtitle: null, error: message });
    };

    if (type === 'scatter') {
      fetchScatter(
        datasetId,
        { x: config.x, y: config.y, label: labelColumn },
        controller.signal,
      )
        .then((response) =>
          settle({
            series: [],
            points: response.data,
            subtitle: response.subtitle,
            error: null,
          }),
        )
        .catch(fail);
    } else {
      fetchAggregate(
        datasetId,
        { x: config.x, y: config.y || null, agg: config.agg },
        controller.signal,
      )
        .then((response) =>
          settle({
            series: response.data,
            points: [],
            subtitle: response.subtitle,
            error: null,
          }),
        )
        .catch(fail);
    }

    return () => controller.abort();
  }, [key, datasetId, type, config.x, config.y, config.agg, labelColumn]);

  if (!key) return EMPTY;
  if (!loaded || loaded.key !== key) {
    return { ...EMPTY, status: 'loading' };
  }
  return {
    status: loaded.error ? 'error' : 'ready',
    series: loaded.series,
    points: loaded.points,
    subtitle: loaded.subtitle,
    error: loaded.error,
  };
}
