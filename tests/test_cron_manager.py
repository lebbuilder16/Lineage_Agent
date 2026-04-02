"""Tests for server-side cron lifecycle management (cron_manager.py)."""
from __future__ import annotations

import json

import aiosqlite
import pytest
import pytest_asyncio

from src.lineage_agent.cron_manager import (
    ensure_watch_cron,
    remove_watch_cron,
    ensure_briefing_cron,
    remove_briefing_cron,
    sync_all_user_crons,
    seconds_to_cron_expr,
)


# ── Fixtures ──────────────────────────────────────────────────────────────


class MockCache:
    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def _get_conn(self):
        return self._db


@pytest_asyncio.fixture
async def db():
    conn = await aiosqlite.connect(":memory:")
    await conn.execute("""
        CREATE TABLE user_crons (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            schedule TEXT NOT NULL,
            payload TEXT NOT NULL DEFAULT '{}',
            delivery TEXT NOT NULL DEFAULT '{}',
            enabled INTEGER NOT NULL DEFAULT 1,
            last_run TEXT,
            next_run TEXT,
            created_at REAL NOT NULL
        )
    """)
    await conn.execute("CREATE INDEX idx_uc_user ON user_crons(user_id, name)")
    await conn.execute("""
        CREATE TABLE user_watches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            sub_type TEXT NOT NULL DEFAULT 'mint',
            value TEXT NOT NULL,
            created_at REAL NOT NULL
        )
    """)
    await conn.execute("""
        CREATE TABLE agent_prefs (
            user_id INTEGER PRIMARY KEY,
            daily_briefing INTEGER DEFAULT 1,
            briefing_hour INTEGER DEFAULT 8,
            sweep_interval INTEGER DEFAULT 2700,
            alert_deployer_launch INTEGER DEFAULT 1,
            alert_high_risk INTEGER DEFAULT 1,
            auto_investigate INTEGER DEFAULT 0,
            risk_threshold INTEGER DEFAULT 70,
            alert_types TEXT DEFAULT '[]',
            sol_extraction_min REAL DEFAULT 20.0,
            investigation_depth TEXT DEFAULT 'standard',
            quiet_hours_start INTEGER,
            quiet_hours_end INTEGER,
            wallet_monitor_enabled INTEGER DEFAULT 0,
            wallet_monitor_threshold INTEGER DEFAULT 60,
            wallet_monitor_interval INTEGER DEFAULT 600,
            updated_at REAL
        )
    """)
    await conn.commit()
    yield conn
    await conn.close()


@pytest.fixture
def cache(db):
    return MockCache(db)


USER_ID = 42


# ── Helpers ───────────────────────────────────────────────────────────────


async def _cron_count(db, user_id: int = USER_ID) -> int:
    cur = await db.execute("SELECT count(*) FROM user_crons WHERE user_id = ?", (user_id,))
    return (await cur.fetchone())[0]


async def _cron_names(db, user_id: int = USER_ID) -> set[str]:
    cur = await db.execute("SELECT name FROM user_crons WHERE user_id = ?", (user_id,))
    return {r[0] for r in await cur.fetchall()}


async def _add_watch(db, user_id: int, value: str, sub_type: str = "mint") -> dict:
    await db.execute(
        "INSERT INTO user_watches (user_id, sub_type, value, created_at) VALUES (?, ?, ?, 0)",
        (user_id, sub_type, value),
    )
    await db.commit()
    cur = await db.execute("SELECT last_insert_rowid()")
    wid = (await cur.fetchone())[0]
    return {"id": wid, "sub_type": sub_type, "value": value}


# ── Tests: ensure_watch_cron ─────────────────────────────────────────────


async def test_ensure_watch_cron_creates(cache, db):
    watch = {"id": 1, "sub_type": "mint", "value": "TokenMint123"}
    cron_id = await ensure_watch_cron(cache, USER_ID, watch, sweep_interval_s=2700)
    assert cron_id.startswith("cron-")
    assert await _cron_count(db) == 1
    names = await _cron_names(db)
    assert "lineage:watchlist:1" in names


async def test_ensure_watch_cron_upserts(cache, db):
    watch = {"id": 1, "sub_type": "mint", "value": "TokenMint123"}
    await ensure_watch_cron(cache, USER_ID, watch, sweep_interval_s=2700)
    await ensure_watch_cron(cache, USER_ID, watch, sweep_interval_s=3600)
    assert await _cron_count(db) == 1  # still 1, not 2
    cur = await db.execute("SELECT schedule FROM user_crons WHERE name = 'lineage:watchlist:1'")
    row = await cur.fetchone()
    schedule = json.loads(row[0])
    assert schedule["at"] == "0 */1 * * *"  # 3600s = every 1h


# ── Tests: remove_watch_cron ─────────────────────────────────────────────


