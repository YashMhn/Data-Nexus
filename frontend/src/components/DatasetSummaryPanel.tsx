import type { DatasetSummary } from '../types';

interface DatasetSummaryPanelProps {
  dataset: DatasetSummary | null;
  onClear: () => void;
}

const numberFormat = new Intl.NumberFormat();

const DatasetSummaryPanel = ({ dataset, onClear }: DatasetSummaryPanelProps) => {
  if (!dataset) {
    return (
      <div className="glass-panel">
        <h2 className="panel-title">Dataset</h2>
        <p className="muted">
          No dataset loaded. Upload a delimited file to build the dashboard.
        </p>
      </div>
    );
  }

  const { metrics } = dataset;

  return (
    <div className="glass-panel">
      <h2 className="panel-title">Dataset</h2>
      <dl className="summary-list">
        <div>
          <dt>Rows analysed</dt>
          <dd>{numberFormat.format(metrics.analyzed_rows)}</dd>
        </div>
        <div>
          <dt>Columns</dt>
          <dd>{metrics.columns_count}</dd>
        </div>
        <div>
          <dt>Categorical</dt>
          <dd>{dataset.categorical_columns.length}</dd>
        </div>
        <div>
          <dt>Numeric</dt>
          <dd>{dataset.numeric_columns.length}</dd>
        </div>
        {dataset.temporal_columns.length > 0 && (
          <div>
            <dt>Date</dt>
            <dd>{dataset.temporal_columns.length}</dd>
          </div>
        )}
        {dataset.spatial.length > 0 && (
          <div>
            <dt>Map points</dt>
            <dd>{numberFormat.format(dataset.spatial.length)}</dd>
          </div>
        )}
      </dl>

      {metrics.truncated && (
        <p className="status-line status-line--warn" role="status">
          File held {numberFormat.format(metrics.source_rows)} rows; only the first{' '}
          {numberFormat.format(metrics.analyzed_rows)} are analysed. Charts and
          totals describe that subset.
        </p>
      )}

      <button type="button" className="button button--ghost" onClick={onClear}>
        Clear dataset
      </button>
    </div>
  );
};

export default DatasetSummaryPanel;
