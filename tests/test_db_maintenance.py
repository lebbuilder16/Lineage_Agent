"""Tests for db_maintenance — TTL cleanup functions and bundle_reports pruning."""

from __future__ import annotations

import time

import pytest

from lineage_agent.db_maintenance import (
    _BUNDLE_REPORTS_TTL_DAYS,
    _EVENTS_TTL_DAYS,
    _SOL_FLOWS_TTL_DAYS,
    _cleanup_expired_cache,
    _cleanup_old_bundle_reports,
    _cleanup_old_events,
    _cleanup_old_sol_flows,
    _incremental_vacuum,
    _wal_checkpoint,
)


# ---------------------------------------------------------------------------
# Fixture: a fresh SQLiteCache with the full schema initialised
# ---------------------------------------------------------------------------

@pytest.fixture
async def db(tmp_path):
    """Return a raw aiosqlite connection with the full cache schema."""
    from lineage_agent.cache import SQLiteCache
    cache = SQLiteCache(db_path=str(tmp_path / "maint_test.db"))
    conn = await cache._get_conn()
    yield conn
    await conn.close()


# ---------------------------------------------------------------------------
# _cleanup_expired_cache
# ---------------------------------------------------------------------------

class TestCleanupExpiredCache:

    @pytest.mark.asyncio
    async def test_deletes_expired_rows(self, db):
        now = time.time()
        await db.execute(
            "INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
            ("expired", '"v"', now - 10),
        )
        await db.execute(
            "INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
            ("fresh", '"v"', now + 3600),
        )
        await db.commit()
        deleted = await _cleanup_expired_cache(db)
        assert deleted >= 1
        row = await (await db.execute("SELECT key FROM cache WHERE key='expired'")).fetchone()
        assert row is None

    @pytest.mark.asyncio
    async def test_keeps_live_rows(self, db):
        now = time.time()
        await db.execute(
            "INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
            ("live", '"v"', now + 9999),
        )
        await db.commit()
        await _cleanup_expired_cache(db)
        row = await (await db.execute("SELECT key FROM cache WHERE key='live'")).fetchone()
        assert row is not None

    @pytest.mark.asyncio
    async def test_returns_int(self, db):
        deleted = await _cleanup_expired_cache(db)
        assert isinstance(deleted, int)


# ---------------------------------------------------------------------------
# _cleanup_old_sol_flows
# ---------------------------------------------------------------------------

class TestCleanupOldSolFlows:

    @pytest.mark.asyncio
    async def test_deletes_old_rows(self, db):
        old_block_time = int(time.time()) - (_SOL_FLOWS_TTL_DAYS + 1) * 86400
        recent_block_time = int(time.time())
        await db.execute(
            "INSERT INTO sol_flows "
            "(mint, from_address, to_address, amount_lamports, signature, block_time, recorded_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("MINT_OLD", "FROM_OLD", "TO_OLD", 100, "SIG_OLD", old_block_time, time.time()),
        )
        await db.execute(
            "INSERT INTO sol_flows "
            "(mint, from_address, to_address, amount_lamports, signature, block_time, recorded_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("MINT_NEW", "FROM_NEW", "TO_NEW", 100, "SIG_NEW", recent_block_time, time.time()),
        )
        await db.commit()
        deleted = await _cleanup_old_sol_flows(db)
        assert deleted >= 1
        row = await (
            await db.execute("SELECT mint FROM sol_flows WHERE mint='MINT_OLD'")
        ).fetchone()
        assert row is None

    @pytest.mark.asyncio
    async def test_keeps_recent_rows(self, db):
        recent_block_time = int(time.time())
        await db.execute(
            "INSERT INTO sol_flows "
            "(mint, from_address, to_address, amount_lamports, signature, block_time, recorded_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("MINT_KEEP", "FROM_K", "TO_K", 1, "SIG_KEEP", recent_block_time, time.time()),
        )
        await db.commit()
        await _cleanup_old_sol_flows(db)
        row = await (
            await db.execute("SELECT mint FROM sol_flows WHERE mint='MINT_KEEP'")
        ).fetchone()
        assert row is not None


# ---------------------------------------------------------------------------
# _cleanup_old_events
# ---------------------------------------------------------------------------

