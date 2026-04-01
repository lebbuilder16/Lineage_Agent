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
_KEEPALIVE_INTERVAL = 3.0
_PIPELINE_TIMEOUT = 90.0

# In-process cache for ForensicReport (avoids re-running pipeline on retry)
_report_cache: dict[str, tuple[float, "ForensicReport"]] = {}
_REPORT_CACHE_TTL = 300.0  # 5 minutes (default for low-risk tokens)
_REPORT_CACHE_TTL_HIGH_RISK = 90.0   # 1.5 minutes for high-risk tokens (need fresher data)
_REPORT_CACHE_TTL_CRITICAL = 45.0    # 45 seconds for critical tokens

# Dedup: prevent duplicate pipeline runs for the same mint concurrently
_running_pipelines: dict[str, asyncio.Event] = {}


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
    sniper_report: Any = None
    cluster_score: Any = None
    funding_source: str = ""  # address of first SOL funder of deployer
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

    async def _safe_background(coro, name: str, mint_short: str):
        """Run a slow analysis in background — result lands in cache for next call."""
        try:
            await asyncio.wait_for(coro, timeout=90.0)
            logger.info("[pipeline] background %s completed for %s", name, mint_short[:12])
        except Exception as e:
            logger.warning("[pipeline] background %s failed for %s: %s", name, mint_short[:12], e)

    # -- Dedup: if another pipeline for this mint is already running, wait for it --
    if mint in _running_pipelines and not force_refresh:
        logger.info("[pipeline] dedup: waiting for existing run of %s", mint[:12])
        try:
            await asyncio.wait_for(_running_pipelines[mint].wait(), timeout=_PIPELINE_TIMEOUT)
        except asyncio.TimeoutError:
            pass
        # After waiting, check cache (the other run should have populated it)
        _dedup_cached = _report_cache.get(mint)
        if _dedup_cached:
            yield _evt("phase", {"phase": "scan", "status": "started"})
            yield _evt("step", {"step": "identity", "status": "done", "ms": 0})
            yield _evt("phase", {"phase": "scan", "status": "done"})
            yield {"event": "_report", "data": _dedup_cached[1]}
            return

    # Register this pipeline run for dedup (signaled at the end of pipeline)
    _running_pipelines[mint] = asyncio.Event()

    # -- Check in-process cache first (avoids full re-run on retry) ----------
    _cached = _report_cache.get(mint)
    if _cached and not force_refresh:
        _cache_age = time.monotonic() - _cached[0]
        _ttl = getattr(_cached[1], '_cache_ttl', _REPORT_CACHE_TTL)
        if _cache_age < _ttl:
            cached_report = _cached[1]
            logger.info("[pipeline] cache hit for %s (%.0fs old)", mint[:12], _cache_age)

            # Always refresh market data (price/mcap/liq) from DexScreener
            # even on cache hit — prices move fast, this is a single HTTP call.
            try:
                from .data_sources._clients import get_dex_client
                _dex = get_dex_client()
                _fresh_pairs = await _dex.get_token_pairs_with_fallback(mint)
                if _fresh_pairs:
                    _fresh_meta = _dex.pairs_to_metadata(mint, _fresh_pairs)
                    cached_report.identity.price_usd = _fresh_meta.price_usd
                    cached_report.identity.market_cap_usd = _fresh_meta.market_cap_usd
                    cached_report.identity.liquidity_usd = _fresh_meta.liquidity_usd
                    cached_report.identity.pairs = _fresh_pairs
                    if cached_report.identity._query_meta:
                        cached_report.identity._query_meta.price_usd = _fresh_meta.price_usd
                        cached_report.identity._query_meta.market_cap_usd = _fresh_meta.market_cap_usd
                        cached_report.identity._query_meta.liquidity_usd = _fresh_meta.liquidity_usd
                        cached_report.identity._query_meta.volume_24h_usd = _fresh_meta.volume_24h_usd
                        cached_report.identity._query_meta.price_change_24h = _fresh_meta.price_change_24h
            except Exception:
                pass  # keep cached data if refresh fails

            yield _evt("phase", {"phase": "scan", "status": "started"})
            yield _evt("step", {"step": "identity", "status": "done", "ms": 0})
            # Emit identity_ready with fresh market data even on cache hit
            _ci = cached_report.identity
            _cqm = _ci._query_meta if hasattr(_ci, "_query_meta") else None
            yield _evt("identity_ready", {
                "name": _ci.name,
                "symbol": getattr(_ci, "symbol", ""),
                "deployer": _ci.deployer[:12] if _ci.deployer else "",
                "created_at": str(_ci.created_at) if _ci.created_at else None,
                "ms": 0,
                "price_usd": _ci.price_usd,
                "market_cap_usd": _ci.market_cap_usd,
                "liquidity_usd": _ci.liquidity_usd,
                "volume_24h_usd": getattr(_cqm, "volume_24h_usd", None) if _cqm else None,
                "price_change_24h": getattr(_cqm, "price_change_24h", None) if _cqm else None,
                "boost_count": getattr(_cqm, "boost_count", None) if _cqm else None,
            })
            yield _evt("phase", {"phase": "scan", "status": "done"})
            # Signal dedup on cache hit
            _dedup_evt = _running_pipelines.pop(mint, None)
            if _dedup_evt:
                _dedup_evt.set()
            yield {"event": "_report", "data": cached_report}
            return

    yield _evt("phase", {"phase": "scan", "status": "started"})

    # -- Phase 1: Token Identity (2-3s) -----------------------------------
    yield _evt("step", {"step": "identity", "status": "running"})
    t0 = time.monotonic()
    identity = await resolve_token_identity(mint, force_refresh=force_refresh)
    id_ms = int((time.monotonic() - t0) * 1000)
    yield _evt("step", {"step": "identity", "status": "done", "ms": id_ms})

    # Extract market data from the identity's underlying metadata
    _qm = identity._query_meta
    yield _evt("identity_ready", {
        "name": identity.name,
        "symbol": identity.symbol,
        "deployer": identity.deployer[:12] if identity.deployer else "",
        "created_at": str(identity.created_at) if identity.created_at else None,
        "ms": id_ms,
        "price_usd": identity.price_usd,
        "market_cap_usd": identity.market_cap_usd,
        "liquidity_usd": identity.liquidity_usd,
        "volume_24h_usd": getattr(_qm, "volume_24h_usd", None) if _qm else None,
        "price_change_24h": getattr(_qm, "price_change_24h", None) if _qm else None,
        "boost_count": getattr(_qm, "boost_count", None) if _qm else None,
    })

    deployer = identity.deployer

    # If deployer is empty, attempt a force-refresh (sig-walk may have timed out
    # on the first resolution and cached an empty result with short TTL).
    if not deployer:
        try:
            from .lineage_detector import _get_deployer_cached
            from .data_sources._clients import get_rpc_client
            _retry_deployer, _retry_ts = await asyncio.wait_for(
                _get_deployer_cached(get_rpc_client(), mint), timeout=15.0,
            )
            if _retry_deployer:
                deployer = _retry_deployer
                identity.deployer = _retry_deployer
                if _retry_ts and (identity.created_at is None or _retry_ts < identity.created_at):
                    identity.created_at = _retry_ts
                logger.info("[pipeline] deployer retry resolved %s for %s", deployer[:12], mint[:12])
        except Exception as _retry_exc:
            logger.debug("[pipeline] deployer retry failed for %s: %s", mint[:12], _retry_exc)

    report = ForensicReport(identity=identity)
    report.timings["identity"] = id_ms

    # Liquidity architecture (zero RPC — uses DexScreener pairs already fetched)
    if identity.pairs:
        try:
            from .liquidity_arch import analyze_liquidity_architecture
            report.liquidity_arch = analyze_liquidity_architecture(identity.pairs, identity.mint)
        except Exception as _la_exc:
            logger.debug("[pipeline] liquidity_arch failed: %s", _la_exc)

    if not identity.name and not identity.symbol:
        # Unknown token -- can't search for family
        yield _evt("phase", {"phase": "scan", "status": "done"})
        yield {"event": "_report", "data": report}
        return

    # -- Phase 2: FORK -- 3 branches in parallel -------------------------
    # Branch A: Family Search + Score (needs identity)
    # Branch B: Deployer-based forensics (needs deployer only)
    # Branch C: On-chain traces (needs mint + deployer)

    # Shared list for sub-task step events (collected during parallel execution,
    # yielded after gather completes — async generators can't yield from tasks)
    _step_events: list[dict] = []

    def _sub_step(name: str, status: str, ms: int = 0, ok: bool = True) -> None:
        """Record a sub-task step event for later emission."""
        _step_events.append(_evt("step", {
            "step": name, "status": status, "ms": ms,
            **({"error": True} if not ok else {}),
        }))

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
            _sub_step("deployer_profile", "running")
            t = time.monotonic()
            try:
                results["deployer_profile"] = await asyncio.wait_for(
                    compute_deployer_profile(deployer), timeout=10.0
                )
                _sub_step("deployer_profile", "done", ms=int((time.monotonic() - t) * 1000))
            except Exception as e:
                logger.warning("[pipeline] deployer_profile failed: %s", e)
                _sub_step("deployer_profile", "done", ms=int((time.monotonic() - t) * 1000), ok=False)

        async def _death_clock() -> None:
            _sub_step("death_clock", "running")
            t = time.monotonic()
            try:
                _qm = identity._query_meta
                meta = TokenMetadata(
                    mint=identity.mint,
                    name=identity.name,
                    symbol=identity.symbol,
                    deployer=deployer,
                    created_at=identity.created_at,
                    liquidity_usd=identity.liquidity_usd,
                    market_cap_usd=identity.market_cap_usd,
                    price_usd=identity.price_usd,
                    volume_24h_usd=getattr(_qm, "volume_24h_usd", None) if _qm else None,
                    txns_24h_buys=getattr(_qm, "txns_24h_buys", None) if _qm else None,
                    txns_24h_sells=getattr(_qm, "txns_24h_sells", None) if _qm else None,
                    price_change_1h=getattr(_qm, "price_change_1h", None) if _qm else None,
                    price_change_24h=getattr(_qm, "price_change_24h", None) if _qm else None,
                )
                results["death_clock"] = await asyncio.wait_for(
                    compute_death_clock(deployer, identity.created_at, token_metadata=meta),
                    timeout=10.0,
                )
                _sub_step("death_clock", "done", ms=int((time.monotonic() - t) * 1000))
            except Exception as e:
                logger.warning("[pipeline] death_clock failed: %s", e)
                _sub_step("death_clock", "done", ms=int((time.monotonic() - t) * 1000), ok=False)

        async def _factory() -> None:
            _sub_step("factory_rhythm", "running")
            t = time.monotonic()
            try:
                results["factory_rhythm"] = await asyncio.wait_for(
                    analyze_factory_rhythm(deployer), timeout=10.0
                )
                _sub_step("factory_rhythm", "done", ms=int((time.monotonic() - t) * 1000))
            except Exception as e:
                logger.warning("[pipeline] factory failed: %s", e)
                _sub_step("factory_rhythm", "done", ms=int((time.monotonic() - t) * 1000), ok=False)

        async def _fingerprint() -> None:
            _sub_step("operator_fingerprint", "running")
            t = time.monotonic()
            try:
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
                        build_operator_fingerprint(uri_tuples), timeout=12.0
                    )
                _sub_step("operator_fingerprint", "done", ms=int((time.monotonic() - t) * 1000))
            except Exception as e:
                logger.warning("[pipeline] fingerprint failed: %s", e)
                _sub_step("operator_fingerprint", "done", ms=int((time.monotonic() - t) * 1000), ok=False)

        async def _funding_source() -> None:
            """Lightweight check: who funded this deployer? (1 RPC call)"""
            try:
                from .data_sources._clients import get_rpc_client
                _rpc = get_rpc_client()
                # Get first few signatures on deployer — look for incoming SOL
                sigs = await _rpc._call(
                    "getSignaturesForAddress",
                    [deployer, {"limit": 5, "commitment": "finalized"}],
                )
                if not sigs:
                    return
                # Check the oldest signature for the funder
                oldest_sig = sigs[-1]["signature"]
                tx = await _rpc._call(
                    "getTransaction",
                    [oldest_sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}],
                )
                if not tx or not isinstance(tx, dict):
                    return
                keys = tx.get("transaction", {}).get("message", {}).get("accountKeys", [])
                for key in keys:
                    addr = key.get("pubkey", "") if isinstance(key, dict) else key
                    is_signer = key.get("signer", False) if isinstance(key, dict) else False
                    if addr and is_signer and addr != deployer:
                        results["funding_source"] = addr
                        break
            except Exception:
                pass  # non-critical — best effort

        # Run all 5 in parallel
        await asyncio.gather(
            _deployer_profile(), _death_clock(), _factory(), _fingerprint(),
            _funding_source(),
            return_exceptions=True,
        )
        return results

    async def _branch_c_chain_traces() -> dict:
        """SOL flow trace + cartel edges + bundle analysis."""
        results: dict[str, Any] = {}

        from .sol_flow_service import get_sol_flow_report, trace_sol_flow
        from .bundle_tracker_service import get_cached_bundle_report, analyze_bundle

        async def _sol_flow() -> None:
            _sub_step("sol_flow", "running")
            t = time.monotonic()
            try:
                cached = await get_sol_flow_report(mint)
                if cached:
                    results["sol_flow"] = cached
                    _sub_step("sol_flow", "done", ms=int((time.monotonic() - t) * 1000))
                    return
                if deployer:
                    results["sol_flow"] = await asyncio.wait_for(
                        trace_sol_flow(mint, deployer, token_created_at=identity.created_at),
                        timeout=15.0,
                    )
                _sub_step("sol_flow", "done", ms=int((time.monotonic() - t) * 1000))
            except asyncio.TimeoutError:
                logger.info("[pipeline] sol_flow timeout at 15s for %s — continuing in background", mint[:12])
                asyncio.create_task(
                    _safe_background(trace_sol_flow(mint, deployer, token_created_at=identity.created_at), "sol_flow", mint),
                )
                _sub_step("sol_flow", "done", ms=int((time.monotonic() - t) * 1000), ok=False)
            except Exception as e:
                logger.warning("[pipeline] sol_flow failed: %s", e)
                _sub_step("sol_flow", "done", ms=int((time.monotonic() - t) * 1000), ok=False)

        async def _bundle() -> None:
            _sub_step("bundle", "running")
            t = time.monotonic()
            try:
                cached = await get_cached_bundle_report(mint)
                if cached:
                    results["bundle_report"] = cached
                    _sub_step("bundle", "done", ms=int((time.monotonic() - t) * 1000))
                    return
                if deployer:
                    results["bundle_report"] = await asyncio.wait_for(
                        analyze_bundle(mint, deployer), timeout=25.0,
                    )
                _sub_step("bundle", "done", ms=int((time.monotonic() - t) * 1000))
            except asyncio.TimeoutError:
                logger.info("[pipeline] bundle timeout at 25s for %s — continuing in background", mint[:12])
                asyncio.create_task(
                    _safe_background(analyze_bundle(mint, deployer), "bundle", mint),
                )
                _sub_step("bundle", "done", ms=int((time.monotonic() - t) * 1000), ok=False)
            except Exception as e:
                logger.warning("[pipeline] bundle failed: %s", e)
                _sub_step("bundle", "done", ms=int((time.monotonic() - t) * 1000), ok=False)

        async def _cartel() -> None:
            if not deployer:
                return
            _sub_step("cartel", "running")
            t = time.monotonic()
            try:
                from .cartel_service import compute_cartel_report
                results["cartel_report"] = await asyncio.wait_for(
                    compute_cartel_report(mint, deployer), timeout=20.0
                )
                _sub_step("cartel", "done", ms=int((time.monotonic() - t) * 1000))
            except Exception as e:
                logger.warning("[pipeline] cartel failed: %s", e)
                _sub_step("cartel", "done", ms=int((time.monotonic() - t) * 1000), ok=False)

        async def _sniper() -> None:
            if not deployer:
                return
            _sub_step("sniper", "running")
            t = time.monotonic()
            try:
                from .sniper_tracker_service import analyze_sniper_ring
                # Get creation_slot from identity if available
                _creation_slot = None
                if hasattr(identity, '_creation_slot'):
                    _creation_slot = identity._creation_slot
                results["sniper_report"] = await asyncio.wait_for(
                    analyze_sniper_ring(
                        mint, deployer,
                        creation_slot=_creation_slot,
                        created_at=identity.created_at,
                        pairs=identity.pairs,
                    ),
                    timeout=15.0,
                )
                _sub_step("sniper", "done", ms=int((time.monotonic() - t) * 1000))
            except Exception as e:
                logger.warning("[pipeline] sniper failed: %s", e)
                _sub_step("sniper", "done", ms=int((time.monotonic() - t) * 1000), ok=False)

        async def _cluster_score() -> None:
            if not deployer:
                return
            _sub_step("cluster_score", "running")
            t = time.monotonic()
            try:
                from .cluster_scoring_service import compute_cluster_score
                results["cluster_score"] = await asyncio.wait_for(
                    compute_cluster_score(mint, deployer), timeout=12.0,
                )
                _sub_step("cluster_score", "done", ms=int((time.monotonic() - t) * 1000))
            except Exception as e:
                logger.warning("[pipeline] cluster_score failed: %s", e)
                _sub_step("cluster_score", "done", ms=int((time.monotonic() - t) * 1000), ok=False)

        await asyncio.gather(
            _sol_flow(), _bundle(), _cartel(), _sniper(), _cluster_score(),
            return_exceptions=True,
        )
        return results

    # -- Branch D: Insider Sell (needs deployer + pairs, NOT fingerprint) ----
    async def _branch_d_insider_sell() -> Optional[Any]:
        """Insider sell detection — runs in parallel with other branches."""
        if not deployer:
            return None
        _sub_step("insider_sell", "running")
        t = time.monotonic()
        try:
            from .insider_sell_service import analyze_insider_sell
            from .data_sources._clients import get_rpc_client
            rpc = get_rpc_client()
            from .models import MarketSurface, LifecycleStage, EvidenceLevel
            result = await asyncio.wait_for(
                analyze_insider_sell(
                    mint, deployer, [],  # no linked_wallets yet — enriched later if available
                    identity.pairs, rpc,
                    launch_platform=identity.launch_platform,
                    lifecycle_stage=identity.lifecycle_stage or LifecycleStage.UNKNOWN,
                    market_surface=identity.market_surface or MarketSurface.NO_MARKET_OBSERVED,
                    reason_codes=identity.reason_codes or [],
                    evidence_level=identity.evidence_level or EvidenceLevel.WEAK,
                ),
                timeout=15.0,
            )
            _sub_step("insider_sell", "done", ms=int((time.monotonic() - t) * 1000))
            return result
        except Exception as e:
            logger.warning("[pipeline] insider_sell failed: %s", e)
            _sub_step("insider_sell", "done", ms=int((time.monotonic() - t) * 1000), ok=False)
            return None

    # Execute all 4 branches in parallel with SSE keepalive pings
    t_fork = time.monotonic()

    yield _evt("step", {"step": "family_search", "status": "running"})
    yield _evt("step", {"step": "deployer_forensics", "status": "running"})
    yield _evt("step", {"step": "chain_traces", "status": "running"})

    # Launch branches as tasks and poll with SSE keepalive pings
    task_a = asyncio.ensure_future(_branch_a_family())
    task_b = asyncio.ensure_future(_branch_b_deployer_forensics())
    task_c = asyncio.ensure_future(_branch_c_chain_traces())
    task_d = asyncio.ensure_future(_branch_d_insider_sell())
    all_tasks = [task_a, task_b, task_c, task_d]

    # Track whether we've emitted the early pre-scan (B+D ready)
    _early_prescan_emitted = False

    deadline = time.monotonic() + _PIPELINE_TIMEOUT
    while not all(t.done() for t in all_tasks):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            for t in all_tasks:
                if not t.done():
                    t.cancel()
            break
        # Wait up to _KEEPALIVE_INTERVAL, then yield a ping + flush sub-step events
        await asyncio.sleep(min(_KEEPALIVE_INTERVAL, remaining))
        # Flush any sub-step events accumulated during this interval
        while _step_events:
            yield _step_events.pop(0)

        # Emit early pre-scan as soon as Branch B (deployer) + D (insider) complete
        # The agent can start reasoning while A (family) + C (chain) continue
        if not _early_prescan_emitted and task_b.done() and task_d.done():
            _early_prescan_emitted = True
            _ep_deployer = {}
            _ep_insider = None
            try:
                _ep_deployer = task_b.result() if not task_b.cancelled() else {}
            except Exception:
                _ep_deployer = {}
            try:
                _ep_insider = task_d.result() if not task_d.cancelled() else None
            except Exception:
                _ep_insider = None

            # ── Early termination: if deployer is an obvious rug factory, skip slow branches ──
            _dp = _ep_deployer.get("deployer_profile") if isinstance(_ep_deployer, dict) else None
            _early_score = 0
            if _dp:
                _rug_count = getattr(_dp, "rug_count", 0) or 0
                _total = getattr(_dp, "total_tokens_launched", 0) or 0
                _rug_rate = _rug_count / _total if _total > 0 else 0
                if _rug_rate >= 0.8 and _rug_count >= 3:
                    _early_score = 90
                elif _rug_rate >= 0.5 and _rug_count >= 2:
                    _early_score = 75
                elif _rug_count >= 1:
                    _early_score = 50

            if _ep_insider and hasattr(_ep_insider, "verdict"):
                if getattr(_ep_insider, "verdict", "") == "insider_dump":
                    _early_score = max(_early_score, 80)
                if getattr(_ep_insider, "deployer_exited", False):
                    _early_score = max(_early_score, 85)

            if _early_score >= 85:
                # Cancel slow branches — verdict is already clear
                logger.info("[pipeline] early termination: score=%d, cancelling slow branches for %s", _early_score, mint[:12])
                for t in [task_a, task_c]:
                    if not t.done():
                        t.cancel()

            yield {"event": "_early_prescan", "data": {
                "deployer_profile": _ep_deployer.get("deployer_profile") if isinstance(_ep_deployer, dict) else None,
                "death_clock": _ep_deployer.get("death_clock") if isinstance(_ep_deployer, dict) else None,
                "insider_sell": _ep_insider,
                "early_score": _early_score,
            }}

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
    insider_result = _safe_result(task_d)

    # Flush any remaining sub-step events
    while _step_events:
        yield _step_events.pop(0)

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
        report.funding_source = deployer_results.get("funding_source") or ""

    if isinstance(chain_results, dict):
        report.sol_flow = chain_results.get("sol_flow")
        report.bundle_report = chain_results.get("bundle_report")
        report.cartel_report = chain_results.get("cartel_report")
        report.sniper_report = chain_results.get("sniper_report")
        report.cluster_score = chain_results.get("cluster_score")

    # Insider sell from Branch D (ran in parallel, not sequential)
    if insider_result is not None and not isinstance(insider_result, Exception):
        report.insider_sell = insider_result

    report.timings["fork"] = fork_ms

    # -- Phase 3: Operator impact only (needs fingerprint from Branch B) ----
    fingerprint = report.operator_fingerprint
    linked_wallets: list[str] = []
    if fingerprint and hasattr(fingerprint, "linked_wallets"):
        linked_wallets = fingerprint.linked_wallets or []

    if deployer and fingerprint and linked_wallets:
        t_dep = time.monotonic()
        yield _evt("step", {"step": "dependent_enrichers", "status": "running"})

        async def _impact() -> None:
            _sub_step("operator_impact", "running")
            t = time.monotonic()
            try:
                from .operator_impact_service import compute_operator_impact
                fp_str = fingerprint.fingerprint if fingerprint else ""
                if fp_str and linked_wallets:
                    report.operator_impact = await asyncio.wait_for(
                        compute_operator_impact(fp_str, linked_wallets),
                        timeout=12.0,
                    )
                _sub_step("operator_impact", "done", ms=int((time.monotonic() - t) * 1000))
            except Exception as e:
                logger.warning("[pipeline] operator_impact failed: %s", e)
                _sub_step("operator_impact", "done", ms=int((time.monotonic() - t) * 1000), ok=False)

        dep_task = asyncio.ensure_future(_impact())
        while not dep_task.done():
            await asyncio.sleep(min(_KEEPALIVE_INTERVAL, 5.0))
            while _step_events:
                yield _step_events.pop(0)
            yield _evt("ping", {"elapsed_ms": int((time.monotonic() - t_fork) * 1000)})

        # Flush remaining sub-step events
        while _step_events:
            yield _step_events.pop(0)

        dep_ms = int((time.monotonic() - t_dep) * 1000)
        yield _evt("step", {"step": "dependent_enrichers", "status": "done", "ms": dep_ms})
        report.timings["dependent"] = dep_ms

    yield _evt("phase", {"phase": "scan", "status": "done"})

    # Cache the report for fast retry (5 min TTL)
    # Adaptive TTL: high-risk tokens get shorter cache to detect changes faster
    from .ai_analyst import _heuristic_score
    _hscore = _heuristic_score(report.family_tree, report.bundle_report, report.sol_flow)
    _adaptive_ttl = (
        _REPORT_CACHE_TTL_CRITICAL if _hscore >= 75
        else _REPORT_CACHE_TTL_HIGH_RISK if _hscore >= 50
        else _REPORT_CACHE_TTL
    )
    _report_cache[mint] = (time.monotonic(), report)
    report._cache_ttl = _adaptive_ttl  # store TTL on report for cache hit check
    # Prune old entries (keep last 50)
    if len(_report_cache) > 50:
        oldest_key = min(_report_cache, key=lambda k: _report_cache[k][0])
        _report_cache.pop(oldest_key, None)

    # Signal dedup event so waiting pipelines can proceed
    _dedup_evt = _running_pipelines.pop(mint, None)
    if _dedup_evt:
        _dedup_evt.set()

    # Yield the complete report as a special event (consumed by investigate_service)
    yield {"event": "_report", "data": report}