async def test_remove_watch_cron_deletes(cache, db):
    watch = {"id": 5, "sub_type": "mint", "value": "Abc123"}
    await ensure_watch_cron(cache, USER_ID, watch, sweep_interval_s=2700)
    assert await _cron_count(db) == 1
    deleted = await remove_watch_cron(cache, USER_ID, 5)
    assert deleted is True
    assert await _cron_count(db) == 0


async def test_remove_watch_cron_nonexistent(cache, db):
    deleted = await remove_watch_cron(cache, USER_ID, 999)
    assert deleted is False


# ── Tests: ensure_briefing_cron ──────────────────────────────────────────


async def test_ensure_briefing_creates(cache, db):
    cron_id = await ensure_briefing_cron(cache, USER_ID, hour=9, plan="pro")
    assert cron_id is not None
    assert cron_id.startswith("cron-")
    names = await _cron_names(db)
    assert "lineage:briefing" in names


async def test_ensure_briefing_respects_free_plan(cache, db):
    result = await ensure_briefing_cron(cache, USER_ID, hour=8, plan="free")
    assert result is None
    assert await _cron_count(db) == 0


async def test_ensure_briefing_updates_hour(cache, db):
    await ensure_briefing_cron(cache, USER_ID, hour=8, plan="elite")
    await ensure_briefing_cron(cache, USER_ID, hour=14, plan="elite")
    assert await _cron_count(db) == 1
    cur = await db.execute("SELECT schedule FROM user_crons WHERE name = 'lineage:briefing'")
    row = await cur.fetchone()
    schedule = json.loads(row[0])
    assert schedule["at"] == "0 14 * * *"


# ── Tests: remove_briefing_cron ──────────────────────────────────────────


async def test_remove_briefing(cache, db):
    await ensure_briefing_cron(cache, USER_ID, hour=8, plan="pro")
    deleted = await remove_briefing_cron(cache, USER_ID)
    assert deleted is True
    assert await _cron_count(db) == 0


# ── Tests: sync_all_user_crons ───────────────────────────────────────────


async def test_sync_adds_missing_crons(cache, db):
    # 3 watches, 1 existing cron — should create 2 more
    w1 = await _add_watch(db, USER_ID, "Mint1")
    w2 = await _add_watch(db, USER_ID, "Mint2")
    w3 = await _add_watch(db, USER_ID, "Mint3")
    # Pre-create cron for w1 only
    await ensure_watch_cron(cache, USER_ID, w1, sweep_interval_s=2700)
    assert await _cron_count(db) == 1

    synced = await sync_all_user_crons(cache, USER_ID, plan="pro")
    assert synced >= 2  # 2 watch crons + possibly briefing
    names = await _cron_names(db)
    assert f"lineage:watchlist:{w1['id']}" in names
    assert f"lineage:watchlist:{w2['id']}" in names
    assert f"lineage:watchlist:{w3['id']}" in names


async def test_sync_removes_orphans(cache, db):
    # 1 watch but 3 crons — should remove 2 orphaned crons
    w1 = await _add_watch(db, USER_ID, "Mint1")
    await ensure_watch_cron(cache, USER_ID, w1, sweep_interval_s=2700)
    await ensure_watch_cron(cache, USER_ID, {"id": 99, "sub_type": "mint", "value": "Orphan1"}, sweep_interval_s=2700)
    await ensure_watch_cron(cache, USER_ID, {"id": 100, "sub_type": "mint", "value": "Orphan2"}, sweep_interval_s=2700)
    assert await _cron_count(db) == 3

    synced = await sync_all_user_crons(cache, USER_ID, plan="free")
    names = await _cron_names(db)
    assert f"lineage:watchlist:{w1['id']}" in names
    assert "lineage:watchlist:99" not in names
    assert "lineage:watchlist:100" not in names


async def test_sync_idempotent(cache, db):
    w1 = await _add_watch(db, USER_ID, "Mint1")
    w2 = await _add_watch(db, USER_ID, "Mint2")
    await sync_all_user_crons(cache, USER_ID, plan="pro")
    count1 = await _cron_count(db)
    await sync_all_user_crons(cache, USER_ID, plan="pro")
    count2 = await _cron_count(db)
    assert count1 == count2


# ── Tests: seconds_to_cron_expr ──────────────────────────────────────────


def test_seconds_to_cron_expr():
    assert seconds_to_cron_expr(2700) == "*/45 * * * *"   # 45 min
    assert seconds_to_cron_expr(3600) == "0 */1 * * *"    # 1 hour
    assert seconds_to_cron_expr(7200) == "0 */2 * * *"    # 2 hours
    assert seconds_to_cron_expr(21600) == "0 */6 * * *"   # 6 hours
    assert seconds_to_cron_expr(900) == "*/15 * * * *"    # 15 min
    assert seconds_to_cron_expr(60) == "*/1 * * * *"      # 1 min
