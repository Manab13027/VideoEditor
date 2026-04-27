"""Tests for media router crop-new endpoint."""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_crop_new_returns_404_for_missing_media():
    response = client.post("/api/media/99999/crop-new", json={"x": 0, "y": 0, "w": 100, "h": 100})
    assert response.status_code == 404
