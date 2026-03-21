<p align="center">
  <h1 align="center">🔮 Data Nexus</h1>
  <p align="center">
    <strong>A premium fullstack data visualization dashboard</strong><br/>
    Upload any CSV → Instantly explore it with interactive charts, maps & metrics
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Pandas-Vectorized-150458?logo=pandas&logoColor=white" alt="Pandas" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📊 **Multi-Chart Dashboard** | Bar, Line, Pie, Donut, and Scatter plots — toggle any combination simultaneously |
| 🗺️ **Geospatial Mapping** | Auto-detecting `lat`/`lng` columns with auto-zoom to data bounds via Leaflet |
| 🎯 **Dynamic Axis Selection** | Per-chart X/Y axis dropdowns — each chart independently configurable |
| 📐 **Aggregation Control** | Choose Sum, Average, Max, Min, or Count per chart — no more misleading sums |
| 📏 **Resizable Panels** | Every widget is natively resizable via drag — flexbox layout adapts dynamically |
| ⚡ **Vectorized Processing** | Pandas-powered backend with type-aware NaN handling and smart column detection |
| 🎨 **Premium Dark UI** | Glassmorphism, smooth gradients, micro-animations, Google Fonts (Outfit) |
| 📦 **Code-Split Bundles** | React.lazy + Suspense with manual Vite chunking — main bundle under 200 kB |

## 🏗️ Architecture

```
data-viz-app/
├── backend/                # Python API
│   ├── main.py             # FastAPI server — upload, parse, analyze
│   └── requirements.txt    # pandas, fastapi, uvicorn, sqlalchemy
│
├── frontend/               # React SPA
│   ├── src/
│   │   ├── App.tsx                     # Dashboard shell, state, axis configs
│   │   ├── index.css                   # Design system (CSS variables, glass panels)
│   │   └── components/
│   │       ├── DBConnectionPanel.tsx    # Database credential form
│   │       ├── FileUploadPanel.tsx      # CSV upload with drag-and-drop
│   │       ├── charts/
│   │       │   └── ChartVisuals.tsx     # Recharts wrapper (5 chart types)
│   │       └── spatial/
│   │           └── SpatialMapVisual.tsx # Leaflet map with auto-fit bounds
│   └── vite.config.ts                  # Code-splitting & chunk optimization
│
└── README.md
```

### Data Flow

```
CSV Upload → FastAPI (Pandas) → Type Detection → NaN Cleanup → JSON Payload
                                                                    ↓
                                              React Dashboard ← raw_data[]
                                                    ↓             str_cols[]
                                              User selects         num_cols[]
                                              X / Agg / Y
                                                    ↓
                                              getDerivedData() → Recharts / Leaflet
```

## 🚀 Quick Start

### Prerequisites
- **Python 3.10+** with [uv](https://github.com/astral-sh/uv) (recommended) or pip
- **Node.js 18+** with npm

### 1. Clone & Start Backend

```bash
git clone https://github.com/YashMhn/data-nexus.git
cd data-nexus/backend

# Using uv (recommended)
uv venv && uv pip install -r requirements.txt
uv run uvicorn main:app --reload

# Or using pip
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

> Backend runs at `http://localhost:8000`

### 2. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

> Frontend runs at `http://localhost:5173`

### 3. Try It Out
1. Open `http://localhost:5173`
2. Upload any CSV file (try [Kaggle datasets](https://www.kaggle.com/datasets))
3. Toggle chart widgets, select axes, change aggregation method
4. If your CSV has `lat`/`lng` columns, the map auto-zooms to your data!

## 🧪 Sample Datasets to Try

| Dataset | What You'll See |
|---------|----------------|
| [NY Airbnb](https://www.kaggle.com/datasets/dgomonov/new-york-city-airbnb-open-data) | Spatial map of listings + price analysis by neighborhood |
| [Superstore Sales](https://www.kaggle.com/datasets/vivek468/superstore-dataset-final) | Product category breakdown with profit/sales metrics |

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | FastAPI, Pandas, SQLAlchemy | CSV parsing, vectorized analysis, API |
| **Frontend** | React 18, TypeScript, Vite 8 | SPA with strict typing and HMR |
| **Charts** | Recharts | Bar, Line, Pie, Donut, Scatter |
| **Maps** | Leaflet + React-Leaflet | Geospatial visualization with CARTO tiles |
| **Styling** | Vanilla CSS | Glassmorphism, CSS variables, native resize |
| **Optimization** | React.lazy, Suspense, Vite chunking | Code-split bundles under 400 kB each |

# Work In Progress

## 📄 License

MIT — feel free to fork, modify, and use in your own projects.

---

<p align="center">
  Built with ☕ and too many CSV files
</p>
