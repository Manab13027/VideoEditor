"""Tests for project CRUD endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


def test_create_project():
    """POST /api/projects creates a project with empty timeline."""
    with TestClient(app) as client:
        response = client.post("/api/projects", json={"name": "My Project"})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "My Project"
    assert "id" in body
    assert body["id"] is not None
    assert body["timeline"]["clips"] == []
    assert body["timeline"]["overlays"] == []
    assert body["timeline"]["mode"] == "storyboard"


def test_get_project():
    """Create then GET returns the same project."""
    with TestClient(app) as client:
        create_resp = client.post("/api/projects", json={"name": "Fetch Me"})
        assert create_resp.status_code == 201
        project_id = create_resp.json()["id"]

        get_resp = client.get(f"/api/projects/{project_id}")
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["name"] == "Fetch Me"


def test_get_nonexistent_project():
    """GET with a fake id returns 404."""
    with TestClient(app) as client:
        response = client.get("/api/projects/999999")
    assert response.status_code == 404


def test_update_project_name():
    """Create then PUT new name, verify updated."""
    with TestClient(app) as client:
        create_resp = client.post("/api/projects", json={"name": "Old Name"})
        assert create_resp.status_code == 201
        project_id = create_resp.json()["id"]

        put_resp = client.put(f"/api/projects/{project_id}", json={"name": "New Name"})
        assert put_resp.status_code == 200, put_resp.text
        assert put_resp.json()["name"] == "New Name"


def test_delete_project():
    """Create then DELETE, verify subsequent GET returns 404."""
    with TestClient(app) as client:
        create_resp = client.post("/api/projects", json={"name": "To Delete"})
        assert create_resp.status_code == 201
        project_id = create_resp.json()["id"]

        del_resp = client.delete(f"/api/projects/{project_id}")
        assert del_resp.status_code == 204, del_resp.text

        get_resp = client.get(f"/api/projects/{project_id}")
        assert get_resp.status_code == 404
