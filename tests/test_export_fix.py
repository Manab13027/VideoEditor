import pytest
from backend.services.export_service import resolve_export_settings


def test_int_bitrate_formatted_as_string():
    settings = resolve_export_settings(bitrate=8)
    assert settings["bitrate"] == "8M"


def test_none_bitrate_uses_default():
    settings = resolve_export_settings(bitrate=None)
    assert settings["bitrate"] == "5M"


def test_preset_overrides_bitrate():
    settings = resolve_export_settings(preset="youtube", bitrate=8)
    assert settings["bitrate"] == "8M"
