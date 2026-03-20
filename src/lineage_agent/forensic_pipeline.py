"""Forensic pipeline DAG -- parallel execution of forensic phases.

Replaces the sequential pipeline inside detect_lineage() with a DAG
that forks after token identity resolution:

    Identity (2s) ---+--- Family Search (15s)
                     +--- Deployer Forensics (10s)
                     +--- Chain Traces (8s)
                              |
                     +--------+
                     +--- Operator DNA (5s)
                     +--- Insider Sell (5s)

Wall-time: ~22s instead of ~52s sequential.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Optional

from .token_identity import TokenIdentity, resolve_token_identity

logger = logging.getLogger(__name__)

# SSE keepalive interval (seconds) — prevents Fly proxy idle timeout
_KEEPALIVE_INTERVAL = 5.0
_PIPELINE_TIMEOUT = 120.0


@dataclass
class ForensicReport:
    """Complete forensic report -- output of the pipeline."""
    identity: TokenIdentity
    family_tree: Any = None  # LineageResult-compatible
    deployer_profile: Any = None
    death_clock: Any = None
    factory_rhythm: Any = None
    operator_fingerprint: Any = None
    cartel_report: Any = None
    sol_flow: Any = None
    bundle_report: Any = None
    insider_sell: Any = None
    operator_impact: Any = None
    liquidity_arch: Any = None
    zombie_alert: Any = None
    timings: dict = field(default_factory=dict)


async def run_forensic_pipeline(
    mint: str,
    *,
    force_refresh: bool = False,
    on_event: Optional[Any] = None,
) -> AsyncGenerator[dict, None]:
    """Run the full forensic pipeline as a DAG, yielding SSE events.

    This replaces the sequential pipeline with parallel execution.
    Events yielded:
        identity_ready: Token identity resolved (name, symbol, deployer)
        step: Individual step progress (deployer, cartel, etc.)
        family_ready: Family tree computed
        forensics_ready: All forensic data collected
    """
    import json

    def _evt(event: str, data: dict) -> dict:
        return {"event": event, "data": json.dumps(data, default=str)}

    yield _evt("phase", {"phase": "scan", "status": "started"})

    # -- Phase 1: Token Identity (2-3s) -----------------------------------
    yield _evt("step", {"step": "identity", "status": "running"})
    t0 = time.monotonic()
    identity = await resolve_token_identity(mint, force_refresh=force_refresh)
    id_ms = int((time.monotonic() - t0) * 1000)
    yield _evt("step", {"step": "identity", "status": "done", "ms": id_ms})

    yield _evt("identity_ready", {
        "name": identity.name,
        "symbol": identity.symbol,
        "deployer": identity.deployer[:12] if identity.deployer else "",
        "created_at": str(identity.created_at) if identity.created_at else None,
        "ms": id_ms,
    })

    deployer = identity.deployer
    report = ForensicReport(identity=identity)
    report.timings["identity"] = id_ms

    if not identity.name and not identity.symbol:
        # Unknown token -- can't search for family
        yield _evt("phase", {"phase": "scan", "status": "done"})
        yield {"event": "_report", "data": report}
        return

    # -- Phase 2: FORK -- 3 branches in parallel -------------------------
    # Branch A: Family Search + Score (needs identity)
    # Branch B: Deployer-based forensics (needs deployer only)
    # Branch C: On-chain traces (needs mint + deployer)

    async def _branch_a_family() -> Any:
        """Search for similar tokens + score + select root (NO forensic enrichment)."""
        from .lineage_detector import detect_lineage

        # Run lineage detection with skip_forensic_enrichment=True so it only
        # does identity + candidate search + scoring (~15s), NOT the full 50s
        # monolith. Forensic enrichments are handled by branches B and C.
        return await detect_lineage(
            mint, force_refresh=force_refresh,
            skip_forensic_enrichment=True,
        )

    async def _branch_b_deployer_forensics() -> dict:
        """Deployer profile + death clock + factory rhythm + operator fingerprint."""
        results: dict[str, Any] = {}
        if not deployer:
            return results

        from .deployer_service import compute_deployer_profile
        from .death_clock import compute_death_clock
        from .factory_service import analyze_factory_rhythm
        from .metadata_dna_service import build_operator_fingerprint
        from .models import TokenMetadata

        async def _deployer_profile() -> None:
            try:
                results["deployer_profile"] = await asyncio.wait_for(
                    compute_deployer_profile(deployer), timeout=7.0
                )
            except Exception as e:
                logger.warning("[pipeline] deployer_profile failed: %s", e)

        async def _death_clock() -> None:
            try:
                # Build a TokenMetadata for the death clock
                meta = TokenMetadata(
                    mint=identity.mint,
                    name=identity.name,
                    symbol=identity.symbol,
                    deployer=deployer,
                    created_at=identity.created_at,
                )
                results["death_clock"] = await asyncio.wait_for(
                    compute_death_clock(deployer, identity.created_at, token_metadata=meta),
                    timeout=7.0,
                )
            except Exception as e:
                logger.warning("[pipeline] death_clock failed: %s", e)

        async def _factory() -> None:
            try:
                results["factory_rhythm"] = await asyncio.wait_for(
                    analyze_factory_rhythm(deployer), timeout=7.0
                )
            except Exception as e:
                logger.warning("[pipeline] factory failed: %s", e)

        async def _fingerprint() -> None:
            try:
                # Build fingerprint from deployer's token history
                from .data_sources._clients import get_rpc_client
                rpc = get_rpc_client()
                assets = await rpc.search_assets_by_creator(deployer, limit=50)
                uri_tuples = [
                    (
                        a.get("id", ""),
                        deployer,
                        (a.get("content") or {}).get("json_uri") or "",
                    )
                    for a in assets
                ]
                if uri_tuples:
                    results["operator_fingerprint"] = await asyncio.wait_for(
                        build_operator_fingerprint(uri_tuples), timeout=7.0
                    )
            except Exception as e:
                logger.warning("[pipeline] fingerprint failed: %s", e)

        # Run all 4 in parallel
        await asyncio.gather(
            _deployer_profile(), _death_clock(), _factory(), _fingerprint(),
            return_exceptions=True,
        )
        return results

    async def _branch_c_chain_traces() -> dict:
        """SOL flow trace + cartel edges + bundle analysis."""
        results: dict[str, Any] = {}

        from .sol_flow_service import get_sol_flow_report
        from .bundle_tracker_service import get_cached_bundle_report

        async def _sol_flow() -> None:
            try:
                results["sol_flow"] = await asyncio.wait_for(
                    get_sol_flow_report(mint, force_refresh=force_refresh),
                    timeout=15.0,
                )
            except Exception as e:
                logger.warning("[pipeline] sol_flow failed: %s", e)

        async def _bundle() -> None:
            try:
                results["bundle_report"] = await asyncio.wait_for(
                    get_cached_bundle_report(mint, force_refresh=force_refresh),
                    timeout=15.0,
                )
            except Exception as e:
                logger.warning("[pipeline] bundle failed: %s", e)

        async def _cartel() -> None:
            if not deployer:
                return
            try:
                from .cartel_service import compute_cartel_report
                results["cartel_report"] = await asyncio.wait_for(
                    compute_cartel_report(mint, deployer), timeout=15.0
                )
            except Exception as e:
                logger.warning("[pipeline] cartel failed: %s", e)

        await asyncio.gather(
            _sol_flow(), _bundle(), _cartel(),
            return_exceptions=True,
        )
        return results

    # Execute all 3 branches in parallel with SSE keepalive pings
    t_fork = time.monotonic()

    yield _evt("step", {"step": "family_search", "status": "running"})
    yield _evt("step", {"step": "deployer_forensics", "status": "running"})
    yield _evt("step", {"step": "chain_traces", "status": "running"})

    # Launch branches as tasks and poll with SSE keepalive pings every 5s
    # to prevent Fly proxy from killing the idle connection.
    task_a = asyncio.ensure_future(_branch_a_family())
    task_b = asyncio.ensure_future(_branch_b_deployer_forensics())
    task_c = asyncio.ensure_future(_branch_c_chain_traces())
    all_tasks = [task_a, task_b, task_c]

    deadline = time.monotonic() + _PIPELINE_TIMEOUT
    while not all(t.done() for t in all_tasks):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            for t in all_tasks:
                if not t.done():
                    t.cancel()
            break
        # Wait up to _KEEPALIVE_INTERVAL, then yield a ping
        await asyncio.sleep(min(_KEEPALIVE_INTERVAL, remaining))
        elapsed = int((time.monotonic() - t_fork) * 1000)
        yield _evt("ping", {"elapsed_ms": elapsed})

    # Collect results safely
    def _safe_result(task):
        if task.cancelled():
            return TimeoutError("pipeline branch timed out")
        try:
            return task.result()
        except Exception as e:
            return e

    family_result = _safe_result(task_a)
    deployer_results = _safe_result(task_b)
    chain_results = _safe_result(task_c)

    fork_ms = int((time.monotonic() - t_fork) * 1000)

    yield _evt("step", {"step": "family_search", "status": "done", "ms": fork_ms})
    yield _evt("step", {"step": "deployer_forensics", "status": "done", "ms": fork_ms})
    yield _evt("step", {"step": "chain_traces", "status": "done", "ms": fork_ms})

    # Collect results
    if not isinstance(family_result, Exception):
        report.family_tree = family_result
    else:
        logger.warning("[pipeline] family search failed: %s", family_result)

    if isinstance(deployer_results, dict):
        report.deployer_profile = deployer_results.get("deployer_profile")
        report.death_clock = deployer_results.get("death_clock")
        report.factory_rhythm = deployer_results.get("factory_rhythm")
        report.operator_fingerprint = deployer_results.get("operator_fingerprint")

    if isinstance(chain_results, dict):
        report.sol_flow = chain_results.get("sol_flow")
        report.bundle_report = chain_results.get("bundle_report")
        report.cartel_report = chain_results.get("cartel_report")

    report.timings["fork"] = fork_ms

    # -- Phase 3: Dependent enrichers (need fingerprint) ------------------
    fingerprint = report.operator_fingerprint
    linked_wallets: list[str] = []
    if fingerprint and hasattr(fingerprint, "linked_wallets"):
        linked_wallets = fingerprint.linked_wallets or []

    if deployer and (linked_wallets or fingerprint):
        t_dep = time.monotonic()
        yield _evt("step", {"step": "dependent_enrichers", "status": "running"})

        async def _insider() -> None:
            try:
                from .insider_sell_service import analyze_insider_sell
                from .data_sources._clients import get_rpc_client
                rpc = get_rpc_client()
                report.insider_sell = await asyncio.wait_for(
                    analyze_insider_sell(
                        mint, deployer, linked_wallets,
                        identity.pairs, rpc,
                    ),
                    timeout=7.0,
                )
            except Exception as e:
                logger.warning("[pipeline] insider_sell failed: %s", e)

        async def _impact() -> None:
            try:
                from .operator_impact_service import compute_operator_impact
                # compute_operator_impact takes fingerprint string + linked_wallets
                fp_str = fingerprint.fingerprint if fingerprint else ""
                if fp_str and linked_wallets:
                    report.operator_impact = await asyncio.wait_for(
                        compute_operator_impact(fp_str, linked_wallets),
                        timeout=10.0,
                    )
            except Exception as e:
                logger.warning("[pipeline] operator_impact failed: %s", e)

        dep_task = asyncio.ensure_future(
            asyncio.gather(_insider(), _impact(), return_exceptions=True)
        )
        while not dep_task.done():
            await asyncio.sleep(min(_KEEPALIVE_INTERVAL, 5.0))
            yield _evt("ping", {"elapsed_ms": int((time.monotonic() - t_fork) * 1000)})

        dep_ms = int((time.monotonic() - t_dep) * 1000)
        yield _evt("step", {"step": "dependent_enrichers", "status": "done", "ms": dep_ms})
        report.timings["dependent"] = dep_ms

    yield _evt("phase", {"phase": "scan", "status": "done"})

    # Yield the complete report as a special event (consumed by investigate_service)
    yield {"event": "_report", "data": report}


def report_to_lineage_result(report: ForensicReport) -> Any:
    """Convert a ForensicReport back to a LineageResult for backward compat.

    This allows the new pipeline to be used wherever detect_lineage() was used.
    """
    result = report.family_tree
    if result is None:
        return None

    # Attach forensic enrichments to the LineageResult
    if report.deployer_profile is not None:
        result.deployer_profile = report.deployer_profile
    if report.death_clock is not None:
        result.death_clock = report.death_clock
    if report.factory_rhythm is not None:
        result.factory_rhythm = report.factory_rhythm
    if report.operator_fingerprint is not None:
        result.operator_fingerprint = report.operator_fingerprint
    if report.cartel_report is not None:
        result.cartel_report = report.cartel_report
    if report.sol_flow is not None:
        result.sol_flow = report.sol_flow
    if report.bundle_report is not None:
        result.bundle_report = report.bundle_report
    if report.insider_sell is not None:
        result.insider_sell = report.insider_sell
    if report.operator_impact is not None:
        result.operator_impact = report.operator_impact
    if report.liquidity_arch is not None:
        result.liquidity_arch = report.liquidity_arch
    if report.zombie_alert is not None:
        result.zombie_alert = report.zombie_alert

    return result
