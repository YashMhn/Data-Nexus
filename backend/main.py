"""Data Nexus API.

Parses an uploaded CSV once, keeps the frame server-side, and answers
aggregation queries against it. The browser never receives the raw dataset --
it asks for the handful of aggregated rows a chart actually renders.
"""

from __future__ import annotations

import csv
import logging
import math
import os
import re
import threading
import time
import uuid
import warnings
from collections import OrderedDict
from dataclasses import dataclass, field
from io import StringIO
from typing import Any, Literal

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logger = logging.getLogger("data_nexus")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


# CORS is restricted by default. Widen it deliberately, never with "*":
# a wildcard origin combined with credentials lets any site read this API.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "DATA_NEXUS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

MAX_UPLOAD_BYTES = _env_int("DATA_NEXUS_MAX_UPLOAD_BYTES", 100 * 1024 * 1024)
MAX_ANALYSIS_ROWS = _env_int("DATA_NEXUS_MAX_ANALYSIS_ROWS", 1_000_000)
DATASET_TTL_SECONDS = _env_int("DATA_NEXUS_DATASET_TTL_SECONDS", 3600)
MAX_DATASETS = _env_int("DATA_NEXUS_MAX_DATASETS", 16)

MAX_GROUPS = 200
MAX_SCATTER_POINTS = 2000
MAX_SPATIAL_POINTS = 2000

ACCEPTED_SUFFIXES = (".csv", ".tsv", ".txt")
# latin-1 maps every byte, so it always succeeds and acts as the final fallback.
ENCODINGS = ("utf-8-sig", "utf-8", "cp1252", "latin-1")

LAT_NAMES = ("lat", "latitude")
LNG_NAMES = ("lng", "lon", "long", "longitude")
TITLE_NAMES = ("title", "name", "label", "address", "description")

ID_NAMES = {
    "id", "index", "idx", "row", "rowid", "row_id", "serial",
    "sr", "sno", "s_no", "no", "key", "uid", "uuid", "pk",
}

AggMethod = Literal["sum", "average", "max", "min", "count"]
ColumnKind = Literal["categorical", "numeric", "temporal"]

# A value only looks like a date if it carries a date/time separator. Without
# this guard pandas happily reads "100" as a year and every numeric-looking
# string column turns into a timestamp column.
_DATE_HINT = re.compile(r"[-/:]")


# --------------------------------------------------------------------------
# Dataset store
# --------------------------------------------------------------------------


@dataclass
class Dataset:
    """A parsed upload, held in memory so charts can be aggregated on demand."""

    id: str
    filename: str
    frame: pd.DataFrame
    kinds: dict[str, ColumnKind]
    source_rows: int
    truncated: bool
    created_at: float = field(default_factory=time.monotonic)
    last_used: float = field(default_factory=time.monotonic)


class DatasetStore:
    """In-memory, TTL-bounded dataset cache.

    Deliberately process-local: it is sized for a single-process dev/demo
    deployment. Running multiple workers needs a shared store (Redis, disk,
    object storage) instead -- see README.
    """

    def __init__(self, max_items: int, ttl_seconds: int) -> None:
        self._items: OrderedDict[str, Dataset] = OrderedDict()
        self._lock = threading.Lock()
        self._max_items = max_items
        self._ttl = ttl_seconds

    def _evict_expired(self, now: float) -> None:
        expired = [k for k, d in self._items.items() if now - d.last_used > self._ttl]
        for key in expired:
            self._items.pop(key, None)

    def put(self, dataset: Dataset) -> None:
        with self._lock:
            self._evict_expired(time.monotonic())
            self._items[dataset.id] = dataset
            self._items.move_to_end(dataset.id)
            while len(self._items) > self._max_items:
                self._items.popitem(last=False)

    def get(self, dataset_id: str) -> Dataset:
        with self._lock:
            now = time.monotonic()
            self._evict_expired(now)
            dataset = self._items.get(dataset_id)
            if dataset is None:
                raise HTTPException(
                    status_code=404,
                    detail="Dataset not found or expired. Upload the file again.",
                )
            dataset.last_used = now
            self._items.move_to_end(dataset_id)
            return dataset

    def delete(self, dataset_id: str) -> bool:
        with self._lock:
            return self._items.pop(dataset_id, None) is not None

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._items)


