"""Tests for watchlist_monitor_service — rescan logic and escalation detection."""
from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import aiosqlite
import pytest


# ---------------------------------------------------------------------------
# Minimal cache stub
# ---------------------------------------------------------------------------

class _FakeCache:
    def __init__(self, db):
        self._db = db

    async def _get_conn(self):
        return self._db


async def _make_cache():
    db = await aiosqlite.connect(":memory:")
    await db.execute("PRAGMA foreign_keys=ON")
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            privy_id TEXT UNIQUE NOT NULL,
            email TEXT,
            wallet_address TEXT,
            plan TEXT NOT NULL DEFAULT 'free',
            api_key TEXT UNIQUE NOT NULL,
            created_at REAL NOT NULL
        )
        """
    )
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS user_watches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            sub_type TEXT NOT NULL,
            value TEXT NOT NULL,
            created_at REAL NOT NULL
        )
        """
    )
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS watch_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            watch_id INTEGER NOT NULL,
            mint TEXT NOT NULL,
            risk_level TEXT,
            risk_score REAL DEFAULT 0,
            scanned_at REAL NOT NULL
        )
        """
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_ws_watch ON watch_snapshots(watch_id, scanned_at)"
    )
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS sweep_flags (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            watch_id    INTEGER NOT NULL,
            mint        TEXT NOT NULL DEFAULT '',
            user_id     INTEGER NOT NULL DEFAULT 0,
            flag_type   TEXT NOT NULL,
            severity    TEXT NOT NULL DEFAULT 'info',
            title       TEXT NOT NULL DEFAULT '',
            detail      TEXT,
            created_at  REAL NOT NULL,
            read        INTEGER DEFAULT 0
        )
        """
    )
    # Seed a user and watch
    await db.execute(
        "INSERT INTO users (privy_id, api_key, created_at) VALUES (?, ?, ?)",
        ("privy_1", "lin_abc", time.time()),
    )
    await db.execute(
        "INSERT INTO user_watches (user_id, sub_type, value, created_at) VALUES (?, ?, ?, ?)",
        (1, "mint", "So11111111111111111111111111111111", time.time()),
    )
    await db.commit()
    return _FakeCache(db), db


