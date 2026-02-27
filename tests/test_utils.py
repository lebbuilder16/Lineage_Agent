"""Unit tests for lineage_agent.utils — parse_datetime & classify_narrative."""

from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest

from lineage_agent.utils import classify_narrative, parse_datetime, NARRATIVE_TAXONOMY


# ===================================================================
# parse_datetime
# ===================================================================

class TestParseDatetime:
    """Exhaustive coverage for the unified datetime parser."""

    # -- None / missing --
    def test_none_returns_none(self):
        assert parse_datetime(None) is None

    # -- datetime pass-through --
    def test_aware_datetime_passthrough(self):
        dt = datetime(2024, 1, 15, 12, 0, tzinfo=timezone.utc)
        result = parse_datetime(dt)
        assert result is dt  # exact same object

    def test_naive_datetime_gets_utc(self):
        dt = datetime(2024, 1, 15, 12, 0)
        result = parse_datetime(dt)
        assert result is not None
        assert result.tzinfo == timezone.utc
        assert result.year == 2024

    # -- string inputs --
    def test_iso_string(self):
        result = parse_datetime("2024-06-01T10:30:00+00:00")
        assert result is not None
        assert result.year == 2024
        assert result.month == 6
        assert result.tzinfo is not None

    def test_iso_string_z_suffix(self):
        result = parse_datetime("2024-06-01T10:30:00Z")
        assert result is not None
        assert result.minute == 30
        assert result.tzinfo is not None

    def test_iso_string_no_tz(self):
        result = parse_datetime("2024-06-01T10:30:00")
        assert result is not None
        assert result.tzinfo == timezone.utc

    def test_malformed_string_returns_none(self):
        assert parse_datetime("not-a-date") is None
        assert parse_datetime("") is None

    # -- numeric timestamps --
    def test_int_epoch(self):
        result = parse_datetime(1717236600)  # 2024-06-01 10:30 UTC
        assert result is not None
        assert result.year == 2024
        assert result.tzinfo == timezone.utc

    def test_float_epoch(self):
        result = parse_datetime(1717236600.123)
        assert result is not None
        assert result.tzinfo == timezone.utc

    def test_zero_epoch(self):
        result = parse_datetime(0)
        assert result is not None
        assert result.year == 1970

    def test_negative_epoch(self):
        result = parse_datetime(-1)
        assert result is not None
        assert result.year == 1969

    # -- unsupported types --
    def test_list_returns_none(self):
        assert parse_datetime([1, 2, 3]) is None

    def test_dict_returns_none(self):
        assert parse_datetime({"ts": 123}) is None

    def test_bool_treated_as_int(self):
        # bool is subclass of int in Python; True == 1 → epoch 1
        result = parse_datetime(True)
        assert result is not None  # acceptable edge case

    # -- overflow protection --
    def test_huge_int_returns_none(self):
        assert parse_datetime(10**20) is None


# ===================================================================
# classify_narrative
# ===================================================================

class TestClassifyNarrative:
    """Coverage for unified narrative classification."""

    # -- Exact keyword matches --
    @pytest.mark.parametrize(
        "name,symbol,expected",
        [
            ("Baby Pepe", "BPEPE", "pepe"),
            ("Doge Moon", "DOGE", "doge"),
            ("Shiba Inu", "SHIB", "inu"),
            ("AI Agent Token", "AIBOT", "ai"),
            ("Trump Coin", "MAGA", "trump"),
            ("ElonMusk Token", "ELON", "elon"),
            ("Cat Coin", "MEOW", "cat"),
            ("Senpoi Token", "CHAN", "anime"),  # 'chan' keyword for anime
            ("GigaChad Token", "SIGMA", "wojak"),
            ("Solana Meme", "SOL", "sol"),
            ("Moon Shot", "LUNA", "moon"),
            ("Baby Token", "MINI", "baby"),
            ("Ape Token", "APE", "ape"),
            ("Dragon Fire", "DRGN", "dragon"),
            ("Bear Market", "BEAR", "bear"),
            ("HawkTuah Coin", "HAWK", "hawk"),
            ("Pomni Token", "POMNI", "pomni"),
            ("Rot Token", "ROT", "brain"),  # 'rot' keyword for brain category
            ("Skibidi Toilet", "SKIB", "skibidi"),
            ("GOAT Token", "GOAT", "goat"),
            ("Peanut Squirrel", "PNUT", "pnut"),
            ("Biden Token", "BDEN", "biden"),
        ],
    )
    def test_keyword_categories(self, name, symbol, expected):
        assert classify_narrative(name, symbol) == expected

    # -- Fallback --
    def test_no_match_returns_other(self):
        assert classify_narrative("Random Token", "RND") == "other"

    # -- Case insensitivity --
    def test_case_insensitive(self):
        assert classify_narrative("PEPE", "X") == "pepe"
        assert classify_narrative("x", "PEPE") == "pepe"

    # -- Empty strings --
    def test_empty_returns_other(self):
        assert classify_narrative("", "") == "other"

    # -- Symbol-only match --
    def test_symbol_only_match(self):
        assert classify_narrative("Generic Token", "DOGE") == "doge"

    # -- First match wins (order matters) --
    def test_first_match_wins(self):
        # "pepe" and "frog" are both in the "pepe" category
        result = classify_narrative("Pepe Frog", "KEK")
        assert result == "pepe"

    # -- NARRATIVE_TAXONOMY sanity --
    def test_taxonomy_has_expected_categories(self):
        """Ensure all 22 documented categories exist."""
        expected = {
            "pepe", "doge", "inu", "ai", "trump", "elon", "cat", "anime",
            "wojak", "sol", "moon", "baby", "ape", "dragon", "bear", "hawk",
            "pomni", "brain", "skibidi", "goat", "pnut", "biden",
        }
        assert set(NARRATIVE_TAXONOMY.keys()) == expected

    def test_taxonomy_values_are_lists(self):
        for cat, keywords in NARRATIVE_TAXONOMY.items():
            assert isinstance(keywords, list), f"{cat} should have a list of keywords"
            assert len(keywords) > 0, f"{cat} should have at least one keyword"
