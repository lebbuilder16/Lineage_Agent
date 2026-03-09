"""Tests for GET /stats/global endpoint (Feature 7)."""

from __future__ import annotations

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock


# Helper to build minimal event row dicts
def _created_row(mint: str, deployer: str, narrative: str = "pepe") -> dict:
    return {"mint": mint, "deployer": deployer, "narrative": narrative}


def _rugged_row(mint: str) -> dict:
    return {"mint": mint}


# ---------------------------------------------------------------------------
# /stats/global — basic counts
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_global_stats_returns_expected_counts():
    """Stats endpoint computes counts from DB rows correctly."""
    created = [
        _created_row("MINT1", "DEP1", "pepe"),
        _created_row("MINT2", "DEP1", "pepe"),
        _created_row("MINT3", "DEP2", "doge"),
    ]
    rugged = [_rugged_row("MINT1")]
    total = [{"cnt": 50}]
    narrative = created  # narrative rows match created rows

    async def mock_event_query(where, params, columns, limit=None):
        if "token_rugged" in where:
            return rugged
        if "COUNT(*)" in columns:
            return total
        if "narrative" in columns and "narrative IS NOT NULL" in where:
            return narrative
        return created

    with patch("lineage_agent.data_sources._clients.event_query", side_effect=mock_event_query):
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None  # clear cache
        from lineage_agent.api import get_global_stats
        from fastapi import Request
        req = MagicMock(spec=Request)
        req.app = MagicMock()
        result = await get_global_stats.__wrapped__(req)

    assert result.tokens_scanned_24h == 3
    assert result.tokens_rugged_24h == 1
    assert result.tokens_negative_outcomes_24h == 1
    assert result.rug_rate_24h_pct == pytest.approx(33.33, rel=0.01)
    assert result.active_deployers_24h == 2
    assert result.db_events_total == 50
    assert len(result.top_narratives) <= 5


@pytest.mark.asyncio
async def test_get_global_stats_zero_when_no_events():
    """When database is empty rug_rate is 0.0 (not division by zero)."""
    async def mock_event_query(where, params, columns, limit=None):
        if "COUNT(*)" in columns:
            return [{"cnt": 0}]
        return []

    with patch("lineage_agent.data_sources._clients.event_query", side_effect=mock_event_query):
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None
        from lineage_agent.api import get_global_stats
        from fastapi import Request
        req = MagicMock(spec=Request)
        req.app = MagicMock()
        result = await get_global_stats.__wrapped__(req)

    assert result.tokens_scanned_24h == 0
    assert result.rug_rate_24h_pct == 0.0
    assert result.negative_outcome_rate_24h_pct == 0.0


@pytest.mark.asyncio
async def test_get_global_stats_result_is_cached():
    """Second call within TTL returns cached result without querying DB."""
    created = [_created_row("MINT1", "DEP1", "pepe")]

    call_count = 0

    async def mock_event_query(where, params, columns, limit=None):
        nonlocal call_count
        call_count += 1
        if "COUNT(*)" in columns:
            return [{"cnt": 5}]
        if "token_rugged" in where:
            return []
        return created

    with patch("lineage_agent.data_sources._clients.event_query", side_effect=mock_event_query):
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None
        from lineage_agent.api import get_global_stats
        from fastapi import Request
        req = MagicMock(spec=Request)
        req.app = MagicMock()

        await get_global_stats.__wrapped__(req)
        calls_after_first = call_count

        await get_global_stats.__wrapped__(req)
        calls_after_second = call_count

    # Second call should not have increased the call count (using cache)
    assert calls_after_second == calls_after_first


@pytest.mark.asyncio
async def test_get_global_stats_top_narratives_limited_to_5():
    """top_narratives list never exceeds 5 entries."""
    many_narratives = [
        _created_row(f"MINT{i}", f"DEP{i}", nar)
        for i, nar in enumerate(["pepe","doge","ai","cat","trump","sol","inu","moon"])
    ]

    async def mock_event_query(where, params, columns, limit=None):
        if "COUNT(*)" in columns:
            return [{"cnt": 100}]
        if "token_rugged" in where:
            return []
        return many_narratives

    with patch("lineage_agent.data_sources._clients.event_query", side_effect=mock_event_query):
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None
        from lineage_agent.api import get_global_stats
        from fastapi import Request
        req = MagicMock(spec=Request)
        req.app = MagicMock()
        result = await get_global_stats.__wrapped__(req)

    assert len(result.top_narratives) <= 5