class TestCleanupOldEvents:

    @pytest.mark.asyncio
    async def test_deletes_old_events(self, db):
        old_ts = time.time() - (_EVENTS_TTL_DAYS + 1) * 86400
        fresh_ts = time.time()
        await db.execute(
            "INSERT INTO intelligence_events "
            "(event_type, mint, recorded_at) VALUES (?, ?, ?)",
            ("token_created", "MINT_OLD_EVT", old_ts),
        )
        await db.execute(
            "INSERT INTO intelligence_events "
            "(event_type, mint, recorded_at) VALUES (?, ?, ?)",
            ("token_created", "MINT_FRESH_EVT", fresh_ts),
        )
        await db.commit()
        deleted = await _cleanup_old_events(db)
        assert deleted >= 1
        row = await (
            await db.execute(
                "SELECT mint FROM intelligence_events WHERE mint='MINT_OLD_EVT'"
            )
        ).fetchone()
        assert row is None

    @pytest.mark.asyncio
    async def test_keeps_recent_events(self, db):
        fresh_ts = time.time()
        await db.execute(
            "INSERT INTO intelligence_events "
            "(event_type, mint, recorded_at) VALUES (?, ?, ?)",
            ("token_created", "MINT_KEEP_EVT", fresh_ts),
        )
        await db.commit()
        await _cleanup_old_events(db)
        row = await (
            await db.execute(
                "SELECT mint FROM intelligence_events WHERE mint='MINT_KEEP_EVT'"
            )
        ).fetchone()
        assert row is not None


# ---------------------------------------------------------------------------
# _cleanup_old_bundle_reports  (new function)
# ---------------------------------------------------------------------------

class TestCleanupOldBundleReports:

    @pytest.mark.asyncio
    async def test_deletes_old_bundle_reports(self, db):
        old_ts = time.time() - (_BUNDLE_REPORTS_TTL_DAYS + 1) * 86400
        fresh_ts = time.time()
        await db.execute(
            "INSERT INTO bundle_reports (mint, deployer, report_json, recorded_at) "
            "VALUES (?, ?, ?, ?)",
            ("OLD_MINT", "DEP", '{"verdict":"no_bundle_detected"}', old_ts),
        )
        await db.execute(
            "INSERT INTO bundle_reports (mint, deployer, report_json, recorded_at) "
            "VALUES (?, ?, ?, ?)",
            ("NEW_MINT", "DEP", '{"verdict":"bundle_detected"}', fresh_ts),
        )
        await db.commit()
        deleted = await _cleanup_old_bundle_reports(db)
        assert deleted >= 1
        row = await (
            await db.execute(
                "SELECT mint FROM bundle_reports WHERE mint='OLD_MINT'"
            )
        ).fetchone()
        assert row is None

    @pytest.mark.asyncio
    async def test_keeps_recent_bundle_reports(self, db):
        fresh_ts = time.time()
        await db.execute(
            "INSERT OR REPLACE INTO bundle_reports (mint, deployer, report_json, recorded_at) "
            "VALUES (?, ?, ?, ?)",
            ("KEEP_MINT", "DEP", '{}', fresh_ts),
        )
        await db.commit()
        await _cleanup_old_bundle_reports(db)
        row = await (
            await db.execute(
                "SELECT mint FROM bundle_reports WHERE mint='KEEP_MINT'"
            )
        ).fetchone()
        assert row is not None

    @pytest.mark.asyncio
    async def test_returns_int(self, db):
        deleted = await _cleanup_old_bundle_reports(db)
        assert isinstance(deleted, int)

    @pytest.mark.asyncio
    async def test_bundle_reports_ttl_is_30_days(self):
        """_BUNDLE_REPORTS_TTL_DAYS should be set to 30."""
        assert _BUNDLE_REPORTS_TTL_DAYS == 30


# ---------------------------------------------------------------------------
# _wal_checkpoint and _incremental_vacuum
# ---------------------------------------------------------------------------

class TestVacuumAndCheckpoint:

    @pytest.mark.asyncio
    async def test_wal_checkpoint_does_not_raise(self, db):
        await _wal_checkpoint(db)  # should not raise

    @pytest.mark.asyncio
    async def test_incremental_vacuum_does_not_raise(self, db):
        await _incremental_vacuum(db)  # should not raise
