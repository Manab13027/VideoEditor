"""Tests for media upload endpoint."""
import io

import pytest
from fastapi.testclient import TestClient

from backend.main import app


def _mp4_bytes() -> bytes:
    """Return minimal bytes for a dummy .mp4 upload (content not parsed by upload endpoint)."""
    return b"\x00\x00\x00\x18ftypisom" + b"\x00" * 100


def test_upload_media_file():
    """Upload a dummy .mp4 and expect 200 with correct shape."""
    data = _mp4_bytes()
    with TestClient(app) as client:
        response = client.post(
            "/api/media/upload",
            files={"file": ("test_clip.mp4", io.BytesIO(data), "video/mp4")},
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["filename"] == "test_clip.mp4"
    assert body["media_type"] == "video"
    assert "id" in body
    assert body["id"] is not None


def test_upload_rejects_unsupported_format():
    """Upload a .xyz file and expect 400 with 'unsupported' in detail."""
    with TestClient(app) as client:
        response = client.post(
            "/api/media/upload",
            files={"file": ("bad_file.xyz", io.BytesIO(b"garbage"), "application/octet-stream")},
        )
    assert response.status_code == 400, response.text
    body = response.json()
    assert "unsupported" in body["detail"].lower()
