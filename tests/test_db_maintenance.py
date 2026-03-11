"""Tests for lineage_agent.db_maintenance — cleanup helpers & task lifecycle.

All tests use in-memory aiosqlite databases to avoid any file-system side effects.
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

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


# ---------------------------------------------------------------------------
# _maintenance_loop — inline execution via monkeypatching
# ---------------------------------------------------------------------------

class TestMaintenanceLoop:
    """Test _maintenance_loop body by running it with mocked internals."""

    async def test_loop_runs_one_iteration_then_cancels(self, monkeypatch):
        """Run startup delay, one maintenance iteration, then cancel on sleep."""
        import lineage_agent.db_maintenance as dm
        import aiosqlite

        sleep_count = 0

        async def fake_sleep(seconds):
            nonlocal sleep_count
            sleep_count += 1
            if sleep_count == 1:
                return
            raise asyncio.CancelledError()

        async with aiosqlite.connect(":memory:") as mem_db:
            # Create all required tables
            await mem_db.execute("CREATE TABLE cache (key TEXT PRIMARY KEY, value TEXT, expires_at REAL)")
            await mem_db.execute("CREATE TABLE sol_flows (id INTEGER PRIMARY KEY, mint TEXT, block_time REAL)")
            await mem_db.execute("CREATE TABLE intelligence_events (id INTEGER PRIMARY KEY, event_type TEXT, recorded_at REAL)")
            await mem_db.commit()

            # Build a fake cache backend with _get_conn
            fake_cache = MagicMock()
            fake_cache._get_conn = AsyncMock(return_value=mem_db)

            monkeypatch.setattr("lineage_agent.db_maintenance.asyncio.sleep", fake_sleep)

            # Patch the lazy import of _cache_backend inside _maintenance_loop
            with patch("lineage_agent.data_sources._clients.cache", fake_cache):
                # Also patch the local import inside the loop function
                import lineage_agent.data_sources._clients as _clients_mod
                orig_cache = getattr(_clients_mod, "cache", None)
                _clients_mod.cache = fake_cache

                try:
                    await dm._maintenance_loop()
                finally:
                    if orig_cache is not None:
                        _clients_mod.cache = orig_cache

        assert sleep_count >= 2

    async def test_loop_skips_when_no_get_conn(self, monkeypatch):
        """If cache backend has no _get_conn, loop sleeps and continues."""
        import lineage_agent.db_maintenance as dm

        sleep_calls = []

        async def fake_sleep(seconds):
            sleep_calls.append(seconds)
            if len(sleep_calls) == 1:
                return
            raise asyncio.CancelledError()

        fake_cache = MagicMock(spec=[])  # no _get_conn attribute

        monkeypatch.setattr("lineage_agent.db_maintenance.asyncio.sleep", fake_sleep)

        import lineage_agent.data_sources._clients as _clients_mod
        orig_cache = getattr(_clients_mod, "cache", None)
        _clients_mod.cache = fake_cache

        try:
            await dm._maintenance_loop()
        finally:
            if orig_cache is not None:
                _clients_mod.cache = orig_cache

        assert len(sleep_calls) >= 2

    async def test_loop_handles_exception_in_iteration(self, monkeypatch):
        """Exceptions during maintenance are caught and loop continues."""
        import lineage_agent.db_maintenance as dm

        sleep_calls = []

        async def fake_sleep(seconds):
            sleep_calls.append(seconds)
            if len(sleep_calls) == 1:
                return
            raise asyncio.CancelledError()

        # Cache backend that raises on _get_conn
        fake_cache = MagicMock()
        fake_cache._get_conn = AsyncMock(side_effect=RuntimeError("DB error"))

        monkeypatch.setattr("lineage_agent.db_maintenance.asyncio.sleep", fake_sleep)

        import lineage_agent.data_sources._clients as _clients_mod
        orig_cache = getattr(_clients_mod, "cache", None)
        _clients_mod.cache = fake_cache

        try:
            await dm._maintenance_loop()
        finally:
            if orig_cache is not None:
                _clients_mod.cache = orig_cache

        assert len(sleep_calls) >= 2

    async def test_loop_uses_cache_cleanup_fallback_and_ignores_optional_failures(self, monkeypatch):
        import lineage_agent.db_maintenance as dm

        sleep_calls = 0

        async def fake_sleep(seconds):
            nonlocal sleep_calls
            sleep_calls += 1
            if sleep_calls == 1:
                return
            raise asyncio.CancelledError()

        class FakeCursor:
            rowcount = 7

        class FakeDb:
            def __init__(self):
                self.executed = []
                self.commit_count = 0

            async def execute(self, sql, params=()):
                self.executed.append((sql, params))
                return FakeCursor()

            async def commit(self):
                self.commit_count += 1

        fake_db = FakeDb()
        fake_cache = MagicMock()
        fake_cache._get_conn = AsyncMock(return_value=fake_db)

        monkeypatch.setattr("lineage_agent.db_maintenance.asyncio.sleep", fake_sleep)

        import lineage_agent.data_sources._clients as _clients_mod
        orig_cache = getattr(_clients_mod, "cache", None)
        _clients_mod.cache = fake_cache

        try:
            with patch("lineage_agent.db_maintenance._cleanup_expired_cache", AsyncMock(side_effect=RuntimeError("no limit"))):
                with patch("lineage_agent.db_maintenance._cleanup_old_sol_flows", AsyncMock(side_effect=RuntimeError("no table"))):
                    with patch("lineage_agent.db_maintenance._cleanup_old_events", AsyncMock(side_effect=RuntimeError("no table"))):
                        with patch("lineage_agent.db_maintenance._wal_checkpoint", AsyncMock(side_effect=RuntimeError("wal fail"))):
                            with patch("lineage_agent.db_maintenance._incremental_vacuum", AsyncMock(side_effect=RuntimeError("vacuum fail"))):
                                await dm._maintenance_loop()
        finally:
            if orig_cache is not None:
                _clients_mod.cache = orig_cache

        assert any("DELETE FROM cache WHERE expires_at < ?" in sql for sql, _ in fake_db.executed)
        assert fake_db.commit_count == 1
