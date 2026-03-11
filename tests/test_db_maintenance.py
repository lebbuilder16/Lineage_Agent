"""Tests for lineage_agent.db_maintenance — cleanup helpers & task lifecycle.

All tests use in-memory aiosqlite databases to avoid any file-system side effects.
"""

from __future__ import annotations

import asyncio
import time

import aiosqlite
import pytest

from lineage_agent.db_maintenance import (
    _cleanup_expired_cache,
    _cleanup_old_events,
    _cleanup_old_sol_flows,
    _incremental_vacuum,
    _wal_checkpoint,
    cancel_db_maintenance,
    schedule_db_maintenance,
)


# ---------------------------------------------------------------------------
# Fixtures — minimal DB schemas
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_with_cache():
    """In-memory DB with a cache table."""
    async with aiosqlite.connect(":memory:") as db:
        await db.execute("""
            CREATE TABLE cache (
                key        TEXT PRIMARY KEY,
                value      TEXT,
                expires_at REAL
            )
        """)
        await db.commit()
        yield db


@pytest.fixture
async def db_with_sol_flows():
    """In-memory DB with a sol_flows table."""
    async with aiosqlite.connect(":memory:") as db:
        await db.execute("""
            CREATE TABLE sol_flows (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                mint       TEXT,
                block_time REAL
            )
        """)
        await db.commit()
        yield db


@pytest.fixture
async def db_with_events():
    """In-memory DB with an intelligence_events table."""
    async with aiosqlite.connect(":memory:") as db:
        await db.execute("""
            CREATE TABLE intelligence_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type  TEXT,
                recorded_at REAL
            )
        """)
        await db.commit()
        yield db


@pytest.fixture
async def db_full():
    """In-memory DB with all three tables."""
    async with aiosqlite.connect(":memory:") as db:
        await db.execute("""
            CREATE TABLE cache (
                key TEXT PRIMARY KEY, value TEXT, expires_at REAL
            )
        """)
        await db.execute("""
            CREATE TABLE sol_flows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mint TEXT, block_time REAL
            )
        """)
        await db.execute("""
            CREATE TABLE intelligence_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT, recorded_at REAL
            )
        """)
        await db.commit()
        yield db


# ---------------------------------------------------------------------------
# _cleanup_expired_cache
# ---------------------------------------------------------------------------

class TestCleanupExpiredCache:
    async def test_deletes_expired_rows(self, db_with_cache):
        now = time.time()
        # three rows: one already expired, two still valid
        await db_with_cache.executemany(
            "INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
            [
                ("k1", "v1", now - 100),   # expired
                ("k2", "v2", now + 3600),  # valid
                ("k3", "v3", now + 7200),  # valid
            ],
        )
        await db_with_cache.commit()

        deleted = await _cleanup_expired_cache(db_with_cache)
        assert deleted == 1

        cur = await db_with_cache.execute("SELECT COUNT(*) FROM cache")
        (count,) = await cur.fetchone()
        assert count == 2

    async def test_empty_table_returns_zero(self, db_with_cache):
        deleted = await _cleanup_expired_cache(db_with_cache)
        assert deleted == 0

    async def test_all_expired_deleted(self, db_with_cache):
        now = time.time()
        await db_with_cache.executemany(
            "INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
            [(f"k{i}", "v", now - 1000) for i in range(5)],
        )
        await db_with_cache.commit()

        deleted = await _cleanup_expired_cache(db_with_cache)
        assert deleted == 5

        cur = await db_with_cache.execute("SELECT COUNT(*) FROM cache")
        (c,) = await cur.fetchone()
        assert c == 0

    async def test_no_valid_rows_touched(self, db_with_cache):
        now = time.time()
        await db_with_cache.executemany(
            "INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
            [(f"k{i}", "v", now + 9999) for i in range(3)],
        )
        await db_with_cache.commit()

        deleted = await _cleanup_expired_cache(db_with_cache)
        assert deleted == 0


# ---------------------------------------------------------------------------
# _cleanup_old_sol_flows
# ---------------------------------------------------------------------------

