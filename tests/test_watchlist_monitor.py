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
            flag_type   TEXT NOT NULL,
            detail      TEXT,
            created_at  REAL NOT NULL
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


def _make_lineage(risk_level: str, rug_prob: float):
    """Build a minimal lineage-like object with a death_clock."""
    dc = SimpleNamespace(risk_level=risk_level, rug_probability_pct=rug_prob)
    return SimpleNamespace(death_clock=dc)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_single_rescan_stores_snapshot():
    cache, db = await _make_cache()

    lin = _make_lineage("medium", 45.0)

    with patch(
        "lineage_agent.lineage_detector.detect_lineage",
        new_callable=AsyncMock,
        return_value=lin,
    ):
        from lineage_agent.watchlist_monitor_service import run_single_rescan
        result = await run_single_rescan(1, 1, cache)

    assert result is not None
    assert result["mint"] == "So11111111111111111111111111111111"
    assert result["new_risk"] == "medium"
    assert result["new_score"] == 45.0

    # Verify snapshot was stored
    cursor = await db.execute("SELECT COUNT(*) FROM watch_snapshots WHERE watch_id = 1")
    (count,) = await cursor.fetchone()
    assert count == 1

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

    lin = _make_lineage("high", 75.0)

    with patch(
        "lineage_agent.lineage_detector.detect_lineage",
        new_callable=AsyncMock,
        return_value=lin,
    ):
        from lineage_agent.watchlist_monitor_service import run_single_rescan
        result = await run_single_rescan(1, 1, cache)

    assert result is not None
    assert result["escalated"] is True
    assert result["old_risk"] == "medium"
    assert result["new_risk"] == "high"

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

    lin = _make_lineage("low", 12.0)

    with patch(
        "lineage_agent.lineage_detector.detect_lineage",
        new_callable=AsyncMock,
        return_value=lin,
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
