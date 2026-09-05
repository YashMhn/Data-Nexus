"""Regression tests for the Data Nexus API.

Most of these pin down bugs that shipped in the first version: zero-filled
NaNs skewing aggregations, boolean columns vanishing, date columns being
picked as the default category axis, and the whole dataset being serialised
into the upload response.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main  # noqa: E402


@pytest.fixture()
def client() -> TestClient:
    main.store.clear()
    return TestClient(main.app)


def upload(client: TestClient, body: bytes | str, name: str = "data.csv"):
    payload = body.encode() if isinstance(body, str) else body
    return client.post("/api/upload", files={"file": (name, payload, "text/csv")})


def load(client: TestClient, body: bytes | str, name: str = "data.csv") -> dict:
    response = upload(client, body, name)
    assert response.status_code == 200, response.text
    return response.json()


def aggregate(client: TestClient, dataset_id: str, **kwargs) -> dict:
    response = client.post(
        f"/api/datasets/{dataset_id}/aggregate", json=kwargs
    )
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------- basics


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_upload_does_not_return_the_raw_dataset(client: TestClient) -> None:
    rows = "\n".join(f"city{i % 5},{i}" for i in range(20_000))
    response = upload(client, "city,price\n" + rows + "\n")
    assert response.status_code == 200
    body = response.json()
    assert "raw_data" not in body
    # 20k rows of source data must not turn into a multi-megabyte response.
    assert len(response.content) < 50_000


# ---------------------------------------------------- aggregation correctness


def test_missing_values_are_excluded_not_zero_filled(client: TestClient) -> None:
    """The original code ran fillna(0) before grouping, so NY averaged 50."""
    summary = load(client, "city,price\nNY,100\nNY,\nLA,50\n")
    dataset_id = summary["dataset_id"]

    averages = {
        p["name"]: p["value"]
        for p in aggregate(
            client, dataset_id, x="city", y="price", agg="average"
        )["data"]
    }
    assert averages["NY"] == 100.0
    assert averages["LA"] == 50.0

    minimums = {
        p["name"]: p["value"]
        for p in aggregate(client, dataset_id, x="city", y="price", agg="min")["data"]
    }
    assert minimums["NY"] == 100.0


@pytest.mark.parametrize(
    ("agg", "expected"),
    [
        ("sum", {"a": 30.0, "b": 5.0}),
        ("average", {"a": 15.0, "b": 5.0}),
        ("max", {"a": 20.0, "b": 5.0}),
        ("min", {"a": 10.0, "b": 5.0}),
    ],
)
def test_aggregation_methods(client: TestClient, agg: str, expected: dict) -> None:
    summary = load(client, "k,v\na,10\na,20\nb,5\n")
    result = aggregate(
        client, summary["dataset_id"], x="k", y="v", agg=agg
    )
    assert {p["name"]: p["value"] for p in result["data"]} == expected


def test_count_is_rows_per_group(client: TestClient) -> None:
    summary = load(client, "k,v\na,10\na,\nb,5\n")
    result = aggregate(client, summary["dataset_id"], x="k", agg="count")
    assert {p["name"]: p["value"] for p in result["data"]} == {"a": 2.0, "b": 1.0}


def test_group_with_no_numeric_values_is_dropped(client: TestClient) -> None:
    summary = load(client, "k,v\na,10\nb,\n")
    result = aggregate(client, summary["dataset_id"], x="k", y="v", agg="sum")
    assert [p["name"] for p in result["data"]] == ["a"]


def test_missing_category_keys_get_their_own_bucket(client: TestClient) -> None:
    summary = load(client, "k,v\na,10\n,5\n")
    names = {p["name"] for p in aggregate(
        client, summary["dataset_id"], x="k", y="v", agg="sum"
    )["data"]}
    assert names == {"a", "(missing)"}


def test_long_labels_are_not_truncated_into_one_group(client: TestClient) -> None:
    """15/20-char truncation used to merge these two into a single bar."""
    a = "Enterprise Solutions Division North"
    b = "Enterprise Solutions Division South"
    summary = load(client, f"team,v\n{a},1\n{b},2\n")
    result = aggregate(client, summary["dataset_id"], x="team", y="v", agg="sum")
    assert {p["name"] for p in result["data"]} == {a, b}


def test_group_limit_reports_truncation(client: TestClient) -> None:
    rows = "\n".join(f"cat{i},{i}" for i in range(40))
    summary = load(client, "k,v\n" + rows + "\n")
    result = aggregate(client, summary["dataset_id"], x="k", y="v", limit=10)
    assert len(result["data"]) == 10
    assert result["total_groups"] == 40
    assert result["truncated"] is True


# ------------------------------------------------------- column classification


def test_boolean_columns_are_visible(client: TestClient) -> None:
    """Booleans matched neither the object nor the number filter and vanished."""
    summary = load(client, "flag,city,sales\nTrue,NY,10\nFalse,LA,20\n")
    assert "flag" in summary["categorical_columns"]
    result = aggregate(client, summary["dataset_id"], x="flag", y="sales", agg="sum")
    assert {p["name"] for p in result["data"]} == {"True", "False"}


def test_dates_are_temporal_and_not_the_default_category(client: TestClient) -> None:
    summary = load(
        client, "when,city,sales\n2024-01-01,NY,10\n2024-01-02,LA,20\n"
    )
    assert summary["temporal_columns"] == ["when"]
    assert summary["suggested"]["x"] == "city"


def test_numeric_looking_strings_are_not_parsed_as_dates(client: TestClient) -> None:
    summary = load(client, "code,v\n100,1\n200,2\n")
    assert summary["temporal_columns"] == []


def test_id_columns_are_not_suggested(client: TestClient) -> None:
    summary = load(client, "id,user_id,city,revenue\n1,7,NY,10\n2,8,LA,20\n")
    assert summary["suggested"]["y"] == "revenue"
    assert summary["suggested"]["x"] == "city"


def test_high_cardinality_column_is_not_suggested_as_x(client: TestClient) -> None:
    rows = "\n".join(f"person{i},shop{i % 3},{i}" for i in range(30))
    summary = load(client, "who,shop,spend\n" + rows + "\n")
    assert summary["suggested"]["x"] == "shop"


# ------------------------------------------------------------------- spatial


def test_blank_title_column_falls_back_to_row_labels(client: TestClient) -> None:
    """An all-empty column parsed as float and labelled every marker "0.0"."""
    summary = load(client, "lat,lng,name\n10,20,\n11,21,\n")
    titles = [p["title"] for p in summary["spatial"]]
    assert titles == ["Row 0", "Row 1"]


def test_spatial_points_are_detected_and_validated(client: TestClient) -> None:
    summary = load(
        client,
        "latitude,longitude,name\n51.5,-0.09,A\n999,-0.1,B\n51.6,-0.2,C\n",
    )
    assert [p["title"] for p in summary["spatial"]] == ["A", "C"]


def test_no_spatial_columns_yields_empty_list(client: TestClient) -> None:
    assert load(client, "city,v\nNY,1\n")["spatial"] == []


# -------------------------------------------------------------------- scatter


def test_scatter_samples_instead_of_truncating(client: TestClient) -> None:
    rows = "\n".join(f"{i},{i * 2},n{i}" for i in range(1000))
    summary = load(client, "x,y,label\n" + rows + "\n")
    response = client.post(
        f"/api/datasets/{summary['dataset_id']}/scatter",
        json={"x": "x", "y": "y", "label": "label", "limit": 100},
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 100
    assert body["total_points"] == 1000
    assert body["sampled"] is True
    # A sample spans the range; head(100) would stop at x=99.
    assert max(p["x"] for p in body["data"]) > 500


def test_scatter_drops_non_numeric_rows(client: TestClient) -> None:
    summary = load(client, "x,y\n1,2\nnot_a_number,3\n4,5\n")
    response = client.post(
        f"/api/datasets/{summary['dataset_id']}/scatter", json={"x": "x", "y": "y"}
    )
    assert response.status_code == 200
    assert response.json()["total_points"] == 2


# ---------------------------------------------------------- row cap honesty


def test_row_cap_is_reported_not_silent(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(main, "MAX_ANALYSIS_ROWS", 10)
    rows = "\n".join(f"c{i % 3},{i}" for i in range(25))
    summary = load(client, "k,v\n" + rows + "\n")
    metrics = summary["metrics"]
    assert metrics["source_rows"] == 25
    assert metrics["analyzed_rows"] == 10
    assert metrics["truncated"] is True


# ------------------------------------------------------------ input handling


def test_latin1_csv_is_accepted(client: TestClient) -> None:
    summary = load(client, "city,price\nS\xe3o Paulo,10\n".encode("latin-1"))
    result = aggregate(client, summary["dataset_id"], x="city", y="price")
    assert result["data"][0]["name"] == "S\xe3o Paulo"


def test_utf8_bom_is_stripped(client: TestClient) -> None:
    summary = load(client, "﻿city,price\nNY,10\n".encode("utf-8"))
    assert summary["categorical_columns"] == ["city"]


def test_semicolon_delimited_file(client: TestClient) -> None:
    summary = load(client, "city;price\nNY;10\nLA;20\n")
    assert summary["numeric_columns"] == ["price"]


def test_empty_file_is_rejected(client: TestClient) -> None:
    response = upload(client, "")
    assert response.status_code == 400


def test_binary_upload_is_rejected_by_extension(client: TestClient) -> None:
    response = upload(client, b"\x89PNG\r\n\x1a\n" + b"\x00" * 32, name="x.png")
    assert response.status_code == 415


def test_unparseable_text_does_not_leak_internals(client: TestClient) -> None:
    response = upload(client, b"\x00\x01\x02\x03", name="x.csv")
    assert response.status_code == 400
    assert "Traceback" not in response.text
    assert "codec" not in response.text


def test_oversized_upload_is_rejected(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 1024)
    response = upload(client, "k,v\n" + "a,1\n" * 2000)
    assert response.status_code == 413


# --------------------------------------------------------- dataset lifecycle


def test_unknown_dataset_returns_404(client: TestClient) -> None:
    response = client.post(
        "/api/datasets/does-not-exist/aggregate", json={"x": "a", "y": "b"}
    )
    assert response.status_code == 404


def test_unknown_column_returns_400(client: TestClient) -> None:
    summary = load(client, "k,v\na,1\n")
    response = client.post(
        f"/api/datasets/{summary['dataset_id']}/aggregate",
        json={"x": "nope", "y": "v"},
    )
    assert response.status_code == 400


def test_invalid_aggregation_is_rejected(client: TestClient) -> None:
    summary = load(client, "k,v\na,1\n")
    response = client.post(
        f"/api/datasets/{summary['dataset_id']}/aggregate",
        json={"x": "k", "y": "v", "agg": "median"},
    )
    assert response.status_code == 422


def test_delete_removes_the_dataset(client: TestClient) -> None:
    summary = load(client, "k,v\na,1\n")
    dataset_id = summary["dataset_id"]
    assert client.delete(f"/api/datasets/{dataset_id}").status_code == 204
    assert client.delete(f"/api/datasets/{dataset_id}").status_code == 404


def test_store_evicts_beyond_capacity() -> None:
    store = main.DatasetStore(max_items=2, ttl_seconds=3600)
    ids = []
    for _ in range(3):
        dataset = main.Dataset(
            id=main.uuid.uuid4().hex,
            filename="f.csv",
            frame=main.pd.DataFrame({"a": [1]}),
            kinds={"a": "numeric"},
            source_rows=1,
            truncated=False,
        )
        store.put(dataset)
        ids.append(dataset.id)
    assert len(store) == 2
    with pytest.raises(main.HTTPException):
        store.get(ids[0])


def test_store_expires_stale_datasets() -> None:
    store = main.DatasetStore(max_items=4, ttl_seconds=0)
    dataset = main.Dataset(
        id="stale",
        filename="f.csv",
        frame=main.pd.DataFrame({"a": [1]}),
        kinds={"a": "numeric"},
        source_rows=1,
        truncated=False,
    )
    dataset.last_used -= 10
    store.put(dataset)
    with pytest.raises(main.HTTPException):
        store.get("stale")


# ----------------------------------------------------------------------- CORS


def test_cors_does_not_echo_arbitrary_origins(client: TestClient) -> None:
    """allow_origins=["*"] with credentials used to echo any Origin back."""
    response = client.get("/", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers
    assert "access-control-allow-credentials" not in response.headers


def test_cors_allows_the_configured_origin(client: TestClient) -> None:
    response = client.get("/", headers={"Origin": "http://localhost:5173"})
    assert (
        response.headers["access-control-allow-origin"] == "http://localhost:5173"
    )


def test_coordinates_are_not_suggested_as_measures(client: TestClient) -> None:
    """Summing latitudes is noise; price is the measure a user wants."""
    summary = load(
        client,
        "listing_id,neighbourhood,latitude,longitude,price\n"
        "1,NY,40.7,-74.0,120\n2,LA,34.0,-118.2,90\n",
    )
    assert summary["suggested"]["y"] == "price"
    assert summary["suggested"]["scatter_x"] == "price"
    # Still selectable by hand, just not the default.
    assert "latitude" in summary["numeric_columns"]
