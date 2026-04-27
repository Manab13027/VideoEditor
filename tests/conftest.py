"""Shared pytest configuration and fixtures."""
import sys
from unittest.mock import MagicMock

# Stub out optional heavy dependencies that may not be installed in the test environment
for _mod in ("librosa", "librosa.effects", "librosa.beat", "soundfile", "numpy", "numpy.core", "ffmpeg"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()
