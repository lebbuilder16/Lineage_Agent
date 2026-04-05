"""
Background task queue using arq (Redis-backed async worker framework).

When ``ARQ_REDIS_URL`` is set, heavy analyses are dispatched to a Redis
queue and executed by one or more ``arq`` worker processes.  When the
variable is empty the module falls back to :func:`asyncio.create_task`
(identical to the previous behaviour) and logs a clear INFO message.

Worker startup (separate process / Fly machine)::

    arq lineage_agent.task_queue.WorkerSettings

Task registration
-----------------
Tasks are ordinary async functions that receive ``ctx`` as their first
argument (arq convention).  Add new tasks to ``WorkerSettings.functions``
and expose them via :func:`enqueue_task`.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Callable, Coroutine, Optional

logger = logging.getLogger(__name__)

# Lazy arq pool — created once at first enqueue call.
_pool: Optional[Any] = None
_pool_lock: asyncio.Lock | None = None


def _get_lock() -> asyncio.Lock:
    global _pool_lock
    if _pool_lock is None:
        _pool_lock = asyncio.Lock()
    return _pool_lock


async def _get_pool() -> Optional[Any]:
    """Return an arq Redis pool, or ``None`` when Redis is not configured."""
    global _pool
    from config import ARQ_REDIS_URL  # noqa: PLC0415 — deferred import avoids circular dep
    if not ARQ_REDIS_URL:
        return None

    if _pool is not None:
        return _pool

    async with _get_lock():
        if _pool is not None:  # double-checked locking
            return _pool
        try:
            from arq import create_pool  # noqa: PLC0415
            from arq.connections import RedisSettings  # noqa: PLC0415
            _pool = await create_pool(RedisSettings.from_dsn(ARQ_REDIS_URL))
            logger.info("arq: Redis pool created (%s)", ARQ_REDIS_URL.split("@")[-1])
        except Exception:
            logger.error("arq: failed to connect to Redis — falling back to asyncio.create_task", exc_info=True)
            _pool = None
    return _pool


async def enqueue_task(
    task_func: Callable[..., Coroutine[Any, Any, Any]],
    *args: Any,
    **kwargs: Any,
) -> bool:
    """Enqueue a task in the arq Redis queue.

    Returns
    -------
    ``True``  — task successfully enqueued in Redis.
    ``False`` — Redis unavailable; caller should fall back to asyncio.create_task.

    Never raises.
    """
    pool = await _get_pool()
    if pool is None:
        return False
    try:
        await pool.enqueue_job(task_func.__name__, *args, **kwargs)
        logger.debug("arq: enqueued %s args=%s", task_func.__name__, args)
        return True
    except Exception:
        logger.warning("arq: enqueue failed for %s — falling back", task_func.__name__, exc_info=True)
        return False


# ---------------------------------------------------------------------------
# Task implementations
# ---------------------------------------------------------------------------

async def task_analyze_bundle(ctx: dict, mint: str, deployer: str, sol_price: Optional[float] = None) -> None:
    """Arq worker task: run full bundle analysis for a token launch."""
    from .bundle_tracker_service import analyze_bundle  # noqa: PLC0415
    try:
        await analyze_bundle(mint, deployer, sol_price)
        logger.info("arq[task_analyze_bundle]: completed mint=%s", mint[:8])
    except Exception:
        logger.exception("arq[task_analyze_bundle]: failed for mint=%s", mint[:8])
        raise  # let arq handle retry policy


async def task_trace_sol_flow(ctx: dict, mint: str, deployer: str, bundle_seeds: Optional[list[str]] = None) -> None:
    """Arq worker task: run SOL flow trace for a rugged token."""
    from .sol_flow_service import trace_sol_flow  # noqa: PLC0415
    try:
        await trace_sol_flow(mint, deployer, extra_seed_wallets=bundle_seeds or [])
        logger.info("arq[task_trace_sol_flow]: completed mint=%s", mint[:8])
    except Exception:
        logger.exception("arq[task_trace_sol_flow]: failed for mint=%s", mint[:8])
        raise


async def task_refresh_wallet_labels(ctx: dict) -> None:
    """Arq worker task: refresh dynamic wallet labels from CSV."""
    from config import WALLET_LABELS_CSV_URL  # noqa: PLC0415
    from .wallet_labels import refresh_dynamic_labels  # noqa: PLC0415
    if not WALLET_LABELS_CSV_URL:
        return
    try:
        count = await refresh_dynamic_labels(WALLET_LABELS_CSV_URL)
        logger.info("arq[task_refresh_wallet_labels]: loaded %d labels", count)
    except Exception:
        logger.exception("arq[task_refresh_wallet_labels]: failed")
        raise


async def task_rescan_watch(ctx: dict, watch_id: int, user_id: int, plan: str = "free") -> None:
    """Arq worker task: run a single watchlist rescan + dispatch alerts."""
    import json
    import time as _time
    from .watchlist_monitor_service import run_single_rescan  # noqa: PLC0415
    from .alert_service import enqueue_alert  # noqa: PLC0415
    from .metrics import record_rescan, record_sweep_flags  # noqa: PLC0415
    from .data_sources._clients import cache  # noqa: PLC0415

    _t0 = _time.monotonic()
    try:
        result = await run_single_rescan(watch_id, user_id, cache, plan=plan)
        _dur = _time.monotonic() - _t0
        if not result:
            record_rescan("empty", _dur)
            return
        record_rescan("success", _dur)
        for f in result.get("flags", []):
            record_sweep_flags(f.get("severity", "info"))

        # Enqueue critical/warning flags for async alert delivery
        for flag in result.get("flags", []):
            if flag["severity"] not in ("critical", "warning"):
                continue
            _flag_title = f"{'🔴' if flag['severity'] == 'critical' else '⚠️'} {flag['title']}"
            _fd = {}
            try:
                _fd = json.loads(flag.get("detail", "{}")) if isinstance(flag.get("detail"), str) else (flag.get("detail") or {})
            except Exception:
                pass
            # Look up FCM token
            _fcm = None
            try:
                db = await cache._get_conn()
                cur = await db.execute(
                    "SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL",
                    (user_id,),
                )
                row = await cur.fetchone()
                if row and row[0]:
                    _fcm = row[0]
            except Exception:
                pass
            await enqueue_alert({
                "type": "sweep_flag",
                "alert_type": flag["flag_type"],
                "title": _flag_title,
                "message": flag["title"],
                "body": flag["title"],
                "mint": result["mint"],
                "token_name": _fd.get("token_name") or _fd.get("name") or result["mint"][:8],
                "image_uri": _fd.get("image_uri") or None,
                "risk_score": result.get("new_score", 0),
                "timestamp": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime()),
                "id": f"sweep-{result['mint'][:8]}-{flag['flag_type']}-{int(_time.time())}",
                "read": False,
                "flag_type": flag["flag_type"],
                "urgency": "high" if flag["severity"] == "critical" else "normal",
            }, user_id=user_id, fcm_token=_fcm)

        logger.info("arq[task_rescan_watch]: done watch=%d user=%d flags=%d (%.1fs)",
                     watch_id, user_id, len(result.get("flags", [])), _dur)
    except Exception:
        record_rescan("error", _time.monotonic() - _t0)
        logger.exception("arq[task_rescan_watch]: failed watch=%d", watch_id)
        raise


# ---------------------------------------------------------------------------
# Arq WorkerSettings (used by ``arq lineage_agent.task_queue.WorkerSettings``)
# ---------------------------------------------------------------------------

class WorkerSettings:
    """Arq worker configuration.

    Start with::

        arq lineage_agent.task_queue.WorkerSettings
    """

    functions = [task_analyze_bundle, task_trace_sol_flow, task_refresh_wallet_labels, task_rescan_watch]
    max_jobs = int(os.getenv("ARQ_MAX_JOBS", "10"))
    job_timeout = int(os.getenv("ARQ_JOB_TIMEOUT", "120"))

    @staticmethod
    async def on_startup(ctx: dict) -> None:
        from .data_sources._clients import init_clients  # noqa: PLC0415
        await init_clients()
        logger.info("arq worker started")

    @staticmethod
    async def on_shutdown(ctx: dict) -> None:
        from .data_sources._clients import close_clients  # noqa: PLC0415
        await close_clients()
        logger.info("arq worker shut down")

    @classmethod
    def redis_settings(cls):  # type: ignore[override]
        from arq.connections import RedisSettings  # noqa: PLC0415
        from config import ARQ_REDIS_URL  # noqa: PLC0415
        return RedisSettings.from_dsn(ARQ_REDIS_URL)
