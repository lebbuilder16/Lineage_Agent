"""Unified investigation service — tier-adaptive forensic analysis.

Orchestrates three levels of investigation depth via a single async
generator that yields SSE event dicts:

- **Free**: Forensic pipeline scan → heuristic score, no AI.
- **Pro**: Forensic pipeline + single-shot AI verdict (Haiku).
- **Pro+/Whale**: Forensic pipeline + autonomous agent investigation (Sonnet multi-turn).

The generator adapts its behavior based on the caller's ``TierLimits``
so that one endpoint can serve all subscription tiers.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, AsyncGenerator, Awaitable, Callable, Optional

from .subscription_tiers import TierLimits

logger = logging.getLogger(__name__)


# ── SSE event helper ────────────────────────────────────────────────────────

def _evt(event: str, data: dict) -> dict:
    """Build an SSE event dict ready for EventSourceResponse."""
    return {"event": event, "data": json.dumps(data, default=str)}


# ── Main orchestrator ───────────────────────────────────────────────────────

async def run_investigation(
    mint: str,
    *,
    tier: TierLimits,
    cache: Any,
    user_id: Optional[int] = None,
    is_disconnected: Optional[Callable[[], Awaitable[bool]]] = None,
    session_id: Optional[str] = None,
) -> AsyncGenerator[dict, None]:
    """Tier-adaptive investigation. Yields SSE event dicts.

    Events emitted (superset):
      phase           {phase, status}
      step            {step, status, ms?}
      identity_ready  {name, symbol, deployer, ms}     (NEW: early feedback)
      heuristic_complete  {heuristic_score, tier}       (Free stop point)
      thinking        {turn, text}                       (Pro+ only)
      tool_call       {turn, tool, input, call_id}       (Pro+ only)
      tool_result     {turn, tool, call_id, ...}         (Pro+ only)
      text            {turn, text}                       (Pro+ only)
      verdict         {risk_score, confidence, ...}      (Pro / Pro+)
      done            {tier, turns_used, tokens_used, chat_available}
      error           {detail, recoverable?}
    """
    from .ai_analyst import _heuristic_score  # noqa: PLC0415
    from .forensic_pipeline import (
        run_forensic_pipeline,
        report_to_lineage_result,
        ForensicReport,
    )
    from .agent_service import _summarize_scan_for_agent  # noqa: PLC0415

    tier_name = _tier_name(tier)

    # Sequential event IDs for SSE — backwards-compatible (sse-starlette uses "id" key)
    _seq = 0

    def _evtN(event: str, data: dict) -> dict:
        nonlocal _seq
        _seq += 1
        return {"event": event, "data": json.dumps(data, default=str), "id": str(_seq)}

    # ── Phase 1: Forensic Pipeline (all tiers) ──────────────────────
    report: Optional[ForensicReport] = None
    async for event in run_forensic_pipeline(mint):
        if event["event"] == "_report":
            report = event["data"]
        else:
            _seq += 1
            event["id"] = str(_seq)
            yield event

    if report is None:
        yield _evtN("error", {"detail": "Forensic pipeline produced no report", "recoverable": False})
        return

    lineage_res = report_to_lineage_result(report)
    bundle_res = report.bundle_report
    sol_res = report.sol_flow

    # Enrich behavioral signals with narrative cluster membership
    _behavioral: dict = {}
    try:
        from .memory_service import get_narrative_clusters_for_deployer  # noqa: PLC0415
        _qt = getattr(lineage_res, "query_token", None)
        _dep = getattr(_qt, "deployer", None) if _qt else None
        if _dep:
            _clusters = await get_narrative_clusters_for_deployer(_dep)
            if _clusters:
                _behavioral["narrative_cluster_avg_risk"] = max(c["avg_risk"] for c in _clusters)
    except Exception:
        pass

    # Compute heuristic pre-score
    hscore = _heuristic_score(lineage_res, bundle_res, sol_res, behavioral_signals=_behavioral or None)

    # ── Free tier: stop after heuristic (with calibration) ──────────
    if not tier.has_ai_verdict:
        calibrated_hscore = hscore
        try:
            from .memory_service import get_calibration_offset  # noqa: PLC0415
            from .ai_analyst import _build_calibration_context  # noqa: PLC0415
            _hv = _build_heuristic_verdict(hscore, mint)
            _cal_ctx = _build_calibration_context(_hv, lineage_res)
            _cal_off = await get_calibration_offset(_cal_ctx)
            if _cal_off != 0:
                calibrated_hscore = max(0, min(100, int(hscore + _cal_off)))
                logger.info("[investigate] heuristic calibration: %+.0f (%d → %d) for %s",
                            _cal_off, hscore, calibrated_hscore, mint[:12])
        except Exception:
            pass
        yield _evtN("heuristic_complete", {"heuristic_score": calibrated_hscore, "tier": tier_name})
        yield _evtN("done", {
            "tier": tier_name,
            "turns_used": 0,
            "tokens_used": 0,
            "chat_available": False,
        })
        return

    # ── Pro+ / Whale: agent investigation ───────────────────────────

    # Token-saving: skip AI for clean re-scans (<6h, heuristic < 25)
    if tier.has_agent and hscore < 25:
        try:
            from .memory_service import build_memory_brief as _bmb  # noqa: PLC0415
            from .data_sources._clients import cache as _mc  # noqa: PLC0415
            from .cache import SQLiteCache as _SC  # noqa: PLC0415
            if isinstance(_mc, _SC):
                _db = await _mc._get_conn()
                _cur = await _db.execute(
                    "SELECT risk_score, verdict_summary, created_at FROM investigation_episodes "
                    "WHERE mint = ? ORDER BY created_at DESC LIMIT 1", (mint,),
                )
                _prev = await _cur.fetchone()
                if _prev and (time.time() - _prev[2]) < 21600 and _prev[0] < 25:
                    logger.info("[investigate] clean re-scan skip: %s (prev=%d, %dh ago)",
                                mint[:12], _prev[0], int((time.time() - _prev[2]) / 3600))
                    cached_verdict = _build_heuristic_verdict(hscore, mint)
                    cached_verdict["verdict_summary"] = (
                        f"Low-risk re-scan (previous: {_prev[0]}/100, {int((time.time() - _prev[2]) / 3600)}h ago). "
                        f"{cached_verdict['verdict_summary']}"
                    )
                    yield _evtN("verdict", cached_verdict)
                    yield _evtN("done", {
                        "tier": _tier_name(tier), "turns_used": 0,
                        "tokens_used": 0, "chat_available": tier.has_ai_chat,
                    })
                    return
        except Exception:
            pass  # fallthrough to normal investigation

    if tier.has_agent:
        yield _evtN("phase", {"phase": "agent", "status": "started"})

        from .agent_service import run_agent  # noqa: PLC0415

        # Build pre-scan summary from pipeline artefacts
        pre_scan = None
        if lineage_res:
            pre_scan = _summarize_scan_for_agent(lineage_res)
            pre_scan["heuristic_score"] = hscore

        verdict = None
        turns_used = 0
        tokens_used = 0

        try:
            async for agent_event in run_agent(mint, cache=cache, pre_scan=pre_scan, is_disconnected=is_disconnected, session_id=session_id):
                ev_type = agent_event["event"]
                ev_data = agent_event["data"]

                if ev_type == "done":
                    verdict = ev_data.get("verdict")
                    turns_used = ev_data.get("turns_used", 0)
                    tokens_used = ev_data.get("tokens_used", 0)
                    if verdict:
                        yield _evtN("verdict", verdict)
                else:
                    yield _evtN(ev_type, ev_data)
        except Exception as exc:
            logger.exception("[investigate] agent error for %s", mint[:12])
            detail = str(exc)
            is_overloaded = "overloaded" in detail.lower() or "529" in detail
            is_credit = "credit balance is too low" in detail

            if is_overloaded or is_credit:
                # Fallback: deliver heuristic-based verdict instead of failing
                logger.info("[investigate] overload/credit fallback → heuristic verdict for %s", mint[:12])
                fallback_verdict = _build_heuristic_verdict(hscore, mint)
                yield _evtN("verdict", fallback_verdict)
                verdict = fallback_verdict
            else:
                yield _evtN("error", {"detail": f"Agent error: {type(exc).__name__}", "recoverable": True})

        # Safety net: if agent completed but produced no verdict, deliver heuristic
        if not verdict:
            logger.warning("[investigate] agent produced no verdict for %s — heuristic fallback", mint[:12])
            verdict = _build_heuristic_verdict(hscore, mint)
            yield _evtN("verdict", verdict)

        yield _evtN("phase", {"phase": "agent", "status": "done"})

        # Record episode in memory system (fire-and-forget)
        if verdict:
            asyncio.create_task(_record_memory_episode(mint, verdict, lineage_res))

        yield _evtN("done", {
            "tier": tier_name,
            "turns_used": turns_used,
            "tokens_used": tokens_used,
            "chat_available": tier.has_ai_chat,
        })
        return

    # ── Pro: single-shot AI verdict ─────────────────────────────────
    yield _evtN("phase", {"phase": "ai_verdict", "status": "started"})
    yield _evtN("step", {"step": "ai", "status": "running", "heuristic": hscore})

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
        yield _evtN("error", {"detail": "AI analysis timed out", "recoverable": True})
        yield _evtN("phase", {"phase": "ai_verdict", "status": "done"})
        return
    except Exception as exc:
        logger.exception("[investigate] AI failed for %s", mint[:12])
        yield _evtN("error", {"detail": f"AI analysis failed: {type(exc).__name__}", "recoverable": True})
        yield _evtN("phase", {"phase": "ai_verdict", "status": "done"})
        return

    ai_ms = int((time.monotonic() - t2) * 1000)
    yield _evtN("step", {"step": "ai", "status": "done", "ms": ai_ms})

    if ai_result is None:
        yield _evtN("error", {"detail": "AI analysis unavailable — check ANTHROPIC_API_KEY", "recoverable": False})
        yield _evtN("phase", {"phase": "ai_verdict", "status": "done"})
        return

    yield _evtN("verdict", ai_result)
    yield _evtN("phase", {"phase": "ai_verdict", "status": "done"})

    # Record episode in memory system (fire-and-forget)
    asyncio.create_task(_record_memory_episode(mint, ai_result, lineage_res))

    yield _evtN("done", {
        "tier": tier_name,
        "turns_used": 0,
        "tokens_used": 0,
        "chat_available": tier.has_ai_chat,
    })


# ── Helpers ─────────────────────────────────────────────────────────────────


async def _record_memory_episode(mint: str, verdict: dict, lineage_res: Any) -> None:
    """Fire-and-forget: persist verdict + signals as a memory episode."""
    try:
        from .memory_service import record_episode
        scan_data = lineage_res.model_dump(mode="json") if hasattr(lineage_res, "model_dump") else {}
        deployer = getattr(lineage_res, "query_token", None)
        deployer_addr = getattr(deployer, "deployer", None) if deployer else None
        operator_fp = None
        community_id = None
        if hasattr(lineage_res, "operator_fingerprint") and lineage_res.operator_fingerprint:
            op = lineage_res.operator_fingerprint
            operator_fp = getattr(op, "fingerprint", None) if hasattr(op, "fingerprint") else None
        if hasattr(lineage_res, "cartel_report") and lineage_res.cartel_report:
            cr = lineage_res.cartel_report
            dc = getattr(cr, "deployer_community", None) if hasattr(cr, "deployer_community") else None
            community_id = getattr(dc, "community_id", None) if dc else None

        await record_episode(
            mint=mint,
            verdict=verdict,
            scan_data=scan_data,
            deployer=deployer_addr,
            operator_fp=operator_fp,
            community_id=community_id,
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).debug("[memory] record failed: %s", exc)


def _build_heuristic_verdict(hscore: int, mint: str) -> dict:
    """Build a rule-based verdict from the heuristic score when AI is unavailable."""
    if hscore >= 75:
        level, pattern = "critical", "high_risk_signals"
    elif hscore >= 50:
        level, pattern = "high", "moderate_risk_signals"
    elif hscore >= 25:
        level, pattern = "medium", "low_risk_signals"
    else:
        level, pattern = "low", "minimal_risk"

    return {
        "mint": mint,
        "risk_score": hscore,
        "confidence": "low",
        "rug_pattern": pattern,
        "verdict_summary": f"Rule-based analysis (AI temporarily unavailable). Heuristic score: {hscore}/100.",
        "narrative": {
            "observation": "Score derived from bundle verdict, SOL flow, and lineage signals.",
            "pattern": None,
            "risk": "AI narrative unavailable — treat this score as a preliminary indicator only.",
        },
        "key_findings": [
            f"[HEURISTIC] Risk score {hscore}/100 — {level} risk level.",
            "[FALLBACK] AI analysis was unavailable. Retry for a full investigation.",
        ],
        "conviction_chain": None,
        "operator_hypothesis": None,
        "model": "heuristic_fallback",
    }


def _tier_name(tier: TierLimits) -> str:
    """Derive a human-readable tier name from limits."""
    from .subscription_tiers import TIER_LIMITS, PlanTier  # noqa: PLC0415
    for plan, limits in TIER_LIMITS.items():
        if limits is tier:
            return plan.value
    return "free"