store = DatasetStore(MAX_DATASETS, DATASET_TTL_SECONDS)


# --------------------------------------------------------------------------
# Parsing helpers
# --------------------------------------------------------------------------


def _decode(raw: bytes) -> str:
    for encoding in ENCODINGS:
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    # Unreachable while latin-1 is in ENCODINGS, but keep the fallback honest.
    return raw.decode("utf-8", errors="replace")


def _sniff_delimiter(text: str) -> str:
    """Detect the delimiter from a sample.

    Sniffing here rather than passing ``sep=None`` keeps pandas on its fast C
    parser; ``sep=None`` forces the much slower pure-Python engine.
    """
    sample = text[:64 * 1024]
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        return ","


def _maybe_datetime(series: pd.Series) -> pd.Series | None:
    """Return a parsed datetime series, or None if the column is not temporal."""
    sample = series.dropna().astype(str).head(200)
    if sample.empty or sample.str.contains(_DATE_HINT).mean() < 0.9:
        return None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if pd.to_datetime(sample, errors="coerce").notna().mean() < 0.9:
            return None
        return pd.to_datetime(series, errors="coerce")


def _classify(frame: pd.DataFrame) -> dict[str, ColumnKind]:
    """Label every column, converting detected date columns in place.

    Booleans are reported as categorical: they are neither meaningfully
    summable nor visible to a naive numeric/object split, which is how they
    used to disappear from the UI entirely.
    """
    kinds: dict[str, ColumnKind] = {}
    for column in frame.columns:
        series = frame[column]
        if pd.api.types.is_bool_dtype(series):
            kinds[column] = "categorical"
        elif pd.api.types.is_numeric_dtype(series):
            kinds[column] = "numeric"
        elif pd.api.types.is_datetime64_any_dtype(series):
            kinds[column] = "temporal"
        else:
            parsed = _maybe_datetime(series)
            if parsed is None:
                kinds[column] = "categorical"
            else:
                frame[column] = parsed
                kinds[column] = "temporal"
    return kinds


def _is_id_like(column: str) -> bool:
    name = str(column).lower().strip()
    return name in ID_NAMES or name.endswith("_id") or name.startswith("id_")


def _is_coordinate(column: str) -> bool:
    """Coordinates are numeric but are not measures -- summing latitudes is noise."""
    return str(column).lower().strip() in set(LAT_NAMES) | set(LNG_NAMES)


def _suggest(
    frame: pd.DataFrame, kinds: dict[str, ColumnKind]
) -> dict[str, str | None]:
    """Pick sensible default axes.

    A good category axis has more than one group but far fewer groups than
    rows -- a column of unique names makes a 100k-bar chart, and a date column
    makes a chart of one row per timestamp.
    """
    rows = max(len(frame), 1)
    categorical = [c for c, k in kinds.items() if k == "categorical"]
    numeric = [c for c, k in kinds.items() if k == "numeric"]

    def category_rank(column: str) -> tuple[int, int]:
        unique = int(frame[column].nunique(dropna=True))
        # Tier 0 is the sweet spot; everything degenerate sorts behind it.
        if 2 <= unique <= 50 and unique < rows:
            tier = 0
        elif 2 <= unique < rows:
            tier = 1
        else:
            tier = 2
        return (tier + (1 if _is_id_like(column) else 0), unique)

    x: str | None = min(categorical, key=category_rank) if categorical else None
    if x is None:
        temporal = [c for c, k in kinds.items() if k == "temporal"]
        x = temporal[0] if temporal else None

    meaningful_numeric = [
        c for c in numeric if not _is_id_like(c) and not _is_coordinate(c)
    ] or [c for c in numeric if not _is_id_like(c)] or numeric
    y = meaningful_numeric[0] if meaningful_numeric else None
    scatter_x = meaningful_numeric[0] if meaningful_numeric else None
    scatter_y = meaningful_numeric[1] if len(meaningful_numeric) > 1 else None
    return {"x": x, "y": y, "scatter_x": scatter_x, "scatter_y": scatter_y}


