import type {
  AggMethod,
  AggregateResponse,
  DatasetSummary,
  ScatterResponse,
} from './types';

/** Base URL of the API. Configure with VITE_API_URL; see .env.example. */
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
).replace(/\/+$/, '');

/** Keep in sync with DATA_NEXUS_MAX_UPLOAD_BYTES on the backend. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = ['.csv', '.tsv', '.txt'] as const;

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new ApiError(
      `Could not reach the API at ${API_BASE_URL}. Is the backend running?`,
      0,
    );
  }

  if (!response.ok) {
    // FastAPI reports failures as {"detail": ...}. Never assume a non-2xx
    // body is a usable payload -- the old client did, and silently rendered
    // an error response as a successful upload.
    let detail = `Request failed with status ${response.status}.`;
    try {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === 'object' &&
        'detail' in body &&
        typeof (body as { detail: unknown }).detail === 'string'
      ) {
        detail = (body as { detail: string }).detail;
      }
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}

export function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return `Unsupported file type. Expected ${ACCEPTED_EXTENSIONS.join(', ')}.`;
  }
  if (file.size === 0) {
    return 'That file is empty.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const limit = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    return `File is larger than the ${limit} MB limit.`;
  }
  return null;
}

export function uploadDataset(
  file: File,
  signal?: AbortSignal,
): Promise<DatasetSummary> {
  const body = new FormData();
  body.append('file', file);
  return request<DatasetSummary>('/api/upload', { method: 'POST', body, signal });
}

export function fetchAggregate(
  datasetId: string,
  params: { x: string; y?: string | null; agg: AggMethod; limit?: number },
  signal?: AbortSignal,
): Promise<AggregateResponse> {
  return request<AggregateResponse>(`/api/datasets/${datasetId}/aggregate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x: params.x,
      y: params.y ?? null,
      agg: params.agg,
      limit: params.limit ?? 15,
    }),
    signal,
  });
}

export function fetchScatter(
  datasetId: string,
  params: { x: string; y: string; label?: string | null; limit?: number },
  signal?: AbortSignal,
): Promise<ScatterResponse> {
  return request<ScatterResponse>(`/api/datasets/${datasetId}/scatter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x: params.x,
      y: params.y,
      label: params.label ?? null,
      limit: params.limit ?? 500,
    }),
    signal,
  });
}

export function deleteDataset(datasetId: string): Promise<void> {
  return fetch(`${API_BASE_URL}/api/datasets/${datasetId}`, {
    method: 'DELETE',
  }).then(() => undefined);
}
