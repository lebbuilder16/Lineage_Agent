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
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from .data_sources._clients import (
    event_insert,
    event_query,
    event_update,
    get_dex_client,
)
from .constants import DEAD_LIQUIDITY_USD
from .models import EvidenceLevel, LifecycleStage, MarketSurface, RugMechanism

logger = logging.getLogger(__name__)

_SWEEP_INTERVAL_SECONDS = 15 * 60  # 15 minutes
_RUG_LIQ_THRESHOLD = DEAD_LIQUIDITY_USD  # USD — below this we consider it rugged
_MIN_RECORDED_LIQ = 200.0         # tokens that once had ≥$200 liq (was $500 — missed most pump.fun tokens)
_LOOKBACK_SECONDS = 7 * 24 * 3600 # scan tokens recorded in last 7 days (was 48h — missed slow-burn rugs)
_BATCH_CONCURRENCY = 3            # concurrent DexScreener lookups per sweep

# Soft-rug / liquidity drain thresholds (lowered to catch more pump.fun rugs)
_DRAIN_RUG_MIN_RECORDED_LIQ = 500.0    # apply drain logic to tokens that once had ≥$500 liq (was $1k)
_DRAIN_RUG_PCT_STRONG       = 0.75      # ≥75% drain → STRONG evidence (was 90%)
_DRAIN_RUG_PCT_MODERATE     = 0.50      # ≥50% drain → MODERATE evidence (was 75%)

# Dead token thresholds — tokens that faded on DEX without active extraction
_DEAD_TOKEN_LIQ_THRESHOLD   = 500.0     # current liq below this = dead
_DEAD_TOKEN_MIN_DRAIN_PCT   = 0.50      # must have lost ≥50% from recorded peak (was 60%)

_sweep_task: Optional[asyncio.Task] = None
_RUG_SEMANTICS_VERSION = "rug-semantics-v1"
_RUG_NORMALIZE_VERSION = "rug-normalize-v1"


def _norm_enumish(value: object) -> str:
    raw = getattr(value, "value", value)
    return str(raw or "").strip().lower()


def _field_value(obj: object, key: str) -> object:
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _evidence_rank(value: str) -> int:
    return {
        EvidenceLevel.NONE.value: 0,
        EvidenceLevel.WEAK.value: 1,
        EvidenceLevel.MODERATE.value: 2,
        EvidenceLevel.STRONG.value: 3,
    }.get(value, 0)


def _pre_dex_source_rank(reason_codes: list[str]) -> int:
    reasons = set(reason_codes)
    if "bundle_confirmed_team_extraction" in reasons:
        return 4
    if "bundle_suspected_team_extraction" in reasons:
        return 3
    if "bundle_coordinated_dump" in reasons:
        return 2
    if "sol_flow_only_extraction_detected" in reasons:
        return 1
    return 0


def _parse_reason_codes(raw: object) -> list[str]:
    if isinstance(raw, list):
        return [str(item) for item in raw if item]
    if not raw:
        return []
    try:
        parsed = json.loads(str(raw))
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed if item]


def _is_dex_context(row: dict) -> bool:
    stage = _norm_enumish(_field_value(row, "lifecycle_stage"))
    surface = _norm_enumish(_field_value(row, "market_surface"))
    return (
        stage == LifecycleStage.DEX_LISTED.value
        or surface == MarketSurface.DEX_POOL_OBSERVED.value
    )