def _clean_number(value: Any) -> float | None:
    """Convert to a JSON-safe float, mapping NaN/inf to null rather than 0."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return round(number, 6)


def _label_series(frame: pd.DataFrame, column: str) -> pd.Series:
    """Render a column as display keys without silently merging categories."""
    series = frame[column]
    if pd.api.types.is_datetime64_any_dtype(series):
        text = series.dt.strftime("%Y-%m-%d")
    else:
        text = series.astype("object").astype(str)
    return text.where(series.notna(), "(missing)")


# --------------------------------------------------------------------------
# Request / response models
# --------------------------------------------------------------------------


class ColumnInfo(BaseModel):
    name: str
    kind: ColumnKind


class SpatialPoint(BaseModel):
    id: int
    lat: float
    lng: float
    title: str


class DatasetMetrics(BaseModel):
    source_rows: int
    analyzed_rows: int
    truncated: bool
    columns_count: int
    top_category: str | None = None
    total_value: float | None = None
    total_value_column: str | None = None


class DatasetSummary(BaseModel):
    dataset_id: str
    filename: str
    columns: list[ColumnInfo]
    categorical_columns: list[str]
    numeric_columns: list[str]
    temporal_columns: list[str]
    suggested: dict[str, str | None]
    spatial: list[SpatialPoint]
    spatial_truncated: bool
    metrics: DatasetMetrics


class AggregateRequest(BaseModel):
    x: str
    y: str | None = None
    agg: AggMethod = "sum"
    limit: int = Field(default=15, ge=1, le=MAX_GROUPS)


class AggregatePoint(BaseModel):
    name: str
    value: float


class AggregateResponse(BaseModel):
    data: list[AggregatePoint]
    total_groups: int
    truncated: bool
    subtitle: str


class ScatterRequest(BaseModel):
    x: str
    y: str
    label: str | None = None
    limit: int = Field(default=500, ge=1, le=MAX_SCATTER_POINTS)


class ScatterPoint(BaseModel):
    x: float
    y: float
    name: str


class ScatterResponse(BaseModel):
    data: list[ScatterPoint]
    total_points: int
    sampled: bool
    subtitle: str


# --------------------------------------------------------------------------
# Aggregation
# --------------------------------------------------------------------------


def _aggregate(
    frame: pd.DataFrame, x: str, y: str | None, agg: AggMethod, limit: int
) -> dict[str, Any]:
    """Group rows by ``x`` and reduce ``y``.

    Missing values are excluded, never coerced to zero: filling numeric gaps
    with 0 before averaging is what made every mean and min wrong.
    """
    keys = _label_series(frame, x)

    if agg == "count":
        # "Count" means rows per group, independent of the value column.
        result = keys.groupby(keys, observed=True, sort=False).size()
    else:
        if not y:
            raise HTTPException(
                status_code=400,
                detail=f"A numeric column is required for the {agg!r} aggregation.",
            )
        values = pd.to_numeric(frame[y], errors="coerce")
        grouped = values.groupby(keys, observed=True, sort=False)
        if agg == "sum":
            result = grouped.sum(min_count=1)
        elif agg == "average":
            result = grouped.mean()
        elif agg == "max":
            result = grouped.max()
        else:
            result = grouped.min()
        result = result.dropna()

    total_groups = int(len(result))
    top = result.sort_values(ascending=False).head(limit)
    data = [
        {"name": str(name), "value": value}
        for name, value in ((n, _clean_number(v)) for n, v in top.items())
        if value is not None
    ]
    return {
        "data": data,
        "total_groups": total_groups,
        "truncated": total_groups > len(data),
    }


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

app = FastAPI(title="Data Nexus API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/")
def read_root() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "Data Nexus API",
        "datasets_loaded": len(store),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


async def _read_capped(file: UploadFile) -> bytes:
    """Read the upload in chunks, aborting once it exceeds the size limit."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit."
                ),
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _build_spatial(
    frame: pd.DataFrame, kinds: dict[str, ColumnKind], suggested_x: str | None
) -> tuple[list[dict[str, Any]], bool]:
    lower = {str(c).lower(): c for c in frame.columns}
    lat_col = next((lower[n] for n in LAT_NAMES if n in lower), None)
    lng_col = next((lower[n] for n in LNG_NAMES if n in lower), None)
    if lat_col is None or lng_col is None:
        return [], False

    lat = pd.to_numeric(frame[lat_col], errors="coerce")
    lng = pd.to_numeric(frame[lng_col], errors="coerce")
    valid = lat.between(-90, 90) & lng.between(-180, 180)
    points = pd.DataFrame({"lat": lat, "lng": lng})[valid]
    if points.empty:
        return [], False

    # Only use a column that actually holds text. An all-empty column parses as
    # float, and stringifying it used to label every marker "0.0".
    title_col = next(
        (
            lower[n]
            for n in TITLE_NAMES
            if n in lower and kinds.get(lower[n]) == "categorical"
        ),
        None,
    )
    if title_col is None and suggested_x and kinds.get(suggested_x) == "categorical":
        title_col = suggested_x

    fallback = pd.Series(
        [f"Row {i}" for i in points.index], index=points.index, dtype="object"
    )
    if title_col is not None:
        titles = _label_series(frame, title_col).loc[points.index]
        titles = titles.where(titles.str.strip().ne(""), other=None)
        titles = titles.fillna(fallback)
    else:
        titles = fallback
    points["title"] = titles

    truncated = len(points) > MAX_SPATIAL_POINTS
    points = points.head(MAX_SPATIAL_POINTS)
    return (
        [
            {
                "id": int(index),
                "lat": float(row["lat"]),
                "lng": float(row["lng"]),
                "title": str(row["title"]),
            }
            for index, row in points.iterrows()
        ],
        truncated,
    )


