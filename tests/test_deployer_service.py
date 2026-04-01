"""Unit tests for lineage_agent.deployer_service.

Covers:
- _is_confirmed_rug (pure helper)
- compute_deployer_profile (cache hierarchy, edge cases)
- _build_profile (DB-backed computation)
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lineage_agent.deployer_service import (
    _is_confirmed_rug,
    compute_deployer_profile,
    _build_profile,
    _profile_cache,
)


# ---------------------------------------------------------------------------
# _is_confirmed_rug — pure function
# ---------------------------------------------------------------------------

class TestIsConfirmedRug:
    def test_no_mechanism_returns_true(self):
        assert _is_confirmed_rug({}) is True
        assert _is_confirmed_rug({"rug_mechanism": ""}) is True
        assert _is_confirmed_rug({"rug_mechanism": None}) is True

    def test_dex_liquidity_rug_strong_is_confirmed(self):
        row = {"rug_mechanism": "dex_liquidity_rug", "evidence_level": "strong"}
        assert _is_confirmed_rug(row) is True

    def test_dex_liquidity_rug_moderate_is_confirmed(self):
        row = {"rug_mechanism": "dex_liquidity_rug", "evidence_level": "moderate"}
        assert _is_confirmed_rug(row) is True

    def test_dex_liquidity_rug_weak_is_not_confirmed(self):
        row = {"rug_mechanism": "dex_liquidity_rug", "evidence_level": "weak"}
        assert _is_confirmed_rug(row) is False

    def test_pre_dex_extraction_rug_strong(self):
        row = {"rug_mechanism": "pre_dex_extraction_rug", "evidence_level": "strong"}
        assert _is_confirmed_rug(row) is True

    def test_incompatible_mechanism_returns_false(self):
        row = {"rug_mechanism": "market_dump", "evidence_level": "strong"}
        assert _is_confirmed_rug(row) is False

    def test_dead_token_returns_false(self):
        row = {"rug_mechanism": "dead_token", "evidence_level": "moderate"}
        assert _is_confirmed_rug(row) is False

    def test_compatible_mechanism_no_evidence_returns_true(self):
        row = {"rug_mechanism": "dex_liquidity_rug"}
        assert _is_confirmed_rug(row) is True

    def test_whitespace_stripped(self):
        row = {"rug_mechanism": " dex_liquidity_rug ", "evidence_level": " strong "}
        assert _is_confirmed_rug(row) is True


# ---------------------------------------------------------------------------
# compute_deployer_profile — public API
# ---------------------------------------------------------------------------

class TestComputeDeployerProfile:
    @pytest.fixture(autouse=True)
    def clear_cache(self):
        _profile_cache.clear()
        yield
        _profile_cache.clear()

    async def test_empty_deployer_returns_none(self):
        result = await compute_deployer_profile("")
        assert result is None

    async def test_none_deployer_returns_none(self):
        result = await compute_deployer_profile(None)  # type: ignore[arg-type]
        assert result is None

    async def test_l1_cache_hit(self):
        """In-process cache should return cached profile without DB query."""
        mock_profile = MagicMock()
        _profile_cache["DEPLOYER_A"] = (time.monotonic() + 600, mock_profile)

        with patch("lineage_agent.deployer_service._build_profile") as mock_build:
            result = await compute_deployer_profile("DEPLOYER_A")

        assert result is mock_profile
        mock_build.assert_not_called()

    async def test_l1_cache_expired_triggers_rebuild(self):
        """Expired L1 cache should trigger a rebuild."""
        _profile_cache["DEPLOYER_A"] = (time.monotonic() - 1, MagicMock())

        mock_profile = MagicMock()
        with (
            patch("lineage_agent.deployer_service._build_profile",
                  new_callable=AsyncMock, return_value=mock_profile),
            patch("lineage_agent.redis_cache.is_redis_enabled", return_value=False),
        ):
            result = await compute_deployer_profile("DEPLOYER_A")

        assert result is mock_profile

    async def test_build_exception_returns_none(self):
        with (
            patch("lineage_agent.deployer_service._build_profile",
                  new_callable=AsyncMock, side_effect=RuntimeError("db error")),
            patch("lineage_agent.redis_cache.is_redis_enabled", return_value=False),
        ):
            result = await compute_deployer_profile("DEPLOYER_B")
        assert result is None


# ---------------------------------------------------------------------------
# _build_profile — DB computation
# ---------------------------------------------------------------------------

class TestBuildProfile:
    async def test_no_created_rows_returns_none(self):
        with patch(
            "lineage_agent.deployer_service.event_query",
            new_callable=AsyncMock,
            return_value=[],
        ):
            # Also mock the DAS fallback
            mock_rpc = MagicMock()
            mock_rpc.search_assets_by_creator = AsyncMock(return_value=[])
            with patch(
                "lineage_agent.data_sources._clients.get_rpc_client",
                return_value=mock_rpc,
            ):
                result = await _build_profile("DEPLOYER_EMPTY")
        assert result is None

    async def test_das_fallback_returns_none_when_no_assets(self):
        """When no intelligence_events and no DAS assets, returns None."""
        with patch(
            "lineage_agent.deployer_service.event_query",
            new_callable=AsyncMock,
            return_value=[],
        ):
            mock_rpc = MagicMock()
            mock_rpc.search_assets_by_creator = AsyncMock(return_value=[])
            with patch(
                "lineage_agent.data_sources._clients.get_rpc_client",
                return_value=mock_rpc,
            ):
                result = await _build_profile("DEPLOYER_DAS")

        assert result is None

    async def test_das_fallback_returns_profile_when_assets_found(self):
        """DAS fallback returns a minimal profile when search_assets finds tokens."""
        with patch(
            "lineage_agent.deployer_service.event_query",
            new_callable=AsyncMock,
            return_value=[],
        ):
            mock_rpc = MagicMock()
            mock_rpc.search_assets_by_creator = AsyncMock(return_value=[
                {"id": "asset1"}, {"id": "asset2"},
            ])
            with patch(
                "lineage_agent.data_sources._clients.get_rpc_client",
                return_value=mock_rpc,
            ):
                result = await _build_profile("DEPLOYER_DAS")

        assert result is not None
        assert result.total_tokens_launched == 2
        assert result.rug_count == 0
        assert result.active_tokens == 2
        assert result.confidence == "low"

    async def test_builds_profile_with_rugs(self):
        """Full profile with created tokens and rug events."""
        created_rows = [
            {"mint": "M1", "name": "Token1", "symbol": "T1", "narrative": "meme",
             "mcap_usd": 50000, "created_at": "2024-01-01T12:00:00+00:00", "recorded_at": None},
            {"mint": "M2", "name": "Token2", "symbol": "T2", "narrative": "meme",
             "mcap_usd": 30000, "created_at": "2024-01-02T12:00:00+00:00", "recorded_at": None},
            {"mint": "M3", "name": "Token3", "symbol": "T3", "narrative": "ai",
             "mcap_usd": 10000, "created_at": "2024-01-03T12:00:00+00:00", "recorded_at": None},
        ]
        rug_rows = [
            {"mint": "M1", "rugged_at": "2024-01-01T14:00:00+00:00",
             "rug_mechanism": "dex_liquidity_rug", "evidence_level": "strong"},
            {"mint": "M2", "rugged_at": "2024-01-02T13:00:00+00:00",
             "rug_mechanism": "dead_token", "evidence_level": "moderate"},
        ]

        call_count = {"n": 0}

        async def fake_event_query(where, **kwargs):
            call_count["n"] += 1
            if "token_created" in where:
                return created_rows
            if "token_rugged" in where:
                return rug_rows
            return []

        with (
            patch("lineage_agent.deployer_service.event_query", new=fake_event_query),
            patch("lineage_agent.deployer_service.normalize_legacy_rug_events",
                  new_callable=AsyncMock),
        ):
            result = await _build_profile("DEPLOYER_X")

        assert result is not None
        assert result.total_tokens_launched == 3
        assert result.negative_outcome_count == 2  # M1 + M2
        assert result.rug_count == 1  # M1 only (M2 is dead_token)
        assert result.dead_token_count == 1
        assert result.confirmed_rug_count == 1  # M1 strong evidence
        assert result.preferred_narrative == "meme"
        assert result.confidence == "medium"  # 3 tokens → medium
        assert len(result.tokens) == 3

    async def test_high_confidence_with_5_tokens(self):
        """≥5 tokens → high confidence."""
        created_rows = [
            {"mint": f"M{i}", "name": f"T{i}", "symbol": f"S{i}", "narrative": "meme",
             "mcap_usd": 10000, "created_at": f"2024-01-0{i+1}T12:00:00+00:00", "recorded_at": None}
            for i in range(5)
        ]

        call_count = {"n": 0}

        async def fake_event_query(where, **kwargs):
            call_count["n"] += 1
            if "token_created" in where:
                return created_rows
            return []

        with (
            patch("lineage_agent.deployer_service.event_query", new=fake_event_query),
            patch("lineage_agent.deployer_service.normalize_legacy_rug_events",
                  new_callable=AsyncMock),
        ):
            result = await _build_profile("DEPLOYER_HIGH")

        assert result.confidence == "high"
        assert result.total_tokens_launched == 5

    async def test_single_token_low_confidence(self):
        """1 token → low confidence."""
        created_rows = [
            {"mint": "M1", "name": "T1", "symbol": "S1", "narrative": "meme",
             "mcap_usd": 10000, "created_at": "2024-01-01T12:00:00+00:00", "recorded_at": None},
        ]

        call_count = {"n": 0}

        async def fake_event_query(where, **kwargs):
            call_count["n"] += 1
            if "token_created" in where:
                return created_rows
            return []

        with (
            patch("lineage_agent.deployer_service.event_query", new=fake_event_query),
            patch("lineage_agent.deployer_service.normalize_legacy_rug_events",
                  new_callable=AsyncMock),
        ):
            result = await _build_profile("DEPLOYER_LOW")

        assert result.confidence == "low"

    async def test_avg_lifespan_computed(self):
        """Lifespan computed from created_at → rugged_at delta."""
        created_rows = [
            {"mint": "M1", "name": "T1", "symbol": "S1", "narrative": "meme",
             "mcap_usd": 10000, "created_at": "2024-01-01T00:00:00+00:00", "recorded_at": None},
        ]
        rug_rows = [
            {"mint": "M1", "rugged_at": "2024-01-02T00:00:00+00:00",
             "rug_mechanism": "dex_liquidity_rug", "evidence_level": "strong"},
        ]

        call_count = {"n": 0}

        async def fake_event_query(where, **kwargs):
            call_count["n"] += 1
            if "token_created" in where:
                return created_rows
            if "token_rugged" in where:
                return rug_rows
            return []

        with (
            patch("lineage_agent.deployer_service.event_query", new=fake_event_query),
            patch("lineage_agent.deployer_service.normalize_legacy_rug_events",
                  new_callable=AsyncMock),
        ):
            result = await _build_profile("DEPLOYER_LIFESPAN")

        assert result is not None
        assert result.avg_lifespan_days == pytest.approx(1.0, abs=0.01)

    async def test_rug_rate_pct(self):
        """rug_rate_pct = rug_count / total * 100."""
        created_rows = [
            {"mint": "M1", "name": "T1", "symbol": "S1", "narrative": "",
             "mcap_usd": 10000, "created_at": "2024-01-01T12:00:00+00:00", "recorded_at": None},
            {"mint": "M2", "name": "T2", "symbol": "S2", "narrative": "",
             "mcap_usd": 10000, "created_at": "2024-01-02T12:00:00+00:00", "recorded_at": None},
        ]
        rug_rows = [
            {"mint": "M1", "rugged_at": "2024-01-01T14:00:00+00:00",
             "rug_mechanism": "dex_liquidity_rug", "evidence_level": "strong"},
        ]

        call_count = {"n": 0}

        async def fake_event_query(where, **kwargs):
            call_count["n"] += 1
            if "token_created" in where:
                return created_rows
            if "token_rugged" in where:
                return rug_rows
            return []

        with (
            patch("lineage_agent.deployer_service.event_query", new=fake_event_query),
            patch("lineage_agent.deployer_service.normalize_legacy_rug_events",
                  new_callable=AsyncMock),
        ):
            result = await _build_profile("DEPLOYER_RATE")

        assert result.rug_rate_pct == 50.0
        assert result.negative_outcome_rate_pct == 50.0
