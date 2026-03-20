"""Unified investigation service — tier-adaptive forensic analysis.

Orchestrates three levels of investigation depth via a single async
generator that yields SSE event dicts:

- **Free**: Scan pipeline only → heuristic score, no AI.
- **Pro**: Scan + single-shot AI verdict (Haiku).
- **Pro+/Whale**: Scan + autonomous agent investigation (Sonnet multi-turn).

The generator adapts its behavior based on the caller's ``TierLimits``
so that one endpoint can serve all subscription tiers.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, AsyncGenerator, Optional

from .subscription_tiers import TierLimits

logger = logging.getLogger(__name__)


# ── SSE event helper ────────────────────────────────────────────────────────

def _evt(event: str, data: dict) -> dict:
    """Build an SSE event dict ready for EventSourceResponse."""
    return {"event": event, "data": json.dumps(data, default=str)}


# ── Phase 1: Scan pipeline ─────────────────────────────────────────────────

async def _run_scan_pipeline(
    mint: str,
    *,
    force_refresh: bool = False,
) -> AsyncGenerator[dict, None]:
    """Run the forensic scan pipeline, yielding step events.

    Extracts the scan logic formerly inlined in ``api.py:stream_ai_analysis``.
    Returns (via the final yield) the collected scan artefacts as a dict.
    """
    from .lineage_detector import detect_lineage  # noqa: PLC0415
    from .deployer_service import compute_deployer_profile  # noqa: PLC0415
    from .cartel_service import compute_cartel_report  # noqa: PLC0415

    yield _evt("phase", {"phase": "scan", "status": "started"})

    # 1. Lineage
    yield _evt("step", {"step": "lineage", "status": "running"})
    t0 = time.monotonic()
    lineage_res = None
    try:
        lineage_res = await asyncio.wait_for(
            detect_lineage(mint, force_refresh=force_refresh),
            timeout=55.0,
        )
    except Exception as exc:
        logger.warning("[investigate] lineage failed for %s: %s", mint[:12], exc)
    yield _evt("step", {"step": "lineage", "status": "done", "ms": int((time.monotonic() - t0) * 1000)})

    # 2. Deployer profile — prefer data already in lineage
    deployer_addr = _deployer_from_lineage(lineage_res)
    yield _evt("step", {"step": "deployer", "status": "running"})
    td = time.monotonic()
    has_deployer = lineage_res and getattr(lineage_res, "deployer_profile", None) is not None
    if not has_deployer and deployer_addr:
        try:
            await asyncio.wait_for(compute_deployer_profile(deployer_addr), timeout=15.0)
        except Exception as exc:
            logger.warning("[investigate] deployer fallback failed for %s: %s", mint[:12], exc)
    yield _evt("step", {"step": "deployer", "status": "done", "ms": int((time.monotonic() - td) * 1000)})

    # 3. Cartel detection — prefer data already in lineage
    yield _evt("step", {"step": "cartel", "status": "running"})
    tc = time.monotonic()
    has_cartel = lineage_res and getattr(lineage_res, "cartel_report", None) is not None
    if not has_cartel and deployer_addr:
        try:
            await asyncio.wait_for(compute_cartel_report(mint, deployer_addr), timeout=15.0)
        except Exception as exc:
            logger.warning("[investigate] cartel fallback failed for %s: %s", mint[:12], exc)
    yield _evt("step", {"step": "cartel", "status": "done", "ms": int((time.monotonic() - tc) * 1000)})

    # 4-5. Bundle + SOL flow (parallel)
    yield _evt("step", {"step": "bundle", "status": "running"})
    yield _evt("step", {"step": "sol_flow", "status": "running"})
    t1 = time.monotonic()
    bundle_res = None
    sol_res = None
    try:
        bundle_res, sol_res = await _load_supporting_reports(mint, lineage_res, force_refresh=force_refresh)
    except Exception as exc:
        logger.warning("[investigate] supporting reports failed for %s: %s", mint[:12], exc)
    data_ms = int((time.monotonic() - t1) * 1000)
    yield _evt("step", {"step": "bundle", "status": "done", "ms": data_ms})
    yield _evt("step", {"step": "sol_flow", "status": "done", "ms": data_ms})

    yield _evt("phase", {"phase": "scan", "status": "done"})

    # Stash artefacts for downstream phases (via generator send protocol is
    # awkward — instead we use a mutable container yielded as a special event).
    yield {
        "event": "_artefacts",
        "data": {
            "lineage": lineage_res,
            "bundle": bundle_res,
            "sol_flow": sol_res,
            "deployer": deployer_addr,
        },
    }


# ── Main orchestrator ───────────────────────────────────────────────────────

async def run_investigation(
    mint: str,
    *,
    tier: TierLimits,
    cache: Any,
    user_id: Optional[int] = None,
) -> AsyncGenerator[dict, None]:
    """Tier-adaptive investigation. Yields SSE event dicts.

    Events emitted (superset):
      phase           {phase, status}
      step            {step, status, ms?}
      heuristic_complete  {heuristic_score, tier}    (Free stop point)
      thinking        {turn, text}                    (Pro+ only)
      tool_call       {turn, tool, input, call_id}    (Pro+ only)
      tool_result     {turn, tool, call_id, ...}      (Pro+ only)
      text            {turn, text}                    (Pro+ only)
      verdict         {risk_score, confidence, ...}   (Pro / Pro+)
      done            {tier, turns_used, tokens_used, chat_available}
      error           {detail, recoverable?}
    """
    from .ai_analyst import _heuristic_score  # noqa: PLC0415

    tier_name = _tier_name(tier)

    # ── Phase 1: Scan pipeline (all tiers) ──────────────────────────────
    artefacts: dict = {}
    async for event in _run_scan_pipeline(mint):
        if event["event"] == "_artefacts":
            artefacts = event["data"]
        else:
            yield event

    lineage_res = artefacts.get("lineage")
    bundle_res = artefacts.get("bundle")
    sol_res = artefacts.get("sol_flow")

    # Compute heuristic pre-score
    hscore = _heuristic_score(lineage_res, bundle_res, sol_res)

    # ── Free tier: stop after heuristic ─────────────────────────────────
    if not tier.has_ai_verdict:
        yield _evt("heuristic_complete", {"heuristic_score": hscore, "tier": tier_name})
        yield _evt("done", {
            "tier": tier_name,
            "turns_used": 0,
            "tokens_used": 0,
            "chat_available": False,
        })
        return

    # ── Pro+ / Whale: agent investigation ───────────────────────────────
    if tier.has_agent:
        yield _evt("phase", {"phase": "agent", "status": "started"})

        from .agent_service import run_agent  # noqa: PLC0415

        verdict = None
        turns_used = 0
        tokens_used = 0

        try:
            async for agent_event in run_agent(mint, cache=cache):
                ev_type = agent_event["event"]
                ev_data = agent_event["data"]

                if ev_type == "done":
                    # Intercept done to extract verdict
                    verdict = ev_data.get("verdict")
                    turns_used = ev_data.get("turns_used", 0)
                    tokens_used = ev_data.get("tokens_used", 0)
                    if verdict:
                        yield _evt("verdict", verdict)
                else:
                    # Forward all other events (thinking, tool_call, tool_result, text, error)
                    yield _evt(ev_type, ev_data)
        except Exception as exc:
            logger.exception("[investigate] agent error for %s", mint[:12])
            yield _evt("error", {"detail": f"Agent error: {type(exc).__name__}", "recoverable": False})

        yield _evt("phase", {"phase": "agent", "status": "done"})
        yield _evt("done", {
            "tier": tier_name,
            "turns_used": turns_used,
            "tokens_used": tokens_used,
            "chat_available": tier.has_ai_chat,
        })
        return

    # ── Pro: single-shot AI verdict ─────────────────────────────────────
    yield _evt("phase", {"phase": "ai_verdict", "status": "started"})
    yield _evt("step", {"step": "ai", "status": "running", "heuristic": hscore})

    t2 = time.monotonic()
    try:
        from .ai_analyst import analyze_token as _analyze_token  # noqa: PLC0415

        ai_result = await asyncio.wait_for(
            _analyze_token(
                mint,
                lineage_result=lineage_res,
                bundle_report=bundle_res,
                sol_flow_report=sol_res,
                cache=cache,
            ),
            timeout=55.0,
        )
    except asyncio.TimeoutError:
        yield _evt("error", {"detail": "AI analysis timed out", "recoverable": True})
        yield _evt("phase", {"phase": "ai_verdict", "status": "done"})
        return
    except Exception as exc:
        logger.exception("[investigate] AI failed for %s", mint[:12])
        yield _evt("error", {"detail": f"AI analysis failed: {type(exc).__name__}", "recoverable": True})
        yield _evt("phase", {"phase": "ai_verdict", "status": "done"})
        return

    ai_ms = int((time.monotonic() - t2) * 1000)
    yield _evt("step", {"step": "ai", "status": "done", "ms": ai_ms})

    if ai_result is None:
        yield _evt("error", {"detail": "AI analysis unavailable — check ANTHROPIC_API_KEY", "recoverable": False})
        yield _evt("phase", {"phase": "ai_verdict", "status": "done"})
        return

    yield _evt("verdict", ai_result)
    yield _evt("phase", {"phase": "ai_verdict", "status": "done"})
    yield _evt("done", {
        "tier": tier_name,
        "turns_used": 0,
        "tokens_used": 0,
        "chat_available": tier.has_ai_chat,
    })


# ── Helpers ─────────────────────────────────────────────────────────────────

def _deployer_from_lineage(lineage_res: Any) -> str:
    """Extract deployer address from a LineageResult."""
    if lineage_res is None:
        return ""
    query_token = getattr(lineage_res, "query_token", None) or getattr(lineage_res, "root", None)
    return getattr(query_token, "deployer", "") or ""


async def _load_supporting_reports(
    mint: str,
    lineage_res: Any,
    *,
    force_refresh: bool = False,
) -> tuple:
    """Load bundle + SOL flow reports (parallel)."""
    from .bundle_tracker_service import analyze_bundle, get_cached_bundle_report  # noqa: PLC0415
    from .sol_flow_service import get_sol_flow_report  # noqa: PLC0415

    if not force_refresh:
        return await asyncio.gather(
            get_cached_bundle_report(mint),
            get_sol_flow_report(mint),
        )

    deployer = _deployer_from_lineage(lineage_res)
    if not deployer:
        return await asyncio.gather(
            get_cached_bundle_report(mint, force_refresh=True),
            get_sol_flow_report(mint, force_refresh=True),
        )

    bundle_res = await analyze_bundle(mint, deployer, force_refresh=True)
    sol_flow_res = await get_sol_flow_report(mint, force_refresh=True)
    return bundle_res, sol_flow_res


def _tier_name(tier: TierLimits) -> str:
    """Derive a human-readable tier name from limits."""
    from .subscription_tiers import TIER_LIMITS, PlanTier  # noqa: PLC0415
    for plan, limits in TIER_LIMITS.items():
        if limits is tier:
            return plan.value
    return "free"