@app.post("/api/upload", response_model=DatasetSummary)
async def upload_file(file: UploadFile = File(...)) -> DatasetSummary:
    filename = file.filename or "upload.csv"
    if not filename.lower().endswith(ACCEPTED_SUFFIXES):
        raise HTTPException(
            status_code=415,
            detail=(
                "Unsupported file type. Expected one of: "
                f"{', '.join(ACCEPTED_SUFFIXES)}."
            ),
        )

    raw = await _read_capped(file)
    if not raw.strip():
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    text = _decode(raw)
    try:
        frame = pd.read_csv(StringIO(text), sep=_sniff_delimiter(text))
    except Exception:
        # Log the detail for operators; never hand a raw parser traceback to
        # an anonymous client.
        logger.exception("Failed to parse upload %s", filename)
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not parse the file as delimited text. "
                "Check that it is a valid CSV."
            ),
        )

    if frame.empty or not len(frame.columns):
        raise HTTPException(
            status_code=400, detail="The file contains no readable rows or columns."
        )

    source_rows = int(len(frame))
    truncated = source_rows > MAX_ANALYSIS_ROWS
    if truncated:
        frame = frame.head(MAX_ANALYSIS_ROWS).copy()

    frame.columns = [str(c) for c in frame.columns]
    kinds = _classify(frame)
    suggested = _suggest(frame, kinds)
    spatial, spatial_truncated = _build_spatial(frame, kinds, suggested["x"])

    metrics = DatasetMetrics(
        source_rows=source_rows,
        analyzed_rows=int(len(frame)),
        truncated=truncated,
        columns_count=int(len(frame.columns)),
    )
    suggested_y = suggested["y"]
    suggested_x = suggested["x"]
    if suggested_y:
        metrics.total_value = _clean_number(
            pd.to_numeric(frame[suggested_y], errors="coerce").sum(min_count=1)
        )
        metrics.total_value_column = suggested_y
    if suggested_x and suggested_y:
        top = _aggregate(frame, suggested_x, suggested_y, "sum", 1)
        if top["data"]:
            metrics.top_category = top["data"][0]["name"]

    dataset = Dataset(
        id=uuid.uuid4().hex,
        filename=filename,
        frame=frame,
        kinds=kinds,
        source_rows=source_rows,
        truncated=truncated,
    )
    store.put(dataset)

    return DatasetSummary(
        dataset_id=dataset.id,
        filename=filename,
        columns=[ColumnInfo(name=c, kind=kinds[c]) for c in frame.columns],
        categorical_columns=[c for c in frame.columns if kinds[c] == "categorical"],
        numeric_columns=[c for c in frame.columns if kinds[c] == "numeric"],
        temporal_columns=[c for c in frame.columns if kinds[c] == "temporal"],
        suggested=suggested,
        spatial=[SpatialPoint(**point) for point in spatial],
        spatial_truncated=spatial_truncated,
        metrics=metrics,
    )


