import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import type { AggregateResponse, DatasetSummary } from '../types';

const summary: DatasetSummary = {
  dataset_id: 'ds-1',
  filename: 'listings.csv',
  columns: [
    { name: 'city', kind: 'categorical' },
    { name: 'is_superhost', kind: 'categorical' },
    { name: 'last_review', kind: 'temporal' },
    { name: 'price', kind: 'numeric' },
    { name: 'reviews', kind: 'numeric' },
  ],
  categorical_columns: ['city', 'is_superhost'],
  numeric_columns: ['price', 'reviews'],
  temporal_columns: ['last_review'],
  suggested: {
    x: 'city',
    y: 'price',
    scatter_x: 'price',
    scatter_y: 'reviews',
  },
  spatial: [],
  spatial_truncated: false,
  metrics: {
    source_rows: 50_000,
    analyzed_rows: 50_000,
    truncated: false,
    columns_count: 5,
    top_category: 'New York',
    total_value: 22_150_190,
    total_value_column: 'price',
  },
};

const aggregate: AggregateResponse = {
  data: [
    { name: 'New York', value: 4_382_540 },
    { name: 'Chicago', value: 4_447_172 },
  ],
  total_groups: 5,
  truncated: false,
  subtitle: "Sum of 'price' by 'city'",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Route each API path to a canned response, and record what was requested. */
function mockApi(overrides: Partial<Record<string, () => Response>> = {}) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let body: unknown = null;
    if (typeof init?.body === 'string') body = JSON.parse(init.body);
    calls.push({ url, body });

    for (const [fragment, factory] of Object.entries(overrides)) {
      if (url.includes(fragment) && factory) return factory();
    }
    if (url.includes('/api/upload')) return jsonResponse(summary);
    if (url.includes('/aggregate')) return jsonResponse(aggregate);
    if (url.includes('/scatter')) {
      return jsonResponse({
        data: [{ x: 1, y: 2, name: 'New York' }],
        total_points: 1,
        sampled: false,
        subtitle: "'reviews' vs 'price'",
      });
    }
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function csvFile(name = 'listings.csv') {
  return new File(['city,price\nNY,10\n'], name, { type: 'text/csv' });
}

async function uploadFile(file: File, applyAccept = true) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  await userEvent.upload(input!, file, { applyAccept });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('empty state', () => {
  it('renders without a dataset and asks for one', () => {
    mockApi();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Data Nexus' })).toBeVisible();
    expect(screen.getByText('No dataset')).toBeVisible();
    expect(screen.getByText(/No dataset loaded/i)).toBeVisible();
  });

  it('does not call the API before a file is chosen', () => {
    const calls = mockApi();
    render(<App />);
    expect(calls).toHaveLength(0);
  });
});

describe('upload', () => {
  it('renders metrics and a chart from the API response', async () => {
    mockApi();
    render(<App />);
    await uploadFile(csvFile());

    expect(await screen.findByText('Loaded: listings.csv')).toBeVisible();

    // Scope to the metrics panel: the sidebar summary repeats these figures.
    const heading = await screen.findByRole('heading', { name: 'Dataset metrics' });
    const panel = within(heading.closest('section')!);
    expect(panel.getByText('50,000')).toBeVisible();
    expect(panel.getByText('Rows analysed')).toBeVisible();
    expect(panel.getByText('New York')).toBeVisible();
    expect(panel.getByText('Top category')).toBeVisible();
    expect(panel.getByText('Total price')).toBeVisible();

    // The bar panel pulls its series from the aggregate endpoint.
    expect(await screen.findByText("Sum of 'price' by 'city'")).toBeVisible();
  });

  it('requests aggregation server-side with the suggested axes', async () => {
    const calls = mockApi();
    render(<App />);
    await uploadFile(csvFile());

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/aggregate'))).toBe(true);
    });
    const request = calls.find((call) => call.url.includes('/aggregate'));
    expect(request?.url).toContain('/api/datasets/ds-1/aggregate');
    expect(request?.body).toMatchObject({ x: 'city', y: 'price', agg: 'sum' });
  });

  it('surfaces a server error instead of showing a success state', async () => {
    mockApi({
      '/api/upload': () => jsonResponse({ detail: 'The uploaded file is empty.' }, 400),
    });
    render(<App />);
    await uploadFile(csvFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The uploaded file is empty.',
    );
    expect(screen.queryByText(/Loaded:/)).not.toBeInTheDocument();
    expect(screen.getByText('No dataset')).toBeVisible();
  });

  it('reports an unreachable backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    render(<App />);
    await uploadFile(csvFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(/Is the backend running/);
  });

  it('rejects an unsupported file type before hitting the network', async () => {
    const calls = mockApi();
    render(<App />);
    // Bypass the input's accept filter: a drag-and-drop, or a picker set to
    // "All files", can still hand us a file the API would reject.
    await uploadFile(new File(['x'], 'photo.png', { type: 'image/png' }), false);

    expect(await screen.findByRole('alert')).toHaveTextContent(/Unsupported file type/);
    expect(calls).toHaveLength(0);
  });

  it('warns when the backend only analysed part of the file', async () => {
    mockApi({
      '/api/upload': () =>
        jsonResponse({
          ...summary,
          metrics: {
            ...summary.metrics,
            source_rows: 2_000_000,
            analyzed_rows: 1_000_000,
            truncated: true,
          },
        }),
    });
    render(<App />);
    await uploadFile(csvFile());

    expect(await screen.findByRole('status')).toHaveTextContent(
      /2,000,000 rows; only the first 1,000,000 are analysed/,
    );
  });
});

