"""Tests for custom schema extractor, saved datasets, and multi-job merge API."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.engines.extractors import extract_structured_data
from app.main import create_app
from app.models import EngineInstance, Job, JobResult, Target, User
from tests._helpers import auth_as


def test_custom_schema_extractor():
    """Verify custom schema extractor extracts up to 10 user-defined fields and selectors."""
    sample_html = """
    <html>
      <body>
        <div class="product-card">
          <h2 class="title">Wireless Headphones</h2>
          <span class="price">$199.99</span>
          <span class="rating">4.8</span>
          <a class="buy-link" href="/products/headphones">Buy Now</a>
        </div>
        <div class="product-card">
          <h2 class="title">Mechanical Keyboard</h2>
          <span class="price">$149.50</span>
          <span class="rating">4.9</span>
          <a class="buy-link" href="/products/keyboard">Buy Now</a>
        </div>
      </body>
    </html>
    """

    custom_schema = {
        "item_selector": ".product-card",
        "fields": [
            {"name": "Product Name", "selector": "h2.title", "attribute": "text"},
            {"name": "Price", "selector": ".price", "attribute": "text"},
            {"name": "Rating", "selector": ".rating", "attribute": "text"},
            {"name": "Link", "selector": "a.buy-link", "attribute": "href"},
        ],
    }

    items = extract_structured_data(
        html=sample_html,
        source_url="https://example.com/shop",
        options={"custom_schema": custom_schema},
    )

    assert len(items) == 2
    assert items[0]["Product Name"] == "Wireless Headphones"
    assert items[0]["Price"] == "$199.99"
    assert items[0]["Rating"] == "4.8"
    assert items[0]["Link"] == "https://example.com/products/headphones"

    assert items[1]["Product Name"] == "Mechanical Keyboard"
    assert items[1]["Price"] == "$149.50"
    assert items[1]["Link"] == "https://example.com/products/keyboard"


def test_datasets_crud():
    """Test creating, listing, viewing, exporting, and deleting saved datasets."""
    with TestClient(create_app()) as client:
        csrf = auth_as(client, "admin_user_ds", "admin")
        headers = {"X-CSRF-Token": csrf}

        # 1. Create dataset
        res = client.post(
            "/api/datasets",
            json={
                "name": "E-Commerce Electronics",
                "description": "Test electronics dataset",
                "columns": ["Product Name", "Price", "Rating"],
            },
            headers=headers,
        )
        assert res.status_code == 201
        d_id = res.json()["id"]
        assert res.json()["name"] == "E-Commerce Electronics"

        # 2. List datasets
        res = client.get("/api/datasets", headers=headers)
        assert res.status_code == 200
        names = [d["name"] for d in res.json()]
        assert "E-Commerce Electronics" in names

        # 3. Get dataset detail
        res = client.get(f"/api/datasets/{d_id}", headers=headers)
        assert res.status_code == 200
        assert res.json()["name"] == "E-Commerce Electronics"

        # 4. Export CSV
        res = client.get(f"/api/datasets/{d_id}/export.csv", headers=headers)
        assert res.status_code == 200
        assert "text/csv" in res.headers["content-type"]

        # 5. Delete dataset
        res = client.delete(f"/api/datasets/{d_id}", headers=headers)
        assert res.status_code == 204


def test_multi_job_merge_and_save_dataset():
    """Test merging results from multiple jobs and saving as a dataset."""
    from app.core.db import SessionLocal

    with TestClient(create_app()) as client:
        csrf = auth_as(client, "admin_user_merge", "admin")
        headers = {"X-CSRF-Token": csrf}

        with SessionLocal() as db_session:
            user = db_session.scalars(
                select(User).where(User.username == "admin_user_merge")
            ).first()
            assert user is not None

            # Create dummy engine and jobs
            engine = EngineInstance(name="TestEngine", type="crawl4ai", pooled=True)
            db_session.add(engine)
            db_session.flush()

            # Job 1
            j1 = Job(engine_id=engine.id, created_by_id=user.id, status="completed")
            db_session.add(j1)
            db_session.flush()
            t1 = Target(job_id=j1.id, url="https://example.com/page1", status="done")
            db_session.add(t1)
            db_session.flush()
            r1 = JobResult(
                target_id=t1.id,
                http_status=200,
                content_text="page 1",
                metadata_json={
                    "items": [
                        {
                            "make": "Ford",
                            "model": "F-150",
                            "year": "2022",
                            "price": 45000,
                            "listing_url": "https://example.com/car1",
                        },
                        {
                            "make": "Ford",
                            "model": "Explorer",
                            "year": "2021",
                            "price": 38000,
                            "listing_url": "https://example.com/car2",
                        },
                    ]
                },
            )
            db_session.add(r1)

            # Job 2
            j2 = Job(engine_id=engine.id, created_by_id=user.id, status="completed")
            db_session.add(j2)
            db_session.flush()
            t2 = Target(job_id=j2.id, url="https://example.com/page2", status="done")
            db_session.add(t2)
            db_session.flush()
            r2 = JobResult(
                target_id=t2.id,
                http_status=200,
                content_text="page 2",
                metadata_json={
                    "items": [
                        {
                            "make": "Toyota",
                            "model": "RAV4",
                            "year": "2023",
                            "price": 35000,
                            "listing_url": "https://example.com/car3",
                        },
                    ]
                },
            )
            db_session.add(r2)
            db_session.commit()
            j1_id = j1.id
            j2_id = j2.id

        # Test merge endpoint
        res = client.post("/api/jobs/merge", json={"job_ids": [j1_id, j2_id]}, headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["total_rows"] == 3
        assert "make" in data["columns"]
        assert "model" in data["columns"]

        # Test merge CSV export
        res = client.post(
            "/api/jobs/merge/export.csv", json={"job_ids": [j1_id, j2_id]}, headers=headers
        )
        assert res.status_code == 200
        assert "text/csv" in res.headers["content-type"]
        assert "F-150" in res.text
        assert "RAV4" in res.text

        # Test saving merged jobs into a new dataset
        res = client.post(
            "/api/datasets",
            json={
                "name": "Merged Vehicle Inventory",
                "source_job_ids": [j1_id, j2_id],
            },
            headers=headers,
        )
        assert res.status_code == 201
        d_data = res.json()
        assert d_data["row_count"] == 3

        # View dataset
        res = client.get(f"/api/datasets/{d_data['id']}", headers=headers)
        assert res.status_code == 200
        assert len(res.json()["rows"]) == 3

        # Test splitting dataset by 'make'
        split_res = client.post(
            f"/api/datasets/{d_data['id']}/split",
            json={"attribute": "make"},
            headers=headers,
        )
        assert split_res.status_code == 201
        split_data = split_res.json()
        assert split_data["source_dataset_id"] == d_data["id"]
        assert split_data["total_rows_split"] == 3
        # Should have split into 2 datasets: Ford (2 rows) and Toyota (1 row)
        created = split_data["created_datasets"]
        assert len(created) == 2
        makes = {c["key"]: c["row_count"] for c in created}
        assert makes["Ford"] == 2
        assert makes["Toyota"] == 1
