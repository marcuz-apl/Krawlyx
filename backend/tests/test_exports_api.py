from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import ROOT_DIR
from app.main import create_app
from tests._helpers import auth_as


def test_list_and_download_exports() -> None:
    export_dir = ROOT_DIR / "data" / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    test_file = export_dir / "Krawlyx_job-999-test_part001.csv"
    test_file.write_text("col1,col2\nval1,val2\n", encoding="utf-8-sig")

    try:
        app = create_app()
        with TestClient(app) as client:
            csrf = auth_as(client, "export_tester", "admin")
            res = client.get("/api/exports", headers={"X-CSRF-Token": csrf})
            assert res.status_code == 200
            files = res.json()
            assert any(f["filename"] == "Krawlyx_job-999-test_part001.csv" for f in files)

            dl_res = client.get(
                "/api/exports/Krawlyx_job-999-test_part001.csv", headers={"X-CSRF-Token": csrf}
            )
            assert dl_res.status_code == 200
            assert "val1,val2" in dl_res.text
    finally:
        if test_file.exists():
            test_file.unlink()