def report_to_lineage_result(report: ForensicReport) -> Any:
    """Convert a ForensicReport back to a LineageResult for backward compat.

    This allows the new pipeline to be used wherever detect_lineage() was used.
    """
    result = report.family_tree
    if result is None:
        return None

    # Sync deployer on query_token: the pipeline resolves deployer via PumpFun
    # API (authoritative), while detect_lineage may resolve via DAS creators[]
    # (unreliable for PumpFun tokens). Only sync query_token — root.deployer
    # belongs to a different token (the original) and must NOT be overwritten.
    pipeline_deployer = report.identity.deployer
    if pipeline_deployer and result.query_token:
        qt_deployer = getattr(result.query_token, "deployer", "")
        if qt_deployer != pipeline_deployer:
            result.query_token.deployer = pipeline_deployer
            logger.info(
                "[report_to_lineage] deployer sync: query_token %s → %s for %s",
                (qt_deployer or "empty")[:12], pipeline_deployer[:12],
                report.identity.mint[:12],
            )
    # If query IS the root (query_is_root=True), also sync root.deployer
    if pipeline_deployer and getattr(result, "query_is_root", False) and result.root:
        root_deployer = getattr(result.root, "deployer", "")
        if root_deployer != pipeline_deployer:
            result.root.deployer = pipeline_deployer

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
    if report.sniper_report is not None:
        result.sniper_report = report.sniper_report
    if report.cluster_score is not None:
        result.cluster_score = report.cluster_score

    return result