def _make_lineage(risk_level: str, rug_prob: float, *, heuristic_score: int | None = None):
    """Build a minimal lineage-like object with a death_clock.

    If *heuristic_score* is given, _heuristic_score is patched to return it
    so that the risk level in the rescan matches expectations.
    """
    dc = SimpleNamespace(risk_level=risk_level, rug_probability_pct=rug_prob)
    return SimpleNamespace(
        death_clock=dc,
        sol_flow=None,
        bundle_report=None,
        insider_sell=None,
        cartel_report=None,
        deployer_profile=None,
        query_token=None,
        root=None,
        operator_fingerprint=None,
        _heuristic_override=heuristic_score,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_single_rescan_stores_snapshot():
    cache, db = await _make_cache()

    lin = _make_lineage("medium", 45.0, heuristic_score=40)

    with (
        patch("lineage_agent.lineage_detector.detect_lineage", new_callable=AsyncMock, return_value=lin),
        patch("lineage_agent.ai_analyst._heuristic_score", return_value=40),
    ):
        from lineage_agent.watchlist_monitor_service import run_single_rescan
        result = await run_single_rescan(1, 1, cache)

    assert result is not None
    assert result["mint"] == "So11111111111111111111111111111111"
    assert result["new_risk"] == "medium"
    assert result["new_score"] == 40

    # Verify snapshot was stored
    cursor = await db.execute("SELECT COUNT(*) FROM watch_snapshots WHERE watch_id = 1")
    (count,) = await cursor.fetchone()
    assert count == 1

    # Verify reference snapshot was stored on first scan
    cursor = await db.execute(
        "SELECT COUNT(*) FROM sweep_flags WHERE watch_id = 1 AND flag_type = '_REFERENCE'"
    )
    (ref_count,) = await cursor.fetchone()
    assert ref_count == 1, "Reference snapshot should be stored on first scan"

    await db.close()


@pytest.mark.asyncio
async def test_escalation_medium_to_high():
    cache, db = await _make_cache()

    # Insert a previous snapshot at "medium"
    await db.execute(
        "INSERT INTO watch_snapshots (watch_id, mint, risk_level, risk_score, scanned_at) VALUES (?, ?, ?, ?, ?)",
        (1, "So11111111111111111111111111111111", "medium", 40.0, time.time() - 3600),
    )
    await db.commit()

    lin = _make_lineage("high", 75.0, heuristic_score=80)

    with (
        patch("lineage_agent.lineage_detector.detect_lineage", new_callable=AsyncMock, return_value=lin),
        patch("lineage_agent.ai_analyst._heuristic_score", return_value=80),
    ):
        from lineage_agent.watchlist_monitor_service import run_single_rescan
        result = await run_single_rescan(1, 1, cache)

    assert result is not None
    assert result["escalated"] is True
    assert result["old_risk"] == "medium"
    assert result["new_risk"] == "critical"

    await db.close()


@pytest.mark.asyncio
async def test_no_escalation_low_to_low():
    cache, db = await _make_cache()

    # Insert a previous snapshot at "low"
    await db.execute(
        "INSERT INTO watch_snapshots (watch_id, mint, risk_level, risk_score, scanned_at) VALUES (?, ?, ?, ?, ?)",
        (1, "So11111111111111111111111111111111", "low", 10.0, time.time() - 3600),
    )
    await db.commit()

    lin = _make_lineage("low", 12.0, heuristic_score=10)

    with (
        patch("lineage_agent.lineage_detector.detect_lineage", new_callable=AsyncMock, return_value=lin),
        patch("lineage_agent.ai_analyst._heuristic_score", return_value=10),
    ):
        from lineage_agent.watchlist_monitor_service import run_single_rescan
        result = await run_single_rescan(1, 1, cache)

    assert result is not None
    assert result["escalated"] is False

    await db.close()


@pytest.mark.asyncio
async def test_rescan_nonexistent_watch_returns_none():
    cache, db = await _make_cache()

    from lineage_agent.watchlist_monitor_service import run_single_rescan
    result = await run_single_rescan(999, 1, cache)
    assert result is None

    await db.close()


# ---------------------------------------------------------------------------
# Cumulative flag tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cumulative_price_crash_flag():
    """When price drops >50% vs reference, generate CUMULATIVE_PRICE_CRASH."""
    from lineage_agent.watchlist_monitor_service import _generate_flags

    ref = {"price_usd": 1.0, "liq_usd": 100_000, "sol_extracted": 0}
    old = {"price_usd": 0.6, "liq_usd": 80_000, "sol_extracted": 0}
    new = {"price_usd": 0.4, "liq_usd": 70_000, "sol_extracted": 0}

    flags = _generate_flags(old, new, "TESTMINT", ref=ref)
    flag_types = [f["flag_type"] for f in flags]
    assert "CUMULATIVE_PRICE_CRASH" in flag_types


@pytest.mark.asyncio
async def test_cumulative_price_decline_flag():
    """When price drops 30-50% vs reference, generate CUMULATIVE_PRICE_DECLINE."""
    from lineage_agent.watchlist_monitor_service import _generate_flags

    ref = {"price_usd": 1.0, "liq_usd": 100_000}
    old = {"price_usd": 0.8, "liq_usd": 90_000}
    new = {"price_usd": 0.65, "liq_usd": 85_000}

    flags = _generate_flags(old, new, "TESTMINT", ref=ref)
    flag_types = [f["flag_type"] for f in flags]
    assert "CUMULATIVE_PRICE_DECLINE" in flag_types
    assert "CUMULATIVE_PRICE_CRASH" not in flag_types


@pytest.mark.asyncio
async def test_no_cumulative_flag_without_ref():
    """Without a reference snapshot, no cumulative flags should be generated."""
    from lineage_agent.watchlist_monitor_service import _generate_flags

    old = {"price_usd": 1.0}
    new = {"price_usd": 0.3}  # -70% drop

    flags = _generate_flags(old, new, "TESTMINT", ref=None)
    flag_types = [f["flag_type"] for f in flags]
    assert "CUMULATIVE_PRICE_CRASH" not in flag_types
    assert "CUMULATIVE_PRICE_DECLINE" not in flag_types


@pytest.mark.asyncio
async def test_cumulative_sol_extraction_flag():
    """Large SOL extraction vs reference should trigger CUMULATIVE_SOL_EXTRACTION."""
    from lineage_agent.watchlist_monitor_service import _generate_flags

    ref = {"sol_extracted": 0, "price_usd": 1.0}
    old = {"sol_extracted": 15, "price_usd": 0.8}
    new = {"sol_extracted": 25, "price_usd": 0.7}

    flags = _generate_flags(old, new, "TESTMINT", ref=ref)
    flag_types = [f["flag_type"] for f in flags]
    assert "CUMULATIVE_SOL_EXTRACTION" in flag_types


@pytest.mark.asyncio
async def test_cumulative_liq_drain_flag():
    """Liquidity drained >50% vs reference → CUMULATIVE_LIQ_DRAIN."""
    from lineage_agent.watchlist_monitor_service import _generate_flags

    ref = {"liq_usd": 100_000, "price_usd": 1.0}
    old = {"liq_usd": 60_000, "price_usd": 0.8}
    new = {"liq_usd": 40_000, "price_usd": 0.7}

    flags = _generate_flags(old, new, "TESTMINT", ref=ref)
    flag_types = [f["flag_type"] for f in flags]
    assert "CUMULATIVE_LIQ_DRAIN" in flag_types


# ---------------------------------------------------------------------------
# Market pulse tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_market_pulse_triggers_on_price_drop():
    """Pulse should detect price drop vs last snapshot and trigger rescan."""
    cache, db = await _make_cache()
    import json

    # Store a _SNAPSHOT with price_usd=1.0
    await db.execute(
        "INSERT INTO sweep_flags (watch_id, mint, user_id, flag_type, severity, title, detail, created_at, read) "
        "VALUES (1, 'So11111111111111111111111111111111', 1, '_SNAPSHOT', 'info', 'snapshot', ?, ?, 1)",
        (json.dumps({"price_usd": 1.0, "liq_usd": 100_000}), time.time() - 600),
    )
    # Store a _REFERENCE
    await db.execute(
        "INSERT INTO sweep_flags (watch_id, mint, user_id, flag_type, severity, title, detail, created_at, read) "
        "VALUES (1, 'So11111111111111111111111111111111', 1, '_REFERENCE', 'info', 'reference', ?, ?, 1)",
        (json.dumps({"price_usd": 1.0, "liq_usd": 100_000}), time.time() - 7200),
    )
    await db.commit()

    # Mock DexScreener to return a crashed price
    from lineage_agent.models import TokenMetadata
    mock_meta = TokenMetadata(
        mint="So11111111111111111111111111111111",
        price_usd=0.5,  # -50% from snapshot
        liquidity_usd=80_000,
    )
    mock_dex = AsyncMock()
    mock_dex.get_token_pairs = AsyncMock(return_value=[{"fake": True}])
    mock_dex.pairs_to_metadata = lambda mint, pairs: mock_meta

    with (
        patch("lineage_agent.data_sources._clients.get_dex_client", return_value=mock_dex),
        patch("lineage_agent.watchlist_monitor_service.run_single_rescan", new_callable=AsyncMock, return_value={
            "mint": "So11111111111111111111111111111111",
            "flags": [{"flag_type": "CUMULATIVE_PRICE_CRASH", "severity": "critical", "title": "test"}],
            "flags_count": 1,
            "old_risk": "low",
            "new_risk": "critical",
        }),
    ):
        from lineage_agent.watchlist_monitor_service import run_market_pulse
        triggered = await run_market_pulse(cache)

    assert len(triggered) >= 1
    assert "price" in triggered[0]["trigger"].lower()
    assert triggered[0]["mint"] == "So11111111111111111111111111111111"

    await db.close()


@pytest.mark.asyncio
async def test_market_pulse_no_trigger_when_stable():
    """Pulse should not trigger when prices are stable."""
    cache, db = await _make_cache()
    import json

    # Store a _SNAPSHOT with price_usd=1.0
    await db.execute(
        "INSERT INTO sweep_flags (watch_id, mint, user_id, flag_type, severity, title, detail, created_at, read) "
        "VALUES (1, 'So11111111111111111111111111111111', 1, '_SNAPSHOT', 'info', 'snapshot', ?, ?, 1)",
        (json.dumps({"price_usd": 1.0, "liq_usd": 100_000}), time.time() - 600),
    )
    await db.execute(
        "INSERT INTO sweep_flags (watch_id, mint, user_id, flag_type, severity, title, detail, created_at, read) "
        "VALUES (1, 'So11111111111111111111111111111111', 1, '_REFERENCE', 'info', 'reference', ?, ?, 1)",
        (json.dumps({"price_usd": 1.0, "liq_usd": 100_000}), time.time() - 7200),
    )
    await db.commit()

    # Mock DexScreener to return a stable price (-5%)
    from lineage_agent.models import TokenMetadata
    mock_meta = TokenMetadata(
        mint="So11111111111111111111111111111111",
        price_usd=0.95,  # -5% — within tolerance
        liquidity_usd=95_000,
    )
    mock_dex = AsyncMock()
    mock_dex.get_token_pairs = AsyncMock(return_value=[{"fake": True}])
    mock_dex.pairs_to_metadata = lambda mint, pairs: mock_meta

    with patch("lineage_agent.data_sources._clients.get_dex_client", return_value=mock_dex):
        from lineage_agent.watchlist_monitor_service import run_market_pulse
        triggered = await run_market_pulse(cache)

    assert len(triggered) == 0

    await db.close()
