import { Suspense, lazy, useCallback, useState } from 'react';
import './index.css';
import 'leaflet/dist/leaflet.css';
import FileUploadPanel from './components/FileUploadPanel';
import DatasetSummaryPanel from './components/DatasetSummaryPanel';
import ChartPanel from './components/charts/ChartPanel';
import { deleteDataset } from './api';
import type { AxisConfig, ChartType, DatasetSummary } from './types';

const SpatialMapVisual = lazy(() => import('./components/spatial/SpatialMapVisual'));

const CHART_TYPES: ChartType[] = ['bar', 'line', 'pie', 'donut', 'scatter'];

const WIDGETS = [
  { id: 'metrics', label: 'Metrics' },
  { id: 'map', label: 'Spatial Map' },
  { id: 'bar', label: 'Bar Chart' },
  { id: 'line', label: 'Line Chart' },
  { id: 'pie', label: 'Pie Chart' },
  { id: 'donut', label: 'Donut Chart' },
  { id: 'scatter', label: 'Scatter Plot' },
] as const;

const numberFormat = new Intl.NumberFormat();

interface TabButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

const TabButton = ({ active, label, onClick }: TabButtonProps) => (
  <button
    type="button"
    className={`tab${active ? ' tab--active' : ''}`}
    aria-pressed={active}
    onClick={onClick}
  >
    {label}
  </button>
);

function buildInitialConfigs(dataset: DatasetSummary): Record<ChartType, AxisConfig> {
  const { suggested } = dataset;
  const categoryX =
    suggested.x ?? dataset.categorical_columns[0] ?? dataset.temporal_columns[0] ?? '';
  const valueY = suggested.y ?? dataset.numeric_columns[0] ?? '';
  const scatterX = suggested.scatter_x ?? dataset.numeric_columns[0] ?? '';
  const scatterY =
    suggested.scatter_y ?? dataset.numeric_columns[1] ?? dataset.numeric_columns[0] ?? '';

  return {
    bar: { x: categoryX, y: valueY, agg: 'sum' },
    line: { x: categoryX, y: valueY, agg: 'sum' },
    pie: { x: categoryX, y: valueY, agg: 'sum' },
    donut: { x: categoryX, y: valueY, agg: 'sum' },
    scatter: { x: scatterX, y: scatterY, agg: 'sum' },
  };
}

function App() {
  const [dataset, setDataset] = useState<DatasetSummary | null>(null);
  const [axisConfigs, setAxisConfigs] = useState<Record<ChartType, AxisConfig> | null>(
    null,
  );
  const [activeWidgets, setActiveWidgets] = useState<string[]>([
    'metrics',
    'map',
    'bar',
  ]);

  const handleUploaded = useCallback(
    (summary: DatasetSummary) => {
      // Release the previous frame server-side; the store is bounded and there
      // is no reason to hold a dataset nobody is looking at.
      if (dataset) void deleteDataset(dataset.dataset_id).catch(() => undefined);
      setDataset(summary);
      setAxisConfigs(buildInitialConfigs(summary));
    },
    [dataset],
  );

  const handleClear = useCallback(() => {
    if (dataset) void deleteDataset(dataset.dataset_id).catch(() => undefined);
    setDataset(null);
    setAxisConfigs(null);
  }, [dataset]);

  const updateConfig = useCallback((type: ChartType, patch: Partial<AxisConfig>) => {
    setAxisConfigs((previous) =>
      previous ? { ...previous, [type]: { ...previous[type], ...patch } } : previous,
    );
  }, []);

  const toggleWidget = useCallback((id: string) => {
    setActiveWidgets((previous) =>
      previous.includes(id)
        ? previous.filter((widget) => widget !== id)
        : [...previous, id],
    );
  }, []);

  const metrics = dataset?.metrics ?? null;

  return (
    <div className="app-container">
      <aside className="sidebar">
        <FileUploadPanel
          onUploaded={handleUploaded}
          currentFilename={dataset?.filename ?? null}
        />
        <DatasetSummaryPanel dataset={dataset} onClear={handleClear} />
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header__top">
            <h1>Data Nexus</h1>
            <div className="status-pill">
              <span
                className={`status-dot ${dataset ? 'status-dot--ok' : 'status-dot--idle'}`}
              />
              <span>{dataset ? dataset.filename : 'No dataset'}</span>
            </div>
          </div>

          <div className="widget-toggles">
            <span className="widget-toggles__label">Active widgets</span>
            {WIDGETS.map((widget) => (
              <TabButton
                key={widget.id}
                active={activeWidgets.includes(widget.id)}
                label={widget.label}
                onClick={() => toggleWidget(widget.id)}
              />
            ))}
          </div>
        </header>

        <div className="dashboard-grid">
          {activeWidgets.includes('metrics') && (
            <section className="glass-panel resizable full-width">
              <h3 className="panel-title">Dataset metrics</h3>
              {metrics ? (
                <div className="metric-row">
                  <div className="metric">
                    <span className="metric__value metric__value--hero">
                      {numberFormat.format(metrics.analyzed_rows)}
                    </span>
                    <span className="metric__label">
                      {metrics.truncated ? 'Rows analysed (capped)' : 'Rows analysed'}
                    </span>
                  </div>
                  <div className="metric">
                    <span className="metric__value">{metrics.columns_count}</span>
                    <span className="metric__label">Columns</span>
                  </div>
                  {metrics.top_category && (
                    <div className="metric">
                      <span className="metric__value metric__value--accent">
                        {metrics.top_category}
                      </span>
                      <span className="metric__label">Top category</span>
                    </div>
                  )}
                  {metrics.total_value !== null && metrics.total_value_column && (
                    <div className="metric">
                      <span className="metric__value">
                        {numberFormat.format(Math.round(metrics.total_value))}
                      </span>
                      <span className="metric__label">
                        Total {metrics.total_value_column}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="chart-placeholder chart-placeholder--muted">
                  Awaiting a dataset.
                </div>
              )}
            </section>
          )}

          {activeWidgets.includes('map') && (
            <section className="glass-panel resizable">
              <h3 className="panel-title">Geospatial distribution</h3>
              <div className="panel-body panel-body--map">
                <Suspense
                  fallback={
                    <div className="chart-placeholder">
                      <span className="pulse">Loading map…</span>
                    </div>
                  }
                >
                  <SpatialMapVisual
                    points={dataset?.spatial ?? []}
                    hasDataset={dataset !== null}
                    truncated={dataset?.spatial_truncated ?? false}
                  />
                </Suspense>
              </div>
            </section>
          )}

          {CHART_TYPES.filter((type) => activeWidgets.includes(type)).map((type) =>
            dataset && axisConfigs ? (
              <ChartPanel
                key={type}
                type={type}
                dataset={dataset}
                config={axisConfigs[type]}
                onConfigChange={(patch) => updateConfig(type, patch)}
              />
            ) : (
              <section key={type} className="glass-panel resizable">
                <h3 className="panel-title panel-title--chart">{type} analysis</h3>
                <div className="panel-body">
                  <div className="chart-placeholder chart-placeholder--muted">
                    Awaiting a dataset.
                  </div>
                </div>
              </section>
            ),
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