def _require_column(frame: pd.DataFrame, column: str, role: str) -> None:
    if column not in frame.columns:
        raise HTTPException(
            status_code=400, detail=f"Unknown {role} column: {column!r}."
        )


@app.post("/api/datasets/{dataset_id}/aggregate", response_model=AggregateResponse)
def aggregate_dataset(dataset_id: str, request: AggregateRequest) -> AggregateResponse:
    dataset = store.get(dataset_id)
    _require_column(dataset.frame, request.x, "x")
    if request.y:
        _require_column(dataset.frame, request.y, "y")

    result = _aggregate(dataset.frame, request.x, request.y, request.agg, request.limit)
    if request.agg == "count":
        subtitle = f"Rows per {request.x!r}"
    else:
        subtitle = f"{request.agg.title()} of {request.y!r} by {request.x!r}"
    if result["truncated"]:
        subtitle += f" (top {len(result['data'])} of {result['total_groups']:,})"

    return AggregateResponse(
        data=[AggregatePoint(**point) for point in result["data"]],
        total_groups=result["total_groups"],
        truncated=result["truncated"],
        subtitle=subtitle,
    )


@app.post("/api/datasets/{dataset_id}/scatter", response_model=ScatterResponse)
def scatter_dataset(dataset_id: str, request: ScatterRequest) -> ScatterResponse:
    dataset = store.get(dataset_id)
    _require_column(dataset.frame, request.x, "x")
    _require_column(dataset.frame, request.y, "y")
    if request.label:
        _require_column(dataset.frame, request.label, "label")

    frame = dataset.frame
    points = pd.DataFrame(
        {
            "x": pd.to_numeric(frame[request.x], errors="coerce"),
            "y": pd.to_numeric(frame[request.y], errors="coerce"),
        }
    ).dropna()

    label_column = request.label
    if label_column is None:
        label_column = next(
            (c for c, k in dataset.kinds.items() if k == "categorical"), None
        )
    if label_column is not None:
        points["label"] = _label_series(frame, label_column).loc[points.index]
    else:
        points["label"] = [f"Row {i}" for i in points.index]

    total_points = int(len(points))
    sampled = total_points > request.limit
    if sampled:
        # Sample rather than truncate: head() of a sorted file is not a shape.
        points = points.sample(n=request.limit, random_state=0).sort_index()

    subtitle = f"{request.y!r} vs {request.x!r}"
    if sampled:
        subtitle += f" ({request.limit:,} of {total_points:,} points sampled)"

    return ScatterResponse(
        data=[
            ScatterPoint(
                x=float(row["x"]), y=float(row["y"]), name=str(row["label"])
            )
            for _, row in points.iterrows()
        ],
        total_points=total_points,
        sampled=sampled,
        subtitle=subtitle,
    )


@app.delete("/api/datasets/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str) -> None:
    if not store.delete(dataset_id):
        raise HTTPException(status_code=404, detail="Dataset not found.")