describe('axis controls', () => {
  it('refetches when the aggregation method changes', async () => {
    const calls = mockApi();
    render(<App />);
    await uploadFile(csvFile());
    await screen.findByText("Sum of 'price' by 'city'");

    const before = calls.filter((call) => call.url.includes('/aggregate')).length;
    await userEvent.selectOptions(screen.getByLabelText('Aggregation'), 'average');

    await waitFor(() => {
      const after = calls.filter((call) => call.url.includes('/aggregate'));
      expect(after.length).toBeGreaterThan(before);
      expect(after.at(-1)?.body).toMatchObject({ agg: 'average' });
    });
  });

  it('offers date columns as a category axis but not as a measure', async () => {
    mockApi();
    render(<App />);
    await uploadFile(csvFile());
    await screen.findByText("Sum of 'price' by 'city'");

    const xAxis = screen.getByLabelText('X axis');
    expect(within(xAxis).getByRole('option', { name: 'last_review (X)' })).toBeDefined();
    expect(within(xAxis).getByRole('option', { name: 'is_superhost (X)' })).toBeDefined();

    const yAxis = screen.getByLabelText('Y axis');
    expect(within(yAxis).queryByRole('option', { name: /last_review/ })).toBeNull();
  });

  it('disables the measure select for a row count', async () => {
    mockApi();
    render(<App />);
    await uploadFile(csvFile());
    await screen.findByText("Sum of 'price' by 'city'");

    await userEvent.selectOptions(screen.getByLabelText('Aggregation'), 'count');
    await waitFor(() => expect(screen.getByLabelText('Y axis')).toBeDisabled());
  });
});

describe('widgets', () => {
  it('adds and removes panels', async () => {
    mockApi();
    render(<App />);
    await uploadFile(csvFile());

    expect(screen.queryByText(/scatter analysis/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Scatter Plot' }));
    expect(await screen.findByText(/scatter analysis/i)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Bar Chart' }));
    await waitFor(() =>
      expect(screen.queryByText(/bar analysis/i)).not.toBeInTheDocument(),
    );
  });

  it('says so when a dataset has no mappable columns', async () => {
    mockApi();
    render(<App />);
    await uploadFile(csvFile());

    expect(
      await screen.findByText(/No usable lat\/lng columns in this dataset/i),
    ).toBeVisible();
  });
});

describe('clearing', () => {
  it('releases the dataset on the server', async () => {
    const calls = mockApi();
    render(<App />);
    await uploadFile(csvFile());
    await screen.findByText('Loaded: listings.csv');

    await userEvent.click(screen.getByRole('button', { name: 'Clear dataset' }));

    await waitFor(() => {
      expect(
        calls.some((call) => call.url.includes('/api/datasets/ds-1')),
      ).toBe(true);
    });
    expect(screen.getByText('No dataset')).toBeVisible();
  });
});