def _build_legacy_rug_update(legacy_row: dict, created_row: dict) -> dict:
    created_reason_codes = _parse_reason_codes(created_row.get("reason_codes"))
    legacy_reason_codes = _parse_reason_codes(legacy_row.get("reason_codes"))
    launch_platform = created_row.get("launch_platform")
    lifecycle_stage = _norm_enumish(created_row.get("lifecycle_stage"))
    market_surface = _norm_enumish(created_row.get("market_surface"))
    existing_evidence = _norm_enumish(legacy_row.get("evidence_level"))
    pre_dex_context = _is_pre_dex_context(created_row) or bool(
        launch_platform and not _is_dex_context(created_row)
    )

    reason_codes = [*legacy_reason_codes, *created_reason_codes, "legacy_missing_rug_mechanism"]
    if _is_dex_context(created_row):
        reason_codes.append("legacy_rug_normalized_dex_context")
        rug_mechanism = RugMechanism.DEX_LIQUIDITY_RUG.value
        evidence_level = existing_evidence or EvidenceLevel.STRONG.value
    elif pre_dex_context:
        reason_codes.extend(["legacy_rug_pre_dex_context", "team_link_unproven"])
        rug_mechanism = RugMechanism.UNKNOWN.value
        evidence_level = existing_evidence or EvidenceLevel.WEAK.value
    else:
        reason_codes.append("legacy_rug_insufficient_context")
        rug_mechanism = RugMechanism.UNKNOWN.value
        evidence_level = existing_evidence or EvidenceLevel.WEAK.value

    return {
        "rug_mechanism": rug_mechanism,
        "evidence_level": evidence_level,
        "launch_platform": launch_platform,
        "lifecycle_stage": lifecycle_stage or LifecycleStage.UNKNOWN.value,
        "market_surface": market_surface or MarketSurface.NO_MARKET_OBSERVED.value,
        "reason_codes": json.dumps(list(dict.fromkeys(reason_codes))),
        "created_at": legacy_row.get("created_at") or created_row.get("created_at"),
        "analysis_version": _RUG_NORMALIZE_VERSION,
        "policy_version": _RUG_NORMALIZE_VERSION,
    }


async def normalize_legacy_rug_events(
    *,
    mints: Optional[list[str]] = None,
    deployer: Optional[str] = None,
    limit: int = 200,
) -> int:
    """Backfill missing rug_mechanism fields conservatively for legacy rows.

    Legacy rows are normalized from token_created context when available.
    DEX-confirmed contexts become `dex_liquidity_rug`; pre-DEX contexts remain
    `unknown` unless newer proof-specific paths have already typed them.
    """
    scope_where = ["event_type = 'token_rugged'", "(rug_mechanism IS NULL OR rug_mechanism = '')"]
    params: list[str] = []
    if mints:
        placeholders = ",".join("?" for _ in mints)
        scope_where.append(f"mint IN ({placeholders})")
        params.extend(mints)
    elif deployer:
        scope_where.append("deployer = ?")
        params.append(deployer)

    legacy_rows = await event_query(
        where=" AND ".join(scope_where),
        params=tuple(params),
        columns="mint, deployer, created_at, rugged_at, evidence_level, reason_codes",
        limit=limit,
    )
    if not legacy_rows:
        return 0

    legacy_mints = [row.get("mint", "") for row in legacy_rows if row.get("mint")]
    if not legacy_mints:
        return 0
    placeholders = ",".join("?" for _ in legacy_mints)
    created_rows = await event_query(
        where=f"event_type = 'token_created' AND mint IN ({placeholders})",
        params=tuple(legacy_mints),
        columns="mint, created_at, launch_platform, lifecycle_stage, market_surface, reason_codes, evidence_level",
        limit=max(limit, len(legacy_mints)),
    )
    created_map = {row.get("mint"): row for row in created_rows if row.get("mint")}

    normalized = 0
    for legacy_row in legacy_rows:
        mint = legacy_row.get("mint")
        if not mint:
            continue
        update_payload = _build_legacy_rug_update(legacy_row, created_map.get(mint, {}))
        await event_update(
            where="event_type = 'token_rugged' AND mint = ?",
            params=(mint,),
            **update_payload,
        )
        normalized += 1
    return normalized


def _classify_pre_dex_extraction(
    token_meta: object,
    bundle_report: Optional[object],
    sol_flow_report: Optional[object],
) -> tuple[str, list[str]] | None:
    bundle_verdict = str(getattr(bundle_report, "overall_verdict", "") or "").strip().lower()
    total_extracted_sol = float(getattr(sol_flow_report, "total_extracted_sol", 0.0) or 0.0)
    reason_codes = list(getattr(token_meta, "reason_codes", []) or [])

    if bundle_verdict == "confirmed_team_extraction":
        reason_codes.append("bundle_confirmed_team_extraction")
        if total_extracted_sol > 0:
            reason_codes.append("sol_flow_extraction_detected")
        return EvidenceLevel.STRONG.value, list(dict.fromkeys(reason_codes))

    if bundle_verdict == "suspected_team_extraction":
        reason_codes.append("bundle_suspected_team_extraction")
        if total_extracted_sol > 0:
            reason_codes.append("sol_flow_extraction_detected")
        return EvidenceLevel.MODERATE.value, list(dict.fromkeys(reason_codes))

    if bundle_verdict == "coordinated_dump_unknown_team" and total_extracted_sol > 0:
        reason_codes.extend([
            "bundle_coordinated_dump",
            "sol_flow_extraction_detected",
            "team_link_unproven",
        ])
        return EvidenceLevel.MODERATE.value, list(dict.fromkeys(reason_codes))

    # SOL flow alone is NOT sufficient evidence for rug classification.
    # Protocol fees (bonding curve rewards, pool creation costs) produce
    # legitimate SOL outflows that must not be misclassified as extraction.
    # Only classify as rug if extraction_context confirms it's suspicious.
    if total_extracted_sol > 0:
        extraction_ctx = str(getattr(sol_flow_report, "extraction_context", "") or "")
        # Only confirmed_extraction (CEX detected) is strong enough for rug
        # classification.  suspicious_outflow alone is too noisy — normal
        # deployer wallet activity (funding, transfers) triggers it.
        if extraction_ctx == "confirmed_extraction":
            reason_codes.extend([
                "sol_flow_only_extraction_detected",
                "team_link_unproven",
            ])
            return EvidenceLevel.WEAK.value, list(dict.fromkeys(reason_codes))
        return None

    return None


