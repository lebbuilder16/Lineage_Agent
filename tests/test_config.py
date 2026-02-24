"""Tests for config.py validation helpers (_parse_float, _parse_int)."""

from __future__ import annotations

import os
from unittest.mock import patch



class TestParseFloat:
    """Tests for _parse_float env var parser."""

    def test_default_value(self):
        """Should return default when env var is not set."""
        from config import _parse_float

        with patch.dict(os.environ, {}, clear=False):
            # Use internal name not actually set in env
            result = _parse_float("__TEST_FLOAT_UNSET__", "0.5", low=0.0, high=1.0)
        assert result == 0.5

    def test_valid_env_value(self):
        """Should parse a valid env var value."""
        from config import _parse_float

        with patch.dict(os.environ, {"__TEST_FLOAT__": "0.7"}):
            result = _parse_float("__TEST_FLOAT__", "0.5", low=0.0, high=1.0)
        assert result == 0.7

    def test_clamps_high(self):
        """Should clamp values above high bound."""
        from config import _parse_float

        with patch.dict(os.environ, {"__TEST_FLOAT__": "1.5"}):
            result = _parse_float("__TEST_FLOAT__", "0.5", low=0.0, high=1.0)
        assert result == 1.0

    def test_clamps_low(self):
        """Should clamp values below low bound."""
        from config import _parse_float

        with patch.dict(os.environ, {"__TEST_FLOAT__": "-0.5"}):
            result = _parse_float("__TEST_FLOAT__", "0.5", low=0.0, high=1.0)
        assert result == 0.0

    def test_invalid_value_falls_back(self):
        """Should fall back to default on invalid input."""
        from config import _parse_float

        with patch.dict(os.environ, {"__TEST_FLOAT__": "not_a_number"}):
            result = _parse_float("__TEST_FLOAT__", "0.5", low=0.0, high=1.0)
        assert result == 0.5


class TestParseInt:
    """Tests for _parse_int env var parser."""

    def test_default_value(self):
        """Should return default when env var is not set."""
        from config import _parse_int

        with patch.dict(os.environ, {}, clear=False):
            result = _parse_int("__TEST_INT_UNSET__", "10", minimum=1)
        assert result == 10

    def test_valid_env_value(self):
        """Should parse a valid env var value."""
        from config import _parse_int

        with patch.dict(os.environ, {"__TEST_INT__": "25"}):
            result = _parse_int("__TEST_INT__", "10", minimum=1)
        assert result == 25

    def test_clamps_below_minimum(self):
        """Should clamp values below minimum."""
        from config import _parse_int

        with patch.dict(os.environ, {"__TEST_INT__": "0"}):
            result = _parse_int("__TEST_INT__", "10", minimum=1)
        assert result == 1

    def test_invalid_value_falls_back(self):
        """Should fall back to default on invalid input."""
        from config import _parse_int

        with patch.dict(os.environ, {"__TEST_INT__": "abc"}):
            result = _parse_int("__TEST_INT__", "10", minimum=1)
        assert result == 10
