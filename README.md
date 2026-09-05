<h1 align="center">🔮 Data Nexus</h1>

<p align="center">
  <strong>A fullstack data exploration dashboard</strong><br/>
  Upload a CSV → explore it with interactive charts, maps and metrics
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Pandas-2.2+-150458?logo=pandas&logoColor=white" alt="Pandas" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT" />
</p>

---

## Features

| Feature | Description |
|---------|-------------|
| **Multi-chart dashboard** | Bar, line, pie, donut and scatter panels — toggle any combination at once |
| **Server-side aggregation** | Grouping runs in pandas; the browser only ever receives the points it draws |
| **Per-chart axis control** | Each panel has its own X / aggregation / Y selection |
| **Aggregation methods** | Sum, average, max, min, and a row count |
| **Geospatial map** | Auto-detects `lat`/`lng` columns and fits the viewport to the data |
| **Column type detection** | Categorical, numeric and date columns are classified and offered where they make sense |
| **Honest missing-value handling** | Blank cells are excluded from aggregations, never counted as zero |
| **Resizable panels** | Every widget resizes by dragging its corner |
| **Code-split bundles** | Recharts and Leaflet load on demand via `React.lazy` |

## How it works

The backend parses the upload once and keeps the DataFrame in memory under a
dataset id. Charts then ask for exactly the rows they render.

```
CSV upload ──▶ FastAPI ──▶ pandas parse ──▶ column classification ──▶ in-memory store
                                                                            │
                            dataset summary (columns, suggestions, metrics) ─┘
                                    │
                                    ▼
                            React dashboard
                                    │  user picks X / aggregation / Y
                                    ▼
                POST /api/datasets/{id}/aggregate ──▶ pandas groupby ──▶ ≤200 points
                                    │
                                    ▼
                          Recharts / Leaflet
```

A 3.5 MB, 50,000-row CSV produces a ~130 KB summary response, and each chart
update costs a few hundred bytes.

### API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness probe |
| `POST` | `/api/upload` | Parse a file, return a dataset summary and a dataset id |
| `POST` | `/api/datasets/{id}/aggregate` | Group by a column and reduce a measure |
| `POST` | `/api/datasets/{id}/scatter` | Sample x/y pairs for a scatter plot |
| `DELETE` | `/api/datasets/{id}` | Release a dataset |

Interactive docs are at `http://localhost:8000/docs` while the backend runs.

## Project layout

```
Data-Nexus/
├── backend/
│   ├── main.py                 # FastAPI app: parsing, classification, aggregation
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── tests/test_api.py       # 39 API and data-correctness tests
│
├── frontend/
│   ├── index.html
│   ├── vite.config.ts          # Code splitting + vitest config
│   └── src/
│       ├── App.tsx                       # Dashboard shell and widget state
│       ├── api.ts                        # Typed API client
│       ├── types.ts                      # Shared response types
│       ├── index.css                     # Design system
│       ├── hooks/useChartSeries.ts       # Per-chart fetching with abort + caching
│       ├── components/
│       │   ├── FileUploadPanel.tsx       # Upload with drag-and-drop and validation
│       │   ├── DatasetSummaryPanel.tsx   # Row/column counts, truncation notice
│       │   ├── charts/ChartPanel.tsx     # Axis controls + data loading per panel
│       │   ├── charts/ChartVisuals.tsx   # Recharts renderers
│       │   └── spatial/SpatialMapVisual.tsx
│       └── test/App.test.tsx             # 14 component tests
│
└── .github/workflows/ci.yml    # pytest + eslint + tsc + vite build
```

## Quick start

**Prerequisites:** Python 3.10+ and Node.js 18+.

### 1. Backend

```bash
git clone https://github.com/YashMhn/Data-Nexus.git
cd Data-Nexus/backend

python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn main:app --reload
```

Backend runs at `http://localhost:8000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

### 3. Try it

1. Open `http://localhost:5173`.
2. Drop a CSV onto the upload panel (try a [Kaggle dataset](https://www.kaggle.com/datasets)).
3. Toggle widgets, then pick an X column, an aggregation and a Y column per chart.
4. If the file has `lat`/`lng` columns, the map fits itself to your data.

## Configuration

### Frontend

Copy `frontend/.env.example` to `frontend/.env` to point the UI at a
non-default API host.

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `http://localhost:8000` | Base URL of the backend |

### Backend

All optional, read from the environment at startup.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATA_NEXUS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS allowlist |
| `DATA_NEXUS_MAX_UPLOAD_BYTES` | `104857600` (100 MB) | Upload size limit |
| `DATA_NEXUS_MAX_ANALYSIS_ROWS` | `1000000` | Row cap; the response reports when it applies |
| `DATA_NEXUS_DATASET_TTL_SECONDS` | `3600` | How long an idle dataset is kept |
| `DATA_NEXUS_MAX_DATASETS` | `16` | Datasets held before the oldest is evicted |

Do not set `DATA_NEXUS_ALLOWED_ORIGINS` to `*` — pair a wildcard with
credentials and any website can read the API on a visitor's behalf.

## Tests

```bash
cd backend && pip install -r requirements-dev.txt && python -m pytest    # 39 tests
cd frontend && npm test                                                 # 14 tests
```

CI runs both suites plus ESLint, `tsc`, and a production build on every push
and pull request.

## Known limits

- **The dataset store is process-local.** It is sized for a single-process
  deployment. Running Uvicorn with multiple workers needs a shared store
  (Redis, disk, or object storage) so every worker sees the same dataset.
- **Datasets live in memory** and expire after `DATA_NEXUS_DATASET_TTL_SECONDS`.
  A stale tab gets a `404` and has to re-upload.
- **There is no database connector.** Earlier versions showed a "connect to
  PostgreSQL/MySQL/SQLite" form that was not wired to anything; it has been
  removed rather than left as a mock. File upload is the only data source.
- **Charts show at most 200 groups** and scatter plots sample at most 2,000
  points, so wide-cardinality columns are summarised rather than drawn in full.
  The response says when that happened.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, pandas, pydantic, Uvicorn |
| Frontend | React 19, TypeScript, Vite 8 |
| Charts | Recharts |
| Maps | Leaflet + React-Leaflet, CARTO dark tiles |
| Styling | Vanilla CSS (custom properties, glassmorphism) |
| Tests | pytest, Vitest, Testing Library |

## License

MIT — see [LICENSE](LICENSE).