def _is_pre_dex_context(token_meta: object) -> bool:
    stage = _norm_enumish(_field_value(token_meta, "lifecycle_stage"))
    surface = _norm_enumish(_field_value(token_meta, "market_surface"))
    return (
        stage in {
            LifecycleStage.LAUNCHPAD_CURVE_ONLY.value,
            LifecycleStage.MIGRATION_PENDING.value,
        }
        or surface == MarketSurface.LAUNCHPAD_CURVE_ONLY.value
    )


async def persist_pre_dex_extraction_rug(
    mint: str,
    deployer: str,
    token_meta: object,
    bundle_report: Optional[object],
    sol_flow_report: Optional[object],
) -> bool:
    """Persist or upgrade a pre-DEX extraction rug when proof exists.

    Evidence can come from a strong bundle verdict, a coordinated launchpad dump
    with extracted SOL, or direct post-sell SOL extraction observed before DEX.
    """
    if not mint or not deployer or token_meta is None or not _is_pre_dex_context(token_meta):
        return False

    classified = _classify_pre_dex_extraction(token_meta, bundle_report, sol_flow_report)
    if classified is None:
        return False
    evidence_level, reason_codes = classified
    new_source_rank = _pre_dex_source_rank(reason_codes)

    existing = await event_query(
        where="event_type = 'token_rugged' AND mint = ?",
        params=(mint,),
        columns="mint, rugged_at, rug_mechanism, evidence_level, reason_codes",
        limit=1,
    )
    if existing:
        current = existing[0]
        current_mechanism = str(current.get("rug_mechanism") or "").strip().lower()
        current_evidence = str(current.get("evidence_level") or "").strip().lower()
        current_reason_codes = _parse_reason_codes(current.get("reason_codes"))
        current_source_rank = _pre_dex_source_rank(current_reason_codes)
        if current_mechanism == RugMechanism.DEX_LIQUIDITY_RUG.value:
            return False
        if (
            current_mechanism == RugMechanism.PRE_DEX_EXTRACTION_RUG.value
            and (
                _evidence_rank(current_evidence) > _evidence_rank(evidence_level)
                or (
                    _evidence_rank(current_evidence) == _evidence_rank(evidence_level)
                    and current_source_rank >= new_source_rank
                )
            )
        ):
            return False

        merged_reason_codes = list(dict.fromkeys([*current_reason_codes, *reason_codes]))

        await event_update(
            where="event_type = 'token_rugged' AND mint = ?",
            params=(mint,),
            deployer=deployer,
            rug_mechanism=RugMechanism.PRE_DEX_EXTRACTION_RUG.value,
            evidence_level=evidence_level,
            rugged_at=current.get("rugged_at") or datetime.now(tz=timezone.utc).isoformat(),
            created_at=(
                getattr(getattr(token_meta, "created_at", None), "isoformat", lambda: getattr(token_meta, "created_at", None))()
                if getattr(token_meta, "created_at", None) is not None else None
            ),
            launch_platform=getattr(token_meta, "launch_platform", None),
            lifecycle_stage=_norm_enumish(getattr(token_meta, "lifecycle_stage", "")) or LifecycleStage.LAUNCHPAD_CURVE_ONLY.value,
            market_surface=_norm_enumish(getattr(token_meta, "market_surface", "")) or MarketSurface.LAUNCHPAD_CURVE_ONLY.value,
            reason_codes=json.dumps(merged_reason_codes),
            analysis_version=_RUG_SEMANTICS_VERSION,
            policy_version=_RUG_SEMANTICS_VERSION,
        )
        return True

    created_at = getattr(token_meta, "created_at", None)
    await event_insert(
        event_type="token_rugged",
        mint=mint,
        deployer=deployer,
        rugged_at=datetime.now(tz=timezone.utc).isoformat(),
        created_at=created_at.isoformat() if created_at else None,
        rug_mechanism=RugMechanism.PRE_DEX_EXTRACTION_RUG.value,
        evidence_level=evidence_level,
        launch_platform=getattr(token_meta, "launch_platform", None),
        lifecycle_stage=_norm_enumish(getattr(token_meta, "lifecycle_stage", "")) or LifecycleStage.LAUNCHPAD_CURVE_ONLY.value,
        market_surface=_norm_enumish(getattr(token_meta, "market_surface", "")) or MarketSurface.LAUNCHPAD_CURVE_ONLY.value,
        reason_codes=json.dumps(list(dict.fromkeys(reason_codes))),
        analysis_version=_RUG_SEMANTICS_VERSION,
        policy_version=_RUG_SEMANTICS_VERSION,
    )
    return True


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
        columns="mint, deployer, liq_usd, created_at, launch_platform, lifecycle_stage, market_surface",
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
                pairs = await dex.get_token_pairs_with_fallback(mint)
            except Exception:
                return

        row_stage = (row.get("lifecycle_stage") or "").lower()
        row_surface = (row.get("market_surface") or "").lower()
        saw_solana_pair = any((p.get("chainId") or "").lower() == "solana" for p in pairs)
        dex_context_confirmed = (
            row_stage == LifecycleStage.DEX_LISTED.value
            or row_surface == MarketSurface.DEX_POOL_OBSERVED.value
            or saw_solana_pair
        )
        if not dex_context_confirmed:
            return

        # Current liquidity across all pairs
        current_liq = 0.0
        for p in pairs:
            current_liq += float((p.get("liquidity") or {}).get("usd") or 0)

        recorded_liq = float(row.get("liq_usd") or 0)

        # Keep recorded_liq tracking the peak: if the token's liquidity has
        # grown since the initial scan, update the stored value so that future
        # drain calculations use the true high-water mark.
        if current_liq > recorded_liq:
            try:
                await event_update(
                    where="mint = ? AND event_type = 'token_created'",
                    params=(mint,),
                    liq_usd=current_liq,
                )
            except Exception:
                pass  # non-critical — worst case we under-estimate drain this cycle
            recorded_liq = current_liq

        # ── Classify the outcome ─────────────────────────────────────────
        drain_pct = (
            (recorded_liq - current_liq) / recorded_liq
            if recorded_liq > 0 else 0.0
        )

        if current_liq < _RUG_LIQ_THRESHOLD:
            # Hard rug: absolute floor hit
            rug_mechanism = RugMechanism.DEX_LIQUIDITY_RUG.value
            evidence_level = EvidenceLevel.STRONG.value
            reason_codes = ["dex_context_confirmed", "liquidity_below_dead_threshold"]

        elif (
            recorded_liq >= _DRAIN_RUG_MIN_RECORDED_LIQ
            and drain_pct >= _DRAIN_RUG_PCT_MODERATE
        ):
            # Soft rug: ≥75% relative liquidity drain from ≥$1k peak
            rug_mechanism = RugMechanism.LIQUIDITY_DRAIN_RUG.value
            evidence_level = (
                EvidenceLevel.STRONG.value
                if drain_pct >= _DRAIN_RUG_PCT_STRONG
                else EvidenceLevel.MODERATE.value
            )
            reason_codes = [
                "dex_context_confirmed",
                f"liquidity_drained_{int(drain_pct * 100)}pct",
            ]

        elif (
            current_liq < _DEAD_TOKEN_LIQ_THRESHOLD
            and drain_pct >= _DEAD_TOKEN_MIN_DRAIN_PCT
        ):
            # Dead token: faded below $500 with ≥60% drain, no active extraction proven
            rug_mechanism = RugMechanism.DEAD_TOKEN.value
            evidence_level = EvidenceLevel.MODERATE.value
            reason_codes = [
                "dex_context_confirmed",
                "token_dead_natural_fade",
                f"liquidity_faded_{int(drain_pct * 100)}pct",
            ]

        else:
            return  # still alive

        # ── Persist rug event ─────────────────────────────────────────────
        now_iso = datetime.now(tz=timezone.utc).isoformat()
        try:
            await event_insert(
                event_type="token_rugged",
                mint=mint,
                deployer=row.get("deployer", ""),
                liq_usd=current_liq,
                rug_mechanism=rug_mechanism,
                rugged_at=now_iso,
                created_at=row.get("created_at"),
                launch_platform=row.get("launch_platform"),
                lifecycle_stage=row.get("lifecycle_stage") or LifecycleStage.DEX_LISTED.value,
                market_surface=MarketSurface.DEX_POOL_OBSERVED.value,
                evidence_level=evidence_level,
                reason_codes=json.dumps(reason_codes),
                analysis_version=_RUG_SEMANTICS_VERSION,
                policy_version=_RUG_SEMANTICS_VERSION,
            )
            rugs_found += 1
            _label = "Dead token" if rug_mechanism == RugMechanism.DEAD_TOKEN.value else "Rug detected"
            logger.info(
                "%s [%s]: %s (was $%.0f → now $%.0f)",
                _label, rug_mechanism, mint, recorded_liq, current_liq,
            )
            # Fire-and-forget: trace where the SOL went (Initiative 2)
            # Skip SOL tracing for dead tokens — no active extraction to trace.
            _deployer = row.get("deployer", "")
            if _deployer and rug_mechanism != RugMechanism.DEAD_TOKEN.value:
                try:
                    from .sol_flow_service import trace_sol_flow
                    from .data_sources._clients import bundle_report_query as _brq

                    # PumpFun/Jito fix: seed the SOL trace with confirmed bundle
                    # wallets in addition to the deployer.  The bundle wallets
                    # are the actual extractors on modern protocol launches.
                    _bundle_seeds: list[str] = []
                    try:
                        import json as _json
                        _cached = await _brq(mint)
                        if _cached:
                            _bd = _json.loads(_cached)
                            if _bd.get("overall_verdict") in (
                                "confirmed_team_extraction",
                                "suspected_team_extraction",
                            ):
                                _bundle_seeds = (
                                    [w for w in _bd.get("confirmed_team_wallets", []) if w != _deployer]
                                    + [w for w in _bd.get("suspected_team_wallets", []) if w != _deployer]
                                )[:12]
                    except Exception:
                        pass

                    asyncio.create_task(
                        trace_sol_flow(
                            mint, _deployer,
                            extra_seed_wallets=_bundle_seeds,
                        ),
                        name=f"sol_trace_{mint[:8]}",
                    )
                except Exception as _te:
                    logger.debug("trace_sol_flow task launch failed: %s", _te)

            # ── Push notification to watchers ────────────────────────────
            try:
                from .alert_service import _push_fcm_to_watchers
                _name = row.get("name") or mint[:12]
                _symbol = row.get("symbol") or ""
                _token_label = f"{_name} ({_symbol})" if _symbol else _name
                if rug_mechanism == RugMechanism.DEAD_TOKEN.value:
                    _title = f"{_token_label} — Token Dead"
                    _body = f"Liquidity dropped to ${current_liq:,.0f}. Token appears abandoned."
                    _urgency = "low"
                else:
                    _title = f"{_token_label} — Rug Detected"
                    _body = f"Liquidity drained from ${recorded_liq:,.0f} to ${current_liq:,.0f}."
                    _urgency = "high"
                asyncio.create_task(
                    _push_fcm_to_watchers(
                        mint=mint,
                        title=_title,
                        body=_body,
                        alert_type="rug_detected",
                    ),
                    name=f"rug_push_{mint[:8]}",
                )
            except Exception as _push_exc:
                logger.debug("rug push notification failed: %s", _push_exc)
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
            _sweep_stats["runs"] += 1
            _sweep_stats["last_run_at"] = time.time()
            if count:
                _sweep_stats["total_rugs_found"] += count
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


# ── Sweep stats for /admin/sweep-status ──────────────────────────────────
_sweep_stats: dict = {"runs": 0, "total_rugs_found": 0, "last_run_at": None}


def get_sweep_stats() -> dict:
    """Return current sweep loop statistics."""
    return {
        **_sweep_stats,
        "task_running": _sweep_task is not None and not _sweep_task.done(),
        "interval_seconds": _SWEEP_INTERVAL_SECONDS,
    }
