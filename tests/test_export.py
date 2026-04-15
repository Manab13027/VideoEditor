"""Tests for export endpoint and export service."""
import pytest
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.services.export_service import resolve_export_settings


@pytest.mark.asyncio
async def test_export_nonexistent_project():
    """POST export with fake project_id → 200 (job starts async, fails later)."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/export",
            json={"project_id": "99999"},
        )

    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["status"] == "processing"


@pytest.mark.asyncio
async def test_export_status_not_found():
    """GET /api/export/{job_id}/status for unknown job_id → 404."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/api/export/nonexistent-export-job-id/status")

    assert response.status_code == 404


def test_resolve_export_settings_preset():
    """Social presets return correct dimensions."""
    youtube = resolve_export_settings(preset="youtube")
    assert youtube["width"] == 1920
    assert youtube["height"] == 1080

    tiktok = resolve_export_settings(preset="tiktok")
    assert tiktok["width"] == 1080
    assert tiktok["height"] == 1920


def test_resolve_export_settings_quality_tier():
    """Quality tiers return correct dimensions and bitrates."""
    hd = resolve_export_settings(quality_tier="hd")
    assert hd["width"] == 1280
    assert hd["height"] == 720
    assert hd["bitrate"] == "5M"

    four_k = resolve_export_settings(quality_tier="4k")
    assert four_k["width"] == 3840
    assert four_k["height"] == 2160
