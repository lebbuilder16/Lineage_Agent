"""
Database maintenance — periodic TTL cleanup, WAL checkpointing, and VACUUM.

Runs as a background task inside the FastAPI lifespan:
- Every 6 hours: delete expired cache rows, old sol_flows, old events
- Every 24 hours: WAL checkpoint + incremental VACUUM

All operations are best-effort — failures are logged but never crash the server.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
_CLEANUP_INTERVAL = 6 * 3600       # 6 hours between TTL sweeps
_VACUUM_INTERVAL = 24 * 3600       # 24 hours between VACUUM runs
_SOL_FLOWS_TTL_DAYS = 90           # Purge sol_flows older than 90 days
_EVENTS_TTL_DAYS = 180             # Purge intelligence_events older than 180 days
_CACHE_EXPIRE_BATCH = 1000         # Max rows to delete per batch
_SWEEP_FLAGS_TTL_DAYS = 90         # Purge sweep_flags older than 90 days
_SNAPSHOTS_TTL_DAYS = 90           # Purge watch_snapshots older than 90 days

_maintenance_task: Optional[asyncio.Task] = None


async def _cleanup_expired_cache(db) -> int:
    """Delete expired cache rows. Returns count deleted."""
    now = time.time()
    cursor = await db.execute(
        "DELETE FROM cache WHERE rowid IN "
        "(SELECT rowid FROM cache WHERE expires_at < ? LIMIT ?)",
        (now, _CACHE_EXPIRE_BATCH),
    )
    await db.commit()
    return cursor.rowcount


async def _cleanup_old_sol_flows(db) -> int:
    """Delete sol_flows rows older than _SOL_FLOWS_TTL_DAYS."""
    import time as _t
    cutoff = _t.time() - (_SOL_FLOWS_TTL_DAYS * 86400)
    cursor = await db.execute(
        "DELETE FROM sol_flows WHERE block_time IS NOT NULL AND block_time < ?",
        (cutoff,),
    )
    await db.commit()
    return cursor.rowcount


async def _cleanup_old_events(db) -> int:
    """Delete intelligence_events older than _EVENTS_TTL_DAYS."""
    import time as _t
    cutoff = _t.time() - (_EVENTS_TTL_DAYS * 86400)
    cursor = await db.execute(
        "DELETE FROM intelligence_events WHERE recorded_at IS NOT NULL AND recorded_at < ?",
        (cutoff,),
    )
    await db.commit()
    return cursor.rowcount


async def _cleanup_old_sweep_flags(db) -> int:
    """Delete sweep_flags older than _SWEEP_FLAGS_TTL_DAYS (keep _REFERENCE rows)."""
    cutoff = time.time() - (_SWEEP_FLAGS_TTL_DAYS * 86400)
    cursor = await db.execute(
        "DELETE FROM sweep_flags WHERE created_at < ? AND flag_type != '_REFERENCE'",
        (cutoff,),
    )
    await db.commit()
    return cursor.rowcount


async def _cleanup_orphan_snapshots(db) -> int:
    """Delete watch_snapshots for deleted watches + old snapshots beyond TTL."""
    # Orphans: snapshots for watches that no longer exist
    c1 = await db.execute(
        "DELETE FROM watch_snapshots WHERE watch_id NOT IN (SELECT id FROM user_watches)"
    )
    # Old snapshots beyond retention
    cutoff = time.time() - (_SNAPSHOTS_TTL_DAYS * 86400)
    c2 = await db.execute(
        "DELETE FROM watch_snapshots WHERE scanned_at < ?", (cutoff,)
    )
    await db.commit()
    return c1.rowcount + c2.rowcount


async def _wal_checkpoint(db) -> None:
    """Force a WAL checkpoint to keep the WAL file from growing unbounded."""
    await db.execute("PRAGMA wal_checkpoint(TRUNCATE)")


async def _incremental_vacuum(db) -> None:
    """Run an incremental VACUUM to reclaim space without a full rebuild."""
    await db.execute("PRAGMA auto_vacuum = INCREMENTAL")
    await db.execute("PRAGMA incremental_vacuum(500)")


async def _maintenance_loop() -> None:
    """Main maintenance loop — runs cleanup every 6h, vacuum every 24h."""
    from .data_sources._clients import cache as _cache_backend

    last_vacuum = 0.0

    # Wait 60s after startup to avoid competing with initial data loading
    await asyncio.sleep(60)
    logger.info("DB maintenance loop started (cleanup=%dh, vacuum=%dh)",
                _CLEANUP_INTERVAL // 3600, _VACUUM_INTERVAL // 3600)

    while True:
        try:
            # Get the raw DB connection from the SQLite cache backend
            if not hasattr(_cache_backend, '_get_conn'):
                logger.debug("Cache backend has no _get_conn — skipping maintenance")
                await asyncio.sleep(_CLEANUP_INTERVAL)
                continue

            db = await _cache_backend._get_conn()

            # TTL cleanup
            cache_deleted = 0
            try:
                cache_deleted = await _cleanup_expired_cache(db)
            except Exception:
                logger.debug("cache cleanup failed (table may not have LIMIT support)")
                # SQLite doesn't support LIMIT in DELETE without compile flag
                # Fall back to non-limited delete
                try:
                    now = time.time()
                    cursor = await db.execute(
                        "DELETE FROM cache WHERE expires_at < ?", (now,)
                    )
                    await db.commit()
                    cache_deleted = cursor.rowcount
                except Exception:
                    logger.exception("cache cleanup fallback failed")

            flows_deleted = 0
            try:
                flows_deleted = await _cleanup_old_sol_flows(db)
            except Exception:
                logger.debug("sol_flows cleanup skipped (table may not exist)")

            events_deleted = 0
            try:
                events_deleted = await _cleanup_old_events(db)
            except Exception:
                logger.debug("events cleanup skipped (table may not exist)")

            flags_deleted = 0
            try:
                flags_deleted = await _cleanup_old_sweep_flags(db)
            except Exception:
                logger.debug("sweep_flags cleanup skipped (table may not exist)")

            snapshots_deleted = 0
            try:
                snapshots_deleted = await _cleanup_orphan_snapshots(db)
            except Exception:
                logger.debug("watch_snapshots cleanup skipped (table may not exist)")

            logger.info(
                "DB maintenance: cache=%d, sol_flows=%d, events=%d, flags=%d, snapshots=%d rows deleted",
                cache_deleted, flows_deleted, events_deleted, flags_deleted, snapshots_deleted,
            )

            # Retry failed FCM push notifications
            try:
                from .alert_service import retry_pending_notifications
                retried = await retry_pending_notifications()
                if retried > 0:
                    logger.info("Notification retry: %d sent", retried)
            except Exception:
                logger.debug("notification retry skipped")

            # Memory retention cleanup (episodes, calibration rules, anomalies)
            try:
                from .memory_service import cleanup_memory_tables
                mem_counts = await cleanup_memory_tables()
                if any(v > 0 for v in mem_counts.values()):
                    logger.info("Memory cleanup: %s", mem_counts)
            except Exception:
                logger.debug("memory cleanup skipped")

            # Narrative cluster detection (automated — runs every maintenance cycle)
            try:
                from .memory_service import detect_narrative_clusters
                clusters = await detect_narrative_clusters(window_days=7, min_deployers=3)
                if clusters:
                    logger.info("Narrative clusters: %d detected", len(clusters))
            except Exception:
                logger.debug("narrative cluster detection skipped")

            # WAL checkpoint every cycle
            try:
                await _wal_checkpoint(db)
            except Exception:
                logger.debug("WAL checkpoint failed")

            # VACUUM every 24 hours
            now = time.time()
            if now - last_vacuum >= _VACUUM_INTERVAL:
                try:
                    await _incremental_vacuum(db)
                    last_vacuum = now
                    logger.info("Incremental VACUUM completed")
                except Exception:
                    logger.debug("Incremental VACUUM failed")

        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("DB maintenance iteration failed")

        try:
            await asyncio.sleep(_CLEANUP_INTERVAL)
        except asyncio.CancelledError:
            break


def schedule_db_maintenance() -> None:
    """Start the maintenance background task."""
    global _maintenance_task
    _maintenance_task = asyncio.create_task(
        _maintenance_loop(), name="db_maintenance"
    )


def cancel_db_maintenance() -> None:
    """Cancel the maintenance background task."""
    global _maintenance_task
    if _maintenance_task and not _maintenance_task.done():
        _maintenance_task.cancel()