@pytest.mark.asyncio
async def test_get_global_stats_filters_unconfirmed_negative_outcomes_from_confirmed_rugs():
    created = [
        _created_row("MINT1", "DEP1", "pepe"),
        _created_row("MINT2", "DEP2", "doge"),
    ]
    rugged = [
        {"mint": "MINT1", "rug_mechanism": "dex_liquidity_rug", "evidence_level": "strong"},
        {"mint": "MINT2", "rug_mechanism": "unproven_abandonment", "evidence_level": "weak"},
    ]

    async def mock_event_query(where, params, columns, limit=None):
        if "token_rugged" in where:
            return rugged
        if "COUNT(*)" in columns:
            return [{"cnt": 10}]
        if "narrative" in columns and "narrative IS NOT NULL" in where:
            return created
        return created

    with patch("lineage_agent.data_sources._clients.event_query", side_effect=mock_event_query):
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None
        from lineage_agent.api import get_global_stats
        from fastapi import Request
        req = MagicMock(spec=Request)
        req.app = MagicMock()
        result = await get_global_stats.__wrapped__(req)

    assert result.tokens_rugged_24h == 1
    assert result.tokens_negative_outcomes_24h == 2
    assert result.rug_rate_24h_pct == pytest.approx(50.0, rel=0.01)
    assert result.negative_outcome_rate_24h_pct == pytest.approx(100.0, rel=0.01)


@pytest.mark.asyncio
async def test_get_global_stats_normalizes_legacy_rugs_before_confirmed_count():
    created = [_created_row("MINT1", "DEP1", "pepe")]
    rugged_queries = [
        [{"mint": "MINT1", "rug_mechanism": None, "evidence_level": None}],
        [{"mint": "MINT1", "rug_mechanism": "dex_liquidity_rug", "evidence_level": "strong"}],
    ]

    async def mock_event_query(where, params, columns, limit=None):
        if "token_rugged" in where:
            return rugged_queries.pop(0)
        if "COUNT(*)" in columns:
            return [{"cnt": 5}]
        if "narrative" in columns and "narrative IS NOT NULL" in where:
            return created
        return created

    with patch("lineage_agent.data_sources._clients.event_query", side_effect=mock_event_query), patch(
        "lineage_agent.api.normalize_legacy_rug_events", new=AsyncMock(return_value=1)
    ) as mock_normalize:
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None
        from lineage_agent.api import get_global_stats
        from fastapi import Request
        req = MagicMock(spec=Request)
        req.app = MagicMock()
        result = await get_global_stats.__wrapped__(req)

    mock_normalize.assert_awaited_once_with(mints=["MINT1"])
    assert result.tokens_rugged_24h == 1
    assert result.tokens_negative_outcomes_24h == 1
    assert result.rug_rate_24h_pct == pytest.approx(100.0, rel=0.01)


# ---------------------------------------------------------------------------
# GlobalStats model serialisation
# ---------------------------------------------------------------------------

def test_global_stats_model_serialises():
    from lineage_agent.models import GlobalStats, NarrativeCount
    stats = GlobalStats(
        tokens_scanned_24h=10,
        tokens_rugged_24h=2,
        rug_rate_24h_pct=20.0,
        tokens_negative_outcomes_24h=3,
        negative_outcome_rate_24h_pct=30.0,
        active_deployers_24h=5,
        top_narratives=[NarrativeCount(narrative="pepe", count=3)],
        db_events_total=500,
        last_updated=datetime.now(tz=timezone.utc),
    )
    data = stats.model_dump()
    assert data["tokens_scanned_24h"] == 10
    assert data["top_narratives"][0]["narrative"] == "pepe"
    assert data["tokens_negative_outcomes_24h"] == 3
