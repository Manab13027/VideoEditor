"""Integration tests for /api/social endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_hashtags_missing_title_returns_422():
    resp = client.post("/api/social/hashtags", json={"title": "", "platforms": ["tiktok"]})
    assert resp.status_code == 422


def test_hashtags_missing_platforms_returns_422():
    resp = client.post("/api/social/hashtags", json={"title": "travel vlog", "platforms": []})
    assert resp.status_code == 422


def test_hashtags_local_fallback_returns_results():
    resp = client.post("/api/social/hashtags", json={
        "title": "travel vlog adventure",
        "description": "exploring Asia",
        "platforms": ["tiktok", "instagram_reel"],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert len(data["results"]) == 2
    for result in data["results"]:
        assert "platform" in result
        assert "tags" in result
        assert len(result["tags"]) > 0


def test_limits_returns_all_platforms():
    resp = client.get("/api/social/limits")
    assert resp.status_code == 200
    data = resp.json()
    assert "tiktok" in data
    assert "instagram_reel" in data
    assert "instagram_post" in data
    assert "youtube" in data


def test_thumbnail_missing_media_returns_404():
    resp = client.get("/api/social/thumbnail/99999?timestamp=1.0")
    assert resp.status_code == 404


def test_multi_export_missing_platforms_returns_422():
    resp = client.post("/api/social/multi-export", json={
        "project_id": "nonexistent", "platforms": []
    })
    assert resp.status_code == 422


def test_multi_export_unknown_platform_returns_422():
    resp = client.post("/api/social/multi-export", json={
        "project_id": "test", "platforms": ["snapchat"]
    })
    assert resp.status_code == 422
