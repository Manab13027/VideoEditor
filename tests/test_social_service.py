"""Tests for social_service."""
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from backend.services.social_service import (
    _best_category,
    _load_hashtag_db,
    generate_hashtags,
    get_platform_limits,
    get_thumbnail_suggestions,
)


def test_get_platform_limits_returns_all_platforms():
    limits = get_platform_limits()
    assert set(limits.keys()) == {"tiktok", "instagram_reel", "instagram_post", "youtube"}
    for platform, data in limits.items():
        assert "maxFileSizeMB" in data
        assert "maxDurationSeconds" in data
        assert "recommendedWidth" in data
        assert "recommendedHeight" in data


def test_load_hashtag_db_returns_dict_with_categories():
    db = _load_hashtag_db()
    assert isinstance(db, dict)
    assert "travel" in db
    assert "tiktok" in db["travel"]
    assert "instagram" in db["travel"]
    assert len(db["travel"]["tiktok"]) == 30


def test_best_category_matches_keyword():
    db = _load_hashtag_db()
    assert _best_category("travel vlog to Paris", "", db) == "travel"
    assert _best_category("gym workout tips", "", db) == "fitness"
    assert _best_category("funny cat video", "", db) in ("pets", "comedy")


def test_generate_hashtags_no_api_key_uses_local_db():
    results = generate_hashtags(
        title="travel vlog",
        description="exploring Europe",
        platforms=["tiktok", "instagram_reel"],
        api_key=None,
    )
    assert len(results) == 2
    platforms_returned = {r["platform"] for r in results}
    assert platforms_returned == {"tiktok", "instagram_reel"}
    for result in results:
        assert isinstance(result["tags"], list)
        assert len(result["tags"]) > 0
        for tag in result["tags"]:
            assert not tag.startswith("#")  # no # prefix in stored tags


def test_generate_hashtags_respects_max_hashtags_per_platform():
    results = generate_hashtags(
        title="travel vlog",
        description="",
        platforms=["tiktok"],
        api_key=None,
    )
    tiktok_result = next(r for r in results if r["platform"] == "tiktok")
    assert len(tiktok_result["tags"]) <= 30


def test_generate_hashtags_instagram_post_maps_to_instagram_db():
    results = generate_hashtags(
        title="food recipe",
        description="",
        platforms=["instagram_post"],
        api_key=None,
    )
    assert len(results) == 1
    assert results[0]["platform"] == "instagram_post"
    assert len(results[0]["tags"]) > 0


def test_generate_hashtags_api_failure_falls_back_to_local():
    with patch("backend.services.social_service.os.environ.get", return_value=None):
        results = generate_hashtags(
            title="fitness workout",
            description="",
            platforms=["tiktok"],
            api_key=None,
        )
    assert len(results) == 1
    assert len(results[0]["tags"]) > 0
