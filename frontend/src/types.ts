/** Shapes returned by the Data Nexus API. Mirrors the pydantic models in backend/main.py. */

export type ColumnKind = 'categorical' | 'numeric' | 'temporal';

export type AggMethod = 'sum' | 'average' | 'max' | 'min' | 'count';

export type ChartType = 'bar' | 'line' | 'pie' | 'donut' | 'scatter';

export interface ColumnInfo {
  name: string;
  kind: ColumnKind;
}

export interface SpatialPoint {
  id: number;
  lat: number;
  lng: number;
  title: string;
}

export interface DatasetMetrics {
  source_rows: number;
  analyzed_rows: number;
  truncated: boolean;
  columns_count: number;
  top_category: string | null;
  total_value: number | null;
  total_value_column: string | null;
}

export interface SuggestedAxes {
  x: string | null;
  y: string | null;
  scatter_x: string | null;
  scatter_y: string | null;
}

export interface DatasetSummary {
  dataset_id: string;
  filename: string;
  columns: ColumnInfo[];
  categorical_columns: string[];
  numeric_columns: string[];
  temporal_columns: string[];
  suggested: SuggestedAxes;
  spatial: SpatialPoint[];
  spatial_truncated: boolean;
  metrics: DatasetMetrics;
}

export interface SeriesPoint {
  name: string;
  value: number;
}

export interface AggregateResponse {
  data: SeriesPoint[];
  total_groups: number;
  truncated: boolean;
  subtitle: string;
}

export interface ScatterDatum {
  x: number;
  y: number;
  name: string;
}

export interface ScatterResponse {
  data: ScatterDatum[];
  total_points: number;
  sampled: boolean;
  subtitle: string;
}

export interface AxisConfig {
  x: string;
  y: string;
  agg: AggMethod;
}
