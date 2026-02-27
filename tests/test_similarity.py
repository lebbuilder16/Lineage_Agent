"""Unit tests for similarity scoring functions."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from lineage_agent.similarity import (
    _clamp,
    compute_composite_score,
    compute_deployer_score,
    compute_deployer_score_with_operator,
    compute_name_similarity,
    compute_symbol_similarity,
    compute_temporal_score,
)


# ------------------------------------------------------------------
# compute_name_similarity
# ------------------------------------------------------------------

class TestNameSimilarity:
    def test_identical_names(self):
        assert compute_name_similarity("Bonk", "Bonk") == 1.0

    def test_case_insensitive(self):
        assert compute_name_similarity("BONK", "bonk") == 1.0

    def test_whitespace_stripped(self):
        assert compute_name_similarity("  Bonk  ", "Bonk") == 1.0

    def test_empty_string_returns_zero(self):
        assert compute_name_similarity("", "Bonk") == 0.0
        assert compute_name_similarity("Bonk", "") == 0.0
        assert compute_name_similarity("", "") == 0.0

    def test_none_safe(self):
        # The function guards against None with (name or "")
        assert compute_name_similarity(None, "Bonk") == 0.0  # type: ignore
        assert compute_name_similarity("Bonk", None) == 0.0  # type: ignore

    def test_similar_names(self):
        score = compute_name_similarity("Bonk", "Bonk Inu")
        assert 0.4 < score < 0.9

    def test_completely_different(self):
        score = compute_name_similarity("Bonk", "Pepe")
        assert score < 0.5


# ------------------------------------------------------------------
# compute_symbol_similarity
# ------------------------------------------------------------------

class TestSymbolSimilarity:
    def test_identical_symbols(self):
        assert compute_symbol_similarity("BONK", "BONK") == 1.0

    def test_case_insensitive(self):
        assert compute_symbol_similarity("bonk", "BONK") == 1.0

    def test_empty_returns_zero(self):
        assert compute_symbol_similarity("", "BONK") == 0.0
        assert compute_symbol_similarity("BONK", "") == 0.0

    def test_none_safe(self):
        assert compute_symbol_similarity(None, "BONK") == 0.0  # type: ignore

    def test_partial_match(self):
        score = compute_symbol_similarity("BONK", "BON")
        assert 0.5 < score < 1.0


# ------------------------------------------------------------------
# compute_deployer_score
# ------------------------------------------------------------------

class TestDeployerScore:
    def test_same_deployer(self):
        addr = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
        assert compute_deployer_score(addr, addr) == 1.0

    def test_different_deployer(self):
        assert compute_deployer_score("addr_a", "addr_b") == 0.0

    def test_empty_deployer(self):
        assert compute_deployer_score("", "addr_b") == 0.0
        assert compute_deployer_score("addr_a", "") == 0.0
        assert compute_deployer_score("", "") == 0.0


# ------------------------------------------------------------------
# compute_deployer_score_with_operator (async)
# ------------------------------------------------------------------

class TestDeployerScoreWithOperator:
    @pytest.mark.asyncio
    async def test_same_deployer(self):
        addr = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
        assert await compute_deployer_score_with_operator(addr, addr) == 1.0

    @pytest.mark.asyncio
    async def test_empty_deployers(self):
        assert await compute_deployer_score_with_operator("", "addr_b") == 0.0
        assert await compute_deployer_score_with_operator("addr_a", "") == 0.0

    @pytest.mark.asyncio
    async def test_different_deployers_no_mapping(self, monkeypatch):
        """Without operator mapping data, returns 0.0."""
        from lineage_agent import similarity
        from unittest.mock import AsyncMock

        mock_query = AsyncMock(return_value=[])
        monkeypatch.setattr(
            "lineage_agent.similarity.compute_deployer_score_with_operator.__module__",
            "lineage_agent.similarity",
        )
        # Patch the import inside the function
        import lineage_agent.data_sources._clients as clients
        monkeypatch.setattr(clients, "operator_mapping_query_by_wallet", mock_query)
        result = await compute_deployer_score_with_operator("addr_a", "addr_b")
        assert result == 0.0

    @pytest.mark.asyncio
    async def test_linked_wallets_partial_credit(self, monkeypatch):
        """Shared fingerprint → 0.8 partial credit."""
        from unittest.mock import AsyncMock

        mock_query = AsyncMock(return_value=[
            {"fingerprint": "abcd1234", "wallet": "addr_a"},
            {"fingerprint": "abcd1234", "wallet": "addr_b"},
        ])
        import lineage_agent.data_sources._clients as clients
        monkeypatch.setattr(clients, "operator_mapping_query_by_wallet", mock_query)
        result = await compute_deployer_score_with_operator("addr_a", "addr_b")
        assert result == 0.8


# ------------------------------------------------------------------
# compute_temporal_score
# ------------------------------------------------------------------

class TestTemporalScore:
    def test_both_none(self):
        assert compute_temporal_score(None, None) == 0.5

    def test_one_none(self):
        now = datetime.now(tz=timezone.utc)
        assert compute_temporal_score(now, None) == 0.5
        assert compute_temporal_score(None, now) == 0.5

    def test_same_timestamp(self):
        now = datetime.now(tz=timezone.utc)
        assert compute_temporal_score(now, now) == 0.5

    def test_a_older_scores_high(self):
        now = datetime.now(tz=timezone.utc)
        older = now - timedelta(days=60)
        score = compute_temporal_score(older, now)
        assert score > 0.75  # 90-day window: 0.5 + 0.5*(60/90) ≈ 0.833

    def test_a_newer_scores_low(self):
        now = datetime.now(tz=timezone.utc)
        newer = now + timedelta(days=60)
        score = compute_temporal_score(newer, now)
        assert score < 0.25  # 90-day window: 0.5 - 0.5*(60/90) ≈ 0.167

    def test_small_diff(self):
        now = datetime.now(tz=timezone.utc)
        slightly_older = now - timedelta(days=5)
        score = compute_temporal_score(slightly_older, now)
        assert 0.5 < score < 0.9


# ------------------------------------------------------------------
# compute_composite_score
# ------------------------------------------------------------------

class TestCompositeScore:
    def test_equal_weights(self):
        scores = {"a": 1.0, "b": 0.0}
        weights = {"a": 1.0, "b": 1.0}
        assert compute_composite_score(scores, weights) == pytest.approx(0.5)

    def test_single_dimension(self):
        scores = {"a": 0.8}
        weights = {"a": 1.0}
        assert compute_composite_score(scores, weights) == pytest.approx(0.8)

    def test_missing_score_key_treated_as_zero(self):
        scores = {"a": 1.0}
        weights = {"a": 0.5, "b": 0.5}
        assert compute_composite_score(scores, weights) == pytest.approx(0.5)

    def test_zero_weights(self):
        scores = {"a": 1.0}
        weights = {"a": 0.0}
        assert compute_composite_score(scores, weights) == 0.0

    def test_real_weights(self):
        scores = {
            "name": 0.9,
            "symbol": 1.0,
            "image": 0.8,
            "deployer": 1.0,
            "temporal": 0.6,
        }
        weights = {
            "name": 0.25,
            "symbol": 0.15,
            "image": 0.25,
            "deployer": 0.20,
            "temporal": 0.15,
        }
        expected = (
            0.9 * 0.25 + 1.0 * 0.15 + 0.8 * 0.25 + 1.0 * 0.20 + 0.6 * 0.15
        ) / 1.0
        assert compute_composite_score(scores, weights) == pytest.approx(
            expected
        )


# ------------------------------------------------------------------
# _clamp
# ------------------------------------------------------------------

class TestClamp:
    def test_within_range(self):
        assert _clamp(0.5, 0.0, 1.0) == 0.5

    def test_below_min(self):
        assert _clamp(-5.0, 0.0, 1.0) == 0.0

    def test_above_max(self):
        assert _clamp(99.0, 0.0, 1.0) == 1.0

    def test_at_boundaries(self):
        assert _clamp(0.0, 0.0, 1.0) == 0.0
        assert _clamp(1.0, 0.0, 1.0) == 1.0
