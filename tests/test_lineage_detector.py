"""Unit tests for lineage_detector internal helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from lineage_agent.lineage_detector import (
    _ScoredCandidate,
    _compute_confidence,
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
