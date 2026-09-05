import { Suspense, lazy } from 'react';
import { useChartSeries } from '../../hooks/useChartSeries';
import type { AggMethod, AxisConfig, ChartType, DatasetSummary } from '../../types';

const ChartVisuals = lazy(() => import('./ChartVisuals'));

const AGG_METHODS: AggMethod[] = ['sum', 'average', 'max', 'min', 'count'];

const AGG_LABELS: Record<AggMethod, string> = {
  sum: 'Sum',
  average: 'Average',
  max: 'Max',
  min: 'Min',
  count: 'Count (rows)',
};

interface ChartPanelProps {
  type: ChartType;
  dataset: DatasetSummary;
  config: AxisConfig;
  onConfigChange: (patch: Partial<AxisConfig>) => void;
}

const ChartPanel = ({ type, dataset, config, onConfigChange }: ChartPanelProps) => {
  const isScatter = type === 'scatter';
  const labelColumn = dataset.categorical_columns[0] ?? null;
  const { status, series, points, subtitle, error } = useChartSeries(
    dataset.dataset_id,
    type,
    config,
    isScatter ? labelColumn : null,
  );

  const xOptions = isScatter
    ? dataset.numeric_columns
    : [...dataset.categorical_columns, ...dataset.temporal_columns];
  const yOptions = dataset.numeric_columns;
  const yDisabled = !isScatter && config.agg === 'count';

  const body = () => {
    if (xOptions.length === 0) {
      return (
        <div className="chart-placeholder chart-placeholder--muted">
          {isScatter
            ? 'This chart needs two numeric columns.'
            : 'No category or date column to group by.'}
        </div>
      );
    }
    if (status === 'error') {
      return (
        <div className="chart-placeholder chart-placeholder--error" role="alert">
          {error}
        </div>
      );
    }
    if (status === 'idle') {
      return (
        <div className="chart-placeholder chart-placeholder--muted">
          Choose columns to plot.
        </div>
      );
    }
    if (status === 'loading') {
      return (
        <div className="chart-placeholder">
          <span className="pulse">Aggregating…</span>
        </div>
      );
    }
    return (
      <Suspense
        fallback={
          <div className="chart-placeholder">
            <span className="pulse">Loading chart…</span>
          </div>
        }
      >
        <ChartVisuals type={type} series={series} points={points} />
      </Suspense>
    );
  };

  return (
    <section className="glass-panel resizable">
      <header className="panel-header">
        <div>
          <h3 className="panel-title panel-title--chart">{type} analysis</h3>
          <p className="panel-subtitle">{subtitle ?? ' '}</p>
        </div>

        <div className="axis-controls">
          <label className="visually-hidden" htmlFor={`${type}-x`}>
            X axis
          </label>
          <select
            id={`${type}-x`}
            className="select"
            value={config.x}
            onChange={(event) => onConfigChange({ x: event.target.value })}
          >
            {xOptions.map((column) => (
              <option key={column} value={column}>
                {column} (X)
              </option>
            ))}
          </select>

          {!isScatter && (
            <>
              <label className="visually-hidden" htmlFor={`${type}-agg`}>
                Aggregation
              </label>
              <select
                id={`${type}-agg`}
                className="select"
                value={config.agg}
                onChange={(event) =>
                  onConfigChange({ agg: event.target.value as AggMethod })
                }
              >
                {AGG_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {AGG_LABELS[method]}
                  </option>
                ))}
              </select>
            </>
          )}

          <label className="visually-hidden" htmlFor={`${type}-y`}>
            Y axis
          </label>
          <select
            id={`${type}-y`}
            className="select"
            value={config.y}
            disabled={yDisabled || yOptions.length === 0}
            onChange={(event) => onConfigChange({ y: event.target.value })}
          >
            {yOptions.length === 0 && <option value="">No numeric columns</option>}
            {yOptions.map((column) => (
              <option key={column} value={column}>
                {column} (Y)
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="panel-body">{body()}</div>
    </section>
  );
};

export default ChartPanel;
