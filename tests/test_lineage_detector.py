"""Unit tests for lineage_detector internal helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from lineage_agent.lineage_detector import (
    _ScoredCandidate,
    _compute_confidence,
    _parse_datetime,
    _select_root,
)
from lineage_agent.models import SimilarityEvidence


def _make_candidate(
    mint: str = "mint",
    created_at=None,
    liquidity_usd=0.0,
    market_cap_usd=0.0,
    composite=0.5,
) -> _ScoredCandidate:
    return _ScoredCandidate(
        mint=mint,
        name=mint,
        symbol=mint[:4].upper(),
        image_uri="",
        deployer="",
        created_at=created_at,
        market_cap_usd=market_cap_usd,
        liquidity_usd=liquidity_usd,
        evidence=SimilarityEvidence(composite_score=composite),
        composite=composite,
    )


class TestSelectRoot:
    def test_single_candidate(self):
        c = _make_candidate("only")
        root = _select_root([c])
        assert root.mint == "only"

    def test_oldest_wins(self):
        now = datetime.now(tz=timezone.utc)
        old = _make_candidate("old", created_at=now - timedelta(days=90))
        new = _make_candidate("new", created_at=now)
        root = _select_root([new, old])
        assert root.mint == "old"

    def test_liquidity_tiebreak(self):
        now = datetime.now(tz=timezone.utc)
        a = _make_candidate("low_liq", created_at=now, liquidity_usd=100)
        b = _make_candidate("high_liq", created_at=now, liquidity_usd=999999)
        root = _select_root([a, b])
        assert root.mint == "high_liq"

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            _select_root([])


class TestComputeConfidence:
    def test_no_others(self):
        root = _make_candidate("root")
        assert _compute_confidence(root, []) == 1.0

    def test_returns_between_zero_and_one(self):
        now = datetime.now(tz=timezone.utc)
        root = _make_candidate("root", created_at=now - timedelta(days=30))
        others = [
            _make_candidate(
                f"d{i}",
                created_at=now - timedelta(days=i),
                liquidity_usd=1000 * i,
                composite=0.5,
            )
            for i in range(5)
        ]
        conf = _compute_confidence(root, others)
        assert 0.0 <= conf <= 1.0

    def test_high_ambiguity_lowers_confidence(self):
        now = datetime.now(tz=timezone.utc)
        root = _make_candidate("root", created_at=now - timedelta(days=1))
        # All high-composite candidates
        others = [
            _make_candidate(
                f"d{i}",
                created_at=now,
                composite=0.95,
            )
            for i in range(10)
        ]
        conf = _compute_confidence(root, others)
        # With many highly similar candidates, confidence should be moderate/low
        assert conf < 0.8


class TestParseDatetime:
    """Unit tests for the _parse_datetime helper."""

    def test_none_returns_none(self):
        assert _parse_datetime(None) is None

    def test_datetime_passthrough(self):
        now = datetime.now(tz=timezone.utc)
        assert _parse_datetime(now) is now

    def test_iso_string(self):
        dt = _parse_datetime("2025-01-29T23:34:00+00:00")
        assert dt is not None
        assert dt.year == 2025 and dt.month == 1 and dt.day == 29

    def test_iso_string_naive_becomes_utc(self):
        dt = _parse_datetime("2025-01-29T23:34:00")
        assert dt is not None
        assert dt.tzinfo is not None

    def test_integer_unix_seconds(self):
        """Helius DAS returns token_info.created_at as a Unix int — must parse."""
        # 2025-01-29 23:34:00 UTC → 1738193640
        ts = 1738193640
        dt = _parse_datetime(ts)
        assert dt is not None
        assert dt.tzinfo is not None
        assert dt.year == 2025 and dt.month == 1 and dt.day == 29

    def test_float_unix_seconds(self):
        dt = _parse_datetime(1738193640.0)
        assert dt is not None
        assert dt.year == 2025

    def test_invalid_string_returns_none(self):
        assert _parse_datetime("not-a-date") is None

    def test_unknown_type_returns_none(self):
        assert _parse_datetime(["2025-01-01"]) is None


class TestSelectRootPreMintScenario:
    """Regression tests for the jelly-my-jelly root-inversion bug.

    Scenario: a copycat token (6qoH) was pre-minted on Jan 29 (before the viral
    PumpFun token FeR8 launched at 23:34 UTC), but only added real liquidity on
    Jan 30.  After the fixes:
    - candidates get created_at = max(DAS_mint_date, pair_created_at)
    - pairs_to_search_results uses the highest-liq pool date (not earliest)
    So 6qoH's effective date = Jan 30, and FeR8 (Jan 29 23:34) wins as root.
    """

    def test_pre_minted_copycat_not_chosen_as_root(self):
        """FeR8-style token (Jan 29 23:34) beats pre-minted 6qoH-style (Jan 30)."""
        jan_29_2334 = datetime(2025, 1, 29, 23, 34, tzinfo=timezone.utc)
        jan_30_1531 = datetime(2025, 1, 30, 15, 31, tzinfo=timezone.utc)

        # Query token: PumpFun launch (viral), first-traded Jan 29 23:34
        pumpfun = _make_candidate(
            "FeR8_pumpfun",
            created_at=jan_29_2334,
            liquidity_usd=4_370_000,
        )
        # Copycat: pre-minted before viral moment but listed on Jan 30
        # After fix, its effective created_at = Jan 30 (DexScreener listing date)
        copycat = _make_candidate(
            "6qoH_meteora",
            created_at=jan_30_1531,
            liquidity_usd=133_900_000,
        )
        root = _select_root([pumpfun, copycat])
        assert root.mint == "FeR8_pumpfun", (
            "The first-traded token should be root even if the copycat has "
            "higher liquidity and was pre-minted earlier on-chain"
        )

    def test_higher_liquidity_wins_on_timestamp_tie(self):
        """When both tokens were first-traded the same day, higher liq wins."""
        same_day = datetime(2025, 1, 30, tzinfo=timezone.utc)
        low_liq = _make_candidate("low", created_at=same_day, liquidity_usd=5_000_000)
        high_liq = _make_candidate("high", created_at=same_day, liquidity_usd=133_000_000)
        root = _select_root([low_liq, high_liq])
        assert root.mint == "high"

    def test_none_created_at_loses_to_dated_token(self):
        """Tokens with no creation date are never chosen over dated ones."""
        dated = _make_candidate("dated", created_at=datetime(2025, 1, 29, tzinfo=timezone.utc))
        undated = _make_candidate("undated", created_at=None, liquidity_usd=999_999_999)
        root = _select_root([undated, dated])
        assert root.mint == "dated"
