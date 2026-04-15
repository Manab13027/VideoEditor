"""Tests for batch processing endpoint."""
import pytest
from httpx import AsyncClient, ASGITransport

from backend.main import app


@pytest.mark.asyncio
async def test_start_batch_job_missing_files():
    """POST /api/batch with nonexistent file_ids should return 404."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/batch",
            json={
                "file_ids": ["99999"],
                "operations": [{"type": "compress"}],
            },
        )

    assert response.status_code == 404
    assert "99999" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_batch_status_not_found():
    """GET /api/batch/{job_id}/status for unknown job_id should return 404."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/api/batch/nonexistent-job-id/status")

    assert response.status_code == 404