class TestCleanupOldSolFlows:
    async def test_deletes_old_flows(self, db_with_sol_flows):
        now = time.time()
        cutoff = now - (91 * 86400)  # older than 90 days
        await db_with_sol_flows.executemany(
            "INSERT INTO sol_flows (mint, block_time) VALUES (?, ?)",
            [
                ("M1", cutoff - 1000),   # old
                ("M2", now - 3600),      # recent
                ("M3", now),             # recent
            ],
        )
        await db_with_sol_flows.commit()

        deleted = await _cleanup_old_sol_flows(db_with_sol_flows)
        assert deleted >= 1

        cur = await db_with_sol_flows.execute("SELECT COUNT(*) FROM sol_flows")
        (count,) = await cur.fetchone()
        assert count == 2

    async def test_null_block_time_not_deleted(self, db_with_sol_flows):
        await db_with_sol_flows.execute(
            "INSERT INTO sol_flows (mint, block_time) VALUES (?, ?)", ("M_null", None)
        )
        await db_with_sol_flows.commit()

        deleted = await _cleanup_old_sol_flows(db_with_sol_flows)
        assert deleted == 0

        cur = await db_with_sol_flows.execute("SELECT COUNT(*) FROM sol_flows")
        (c,) = await cur.fetchone()
        assert c == 1

    async def test_empty_table(self, db_with_sol_flows):
        deleted = await _cleanup_old_sol_flows(db_with_sol_flows)
        assert deleted == 0


# ---------------------------------------------------------------------------
# _cleanup_old_events
# ---------------------------------------------------------------------------

class TestCleanupOldEvents:
    async def test_deletes_old_events(self, db_with_events):
        now = time.time()
        old_ts = now - (181 * 86400)  # older than 180 days
        await db_with_events.executemany(
            "INSERT INTO intelligence_events (event_type, recorded_at) VALUES (?, ?)",
            [
                ("token_created", old_ts),       # old
                ("token_rugged", now - 3600),    # recent
            ],
        )
        await db_with_events.commit()

        deleted = await _cleanup_old_events(db_with_events)
        assert deleted == 1

    async def test_null_recorded_at_not_deleted(self, db_with_events):
        await db_with_events.execute(
            "INSERT INTO intelligence_events (event_type, recorded_at) VALUES (?, ?)",
            ("token_created", None),
        )
        await db_with_events.commit()

        deleted = await _cleanup_old_events(db_with_events)
        assert deleted == 0

    async def test_empty_table_returns_zero(self, db_with_events):
        assert await _cleanup_old_events(db_with_events) == 0


# ---------------------------------------------------------------------------
# _wal_checkpoint
# ---------------------------------------------------------------------------

class TestWalCheckpoint:
    async def test_runs_without_error(self, db_full):
        # Should not raise even on an in-memory DB (PRAGMA is effectively a no-op)
        await _wal_checkpoint(db_full)

    async def test_idempotent(self, db_full):
        await _wal_checkpoint(db_full)
        await _wal_checkpoint(db_full)


# ---------------------------------------------------------------------------
# _incremental_vacuum
# ---------------------------------------------------------------------------

class TestIncrementalVacuum:
    async def test_runs_without_error(self, db_full):
        await _incremental_vacuum(db_full)

    async def test_idempotent(self, db_full):
        await _incremental_vacuum(db_full)
        await _incremental_vacuum(db_full)


# ---------------------------------------------------------------------------
# schedule_db_maintenance / cancel_db_maintenance
# ---------------------------------------------------------------------------

class TestScheduleCancel:
    async def test_schedule_creates_task(self, monkeypatch):
        """schedule_db_maintenance should create a running asyncio Task."""
        import lineage_agent.db_maintenance as dm

        # Patch _maintenance_loop so it never actually runs
        async def _instant_loop():
            await asyncio.sleep(0)

        monkeypatch.setattr(dm, "_maintenance_loop", _instant_loop)
        monkeypatch.setattr(dm, "_maintenance_task", None)

        schedule_db_maintenance()
        task = dm._maintenance_task
        assert task is not None
        assert not task.done()

        # Clean up
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    async def test_cancel_stops_task(self, monkeypatch):
        """cancel_db_maintenance should cancel the running task."""
        import lineage_agent.db_maintenance as dm

        async def _long_loop():
            await asyncio.sleep(3600)

        monkeypatch.setattr(dm, "_maintenance_loop", _long_loop)
        monkeypatch.setattr(dm, "_maintenance_task", None)

        schedule_db_maintenance()
        task = dm._maintenance_task
        assert task is not None

        cancel_db_maintenance()
        await asyncio.sleep(0)
        assert task.cancelled() or task.done()

    async def test_cancel_noop_when_no_task(self, monkeypatch):
        """cancel_db_maintenance should not raise when no task is running."""
        import lineage_agent.db_maintenance as dm
        monkeypatch.setattr(dm, "_maintenance_task", None)
        cancel_db_maintenance()  # should not raise
