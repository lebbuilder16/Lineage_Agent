"""
Background Rug Detection Sweep.

Periodically scans recently-recorded tokens in ``intelligence_events`` and
detects liquidity rug-pulls by comparing the recorded liquidity at analysis
time against the current liquidity from DexScreener.

When a rug is detected, a ``token_rugged`` event is inserted so that the
**Death Clock** forensic signal has real historical data to work with.

The sweep runs every ``_SWEEP_INTERVAL_SECONDS`` (default 15 min) as a
background ``asyncio.Task`` launched during the FastAPI lifespan.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from config import RUG_LIQUIDITY_THRESHOLD_USD as _RUG_LIQ_THRESHOLD
from typing import Optional

from .data_sources._clients import (
    event_insert,
    event_query,
    get_dex_client,
)
from .constants import DEAD_LIQUIDITY_USD

logger = logging.getLogger(__name__)

_SWEEP_INTERVAL_SECONDS = 15 * 60  # 15 minutes
_RUG_LIQ_THRESHOLD = DEAD_LIQUIDITY_USD  # USD — below this we consider it rugged
_MIN_RECORDED_LIQ = 500.0         # only consider tokens that once had real liquidity
_LOOKBACK_SECONDS = 48 * 3600     # scan tokens recorded in last 48 h
_BATCH_CONCURRENCY = 3            # concurrent DexScreener lookups per sweep

_sweep_task: Optional[asyncio.Task] = None


async def _run_rug_sweep() -> int:
    """One sweep iteration.  Returns number of rugs detected."""
    cutoff = time.time() - _LOOKBACK_SECONDS
    rows = await event_query(
        where=(
            "event_type = 'token_created' "
            "AND liq_usd > ? "
            "AND recorded_at > ? "
            "AND mint NOT IN ("
            "  SELECT mint FROM intelligence_events WHERE event_type = 'token_rugged'"
            ")"
        ),
        params=(_MIN_RECORDED_LIQ, cutoff),
        columns="mint, deployer, liq_usd, created_at",
        limit=200,
    )

    if not rows:
        return 0

    dex = get_dex_client()
    sem = asyncio.Semaphore(_BATCH_CONCURRENCY)
    rugs_found = 0

    async def _check(row: dict) -> None:
        nonlocal rugs_found
        mint = row.get("mint", "")
        if not mint:
            return

        async with sem:
            try:
                pairs = await dex.get_token_pairs(mint)
            except Exception:
                return

        # Current liquidity across all pairs
        current_liq = 0.0
        for p in pairs:
            current_liq += float((p.get("liquidity") or {}).get("usd") or 0)

        if current_liq >= _RUG_LIQ_THRESHOLD:
            return  # still alive

        # Rug detected
        now_iso = datetime.now(tz=timezone.utc).isoformat()
        try:
            await event_insert(
                event_type="token_rugged",
                mint=mint,
                deployer=row.get("deployer", ""),
                liq_usd=current_liq,
                rugged_at=now_iso,
                created_at=row.get("created_at"),
            )
            rugs_found += 1
            logger.info(
                "Rug detected: %s (was $%.0f → now $%.0f)",
                mint, row.get("liq_usd", 0), current_liq,
            )
            # Fire-and-forget: trace where the SOL went (Initiative 2)
            _deployer = row.get("deployer", "")
            if _deployer:
                try:
                    from .sol_flow_service import trace_sol_flow
                    asyncio.create_task(
                        trace_sol_flow(mint, _deployer),
                        name=f"sol_trace_{mint[:8]}",
                    )
                except Exception as _te:
                    logger.debug("trace_sol_flow task launch failed: %s", _te)
        except Exception:
            logger.debug("Failed to record rug for %s", mint, exc_info=True)

    await asyncio.gather(*[_check(r) for r in rows], return_exceptions=True)
    return rugs_found


async def _sweep_loop() -> None:
    """Infinite loop that runs rug sweeps periodically."""
    logger.info("Rug sweep background task started (interval=%ds)", _SWEEP_INTERVAL_SECONDS)
    while True:
        try:
            count = await _run_rug_sweep()
            if count:
                logger.info("Rug sweep complete: %d new rug(s) recorded", count)
            else:
                logger.debug("Rug sweep complete: 0 new rugs")
        except asyncio.CancelledError:
            logger.info("Rug sweep task cancelled")
            return
        except Exception:
            logger.warning("Rug sweep iteration failed", exc_info=True)

        await asyncio.sleep(_SWEEP_INTERVAL_SECONDS)


def schedule_rug_sweep() -> asyncio.Task:
    """Launch the background rug-sweep task.  Returns the Task handle."""
    global _sweep_task
    if _sweep_task is not None and not _sweep_task.done():
        return _sweep_task
    _sweep_task = asyncio.create_task(_sweep_loop(), name="rug_sweep")
    return _sweep_task


def cancel_rug_sweep() -> None:
    """Cancel the background rug-sweep task (called at shutdown)."""
    global _sweep_task
    if _sweep_task is not None and not _sweep_task.done():
        _sweep_task.cancel()
        _sweep_task = None
