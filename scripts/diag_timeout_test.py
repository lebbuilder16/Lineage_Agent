#!/usr/bin/env python3
"""
Diagnostic: test each forensic module individually with precise timing.
Goal: measure real wall-time of bundle, sol_flow, cartel, fingerprint, factory
on a heavily-bundled token to evaluate timeout reduction impact.

Usage:
    cd /workspaces/Lineage_Agent
    PYTHONPATH=src python3 scripts/diag_timeout_test.py [MINT]
"""
from __future__ import annotations

import asyncio
import logging
import sys
import time

logging.basicConfig(
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    level=logging.INFO, stream=sys.stdout,
)
for _q in ("httpx", "httpcore", "PIL", "asyncio"):
    logging.getLogger(_q).setLevel(logging.WARNING)
log = logging.getLogger("diag_timeout")

# Default: BRAINLET (known heavy bundle token) — override via CLI arg
DEFAULT_MINT = "6naWDMGNWwqffJnnXFLBCLaYu1y5U9Rohe5wwBPPpump"


async def find_brainlet_mint() -> str:
    """Search DexScreener for BRAINLET if no mint provided."""
    from lineage_agent.data_sources._clients import get_dex_client
    dex = get_dex_client()
    results = await dex.search_tokens("BRAINLET")
    for p in results:
        tok = p.get("baseToken", {})
        if tok.get("symbol", "").upper() == "BRAINLET" and "solana" in p.get("chainId", ""):
            mint = tok.get("address", "")
            log.info("Found BRAINLET mint via DexScreener: %s", mint)
            return mint
    return ""


async def timed(label: str, coro):
    """Run a coroutine with timing and error handling."""
    t0 = time.perf_counter()
    try:
        result = await coro
        elapsed = time.perf_counter() - t0
        return label, elapsed, result, None
    except asyncio.TimeoutError:
        elapsed = time.perf_counter() - t0
        return label, elapsed, None, "TIMEOUT"
    except Exception as e:
        elapsed = time.perf_counter() - t0
        return label, elapsed, None, str(e)[:200]


async def main():
    from lineage_agent.data_sources._clients import init_clients, close_clients, get_rpc_client, get_dex_client

    mint = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MINT
    await init_clients()

    try:
        # If default mint, try to find BRAINLET via search
        if mint == DEFAULT_MINT:
            found = await find_brainlet_mint()
            if found:
                mint = found

        rpc = get_rpc_client()
        dex = get_dex_client()

        print(f"\n{'='*78}")
        print(f"  FORENSIC TIMEOUT DIAGNOSTIC")
        print(f"  Mint: {mint}")
        print(f"{'='*78}\n")

        # Step 1: Resolve identity (needed by all modules)
        print("── Phase 1: Token Identity ──")
        from lineage_agent.token_identity import resolve_token_identity
        label, dur, identity, err = await timed(
            "resolve_token_identity",
            resolve_token_identity(mint),
        )
        if err:
            print(f"  FATAL: identity resolution failed: {err}")
            return
        print(f"  ✓ {label}: {dur:.2f}s")
        print(f"    name={identity.name}  symbol={identity.symbol}")
        print(f"    deployer={identity.deployer[:16]}…" if identity.deployer else "    deployer=NONE")
        print(f"    launch_platform={identity.launch_platform}")

        deployer = identity.deployer
        if not deployer:
            print("  FATAL: no deployer — cannot run forensics")
            return

        # Step 2: Run each forensic module INDIVIDUALLY with timing
        print(f"\n── Phase 2: Individual Module Timing ──")
        print(f"  (Each module runs alone — no parallelism — to measure true cost)\n")

        results = []

        # 2a. Bundle analysis (the critical one)
        from lineage_agent.bundle_tracker_service import analyze_bundle
        label, dur, res, err = await timed(
            "bundle_analysis",
            asyncio.wait_for(analyze_bundle(mint, deployer), timeout=120.0),
        )
        bundle_res = res
        verdict = getattr(res, "overall_verdict", "N/A") if res else "None"
        n_wallets = len(getattr(res, "bundle_wallets", []) or []) if res else 0
        sol_spent = getattr(res, "total_sol_spent_by_bundle", 0) if res else 0
        sol_ext = getattr(res, "total_sol_extracted_confirmed", 0) if res else 0
        results.append(("BUNDLE", dur, err, f"verdict={verdict} wallets={n_wallets} sol_spent={sol_spent:.4f} sol_ext={sol_ext:.4f}"))

        # 2b. SOL flow trace
        from lineage_agent.sol_flow_service import trace_sol_flow, sol_flows_delete
        # Delete cached sol_flows to force fresh trace
        try:
            from lineage_agent.data_sources._clients import sol_flows_delete as _del
            await _del(mint)
        except Exception:
            pass
        label, dur, res, err = await timed(
            "sol_flow_trace",
            asyncio.wait_for(trace_sol_flow(mint, deployer, token_created_at=identity.created_at), timeout=120.0),
        )
        sol_flow_res = res
        total_sol = getattr(res, "total_extracted_sol", 0) if res else 0
        n_edges = len(getattr(res, "flows", []) or []) if res else 0
        hop_count = getattr(res, "hop_count", 0) if res else 0
        results.append(("SOL_FLOW", dur, err, f"total_sol={total_sol:.4f} edges={n_edges} hops={hop_count}"))

        # 2c. Cartel report
        from lineage_agent.cartel_service import compute_cartel_report
        label, dur, res, err = await timed(
            "cartel_report",
            asyncio.wait_for(compute_cartel_report(mint, deployer), timeout=30.0),
        )
        n_communities = len(getattr(res, "communities", []) or []) if res else 0
        results.append(("CARTEL", dur, err, f"communities={n_communities}"))

        # 2d. Deployer profile
        from lineage_agent.deployer_service import compute_deployer_profile
        label, dur, res, err = await timed(
            "deployer_profile",
            asyncio.wait_for(compute_deployer_profile(deployer), timeout=15.0),
        )
        rug_count = getattr(res, "rug_count", 0) if res else 0
        total_tokens = getattr(res, "total_tokens_launched", 0) if res else 0
        results.append(("DEPLOYER_PROFILE", dur, err, f"rug_count={rug_count} total_tokens={total_tokens}"))

        # 2e. Factory rhythm
        from lineage_agent.factory_service import analyze_factory_rhythm
        label, dur, res, err = await timed(
            "factory_rhythm",
            asyncio.wait_for(analyze_factory_rhythm(deployer), timeout=15.0),
        )
        is_factory = getattr(res, "is_factory", False) if res else False
        results.append(("FACTORY_RHYTHM", dur, err, f"is_factory={is_factory}"))

        # 2f. Operator fingerprint
        from lineage_agent.metadata_dna_service import build_operator_fingerprint
        label, dur, res, err = await timed(
            "operator_fingerprint",
            asyncio.wait_for(_run_fingerprint(rpc, deployer), timeout=20.0),
        )
        n_linked = len(getattr(res, "linked_wallets", []) or []) if res else 0
        results.append(("OPERATOR_FINGERPRINT", dur, err, f"linked_wallets={n_linked}"))

        # 2g. Insider sell
        from lineage_agent.insider_sell_service import analyze_insider_sell
        from lineage_agent.models import MarketSurface, LifecycleStage, EvidenceLevel
        label, dur, res, err = await timed(
            "insider_sell",
            asyncio.wait_for(
                analyze_insider_sell(
                    mint, deployer, [],
                    identity.pairs, rpc,
                    launch_platform=identity.launch_platform,
                    lifecycle_stage=identity.lifecycle_stage or LifecycleStage.UNKNOWN,
                    market_surface=identity.market_surface or MarketSurface.NO_MARKET_OBSERVED,
                    reason_codes=identity.reason_codes or [],
                    evidence_level=identity.evidence_level or EvidenceLevel.WEAK,
                ),
                timeout=20.0,
            ),
        )
        ins_verdict = getattr(res, "verdict", "N/A") if res else "None"
        deployer_exited = getattr(res, "deployer_exited", False) if res else False
        results.append(("INSIDER_SELL", dur, err, f"verdict={ins_verdict} deployer_exited={deployer_exited}"))

        # 2h. Death clock
        from lineage_agent.death_clock import compute_death_clock
        from lineage_agent.models import TokenMetadata
        _qm = identity._query_meta
        meta = TokenMetadata(
            mint=identity.mint, name=identity.name, symbol=identity.symbol,
            deployer=deployer, created_at=identity.created_at,
            liquidity_usd=identity.liquidity_usd, market_cap_usd=identity.market_cap_usd,
            price_usd=identity.price_usd,
            volume_24h_usd=getattr(_qm, "volume_24h_usd", None) if _qm else None,
            txns_24h_buys=getattr(_qm, "txns_24h_buys", None) if _qm else None,
            txns_24h_sells=getattr(_qm, "txns_24h_sells", None) if _qm else None,
            price_change_1h=getattr(_qm, "price_change_1h", None) if _qm else None,
            price_change_24h=getattr(_qm, "price_change_24h", None) if _qm else None,
        )
        label, dur, res, err = await timed(
            "death_clock",
            asyncio.wait_for(compute_death_clock(deployer, identity.created_at, token_metadata=meta), timeout=15.0),
        )
        risk_level = getattr(res, "risk_level", "N/A") if res else "None"
        results.append(("DEATH_CLOCK", dur, err, f"risk_level={risk_level}"))

        # ── Print results ──
        print(f"\n{'='*78}")
        print(f"  RESULTS — MODULE TIMING")
        print(f"{'='*78}")
        print(f"  {'Module':<25} {'Time':>8}  {'Status':>8}  Details")
        print(f"  {'─'*72}")

        total_time = 0
        for name, dur, err, details in results:
            total_time += dur
            status = "FAIL" if err else "OK"
            icon = "❌" if err else "✅"
            time_warning = " ⚠️>15s" if dur > 15 else (" ⚠️>25s" if dur > 25 else "")
            print(f"  {icon} {name:<23} {dur:>7.2f}s  {status:>8}  {details}")
            if err:
                print(f"     └─ error: {err}")
            if time_warning:
                print(f"     └─ {time_warning}")

        print(f"  {'─'*72}")
        print(f"  Total sequential: {total_time:.1f}s")
        print(f"  Est. parallel (Branch B+C+D): ~{max(r[1] for r in results):.1f}s wall-time")

        # ── Simulate timeout scenarios ──
        print(f"\n{'='*78}")
        print(f"  TIMEOUT IMPACT SIMULATION")
        print(f"{'='*78}")

        for timeout_label, sol_to, bundle_to in [("Current (45s)", 45, 45), ("Proposed (15s/25s)", 15, 25), ("Aggressive (15s/15s)", 15, 15)]:
            bundle_dur = next(r[1] for r in results if r[0] == "BUNDLE")
            sol_dur = next(r[1] for r in results if r[0] == "SOL_FLOW")
            bundle_ok = bundle_dur <= bundle_to
            sol_ok = sol_dur <= sol_to

            # Heuristic score simulation
            from lineage_agent.ai_analyst import _heuristic_score
            sim_bundle = bundle_res if bundle_ok else None
            sim_sol = sol_flow_res if sol_ok else None
            # We need a lineage-like object — use a simple namespace
            class _FakeLineage:
                pass
            fl = _FakeLineage()
            for attr in ["deployer_profile", "derivatives", "zombie_alert", "insider_sell",
                         "death_clock", "factory_rhythm", "cartel_report", "operator_impact"]:
                setattr(fl, attr, None)
            # Attach whatever we computed
            fl.deployer_profile = next((r[2] for r in [(n, d, r, e) for n, d, r, e in
                [("DEPLOYER_PROFILE", *next((r[1], r[2] if not r[3] else None, r[3]) for r in
                [(name, dur, res_val, err_val) for name, dur, err_val, details in results
                 if name == "DEPLOYER_PROFILE"
                 for res_val in [None]]))] if r]), None)
            # Simpler: just compute with what we have
            score_full = _heuristic_score(None, bundle_res, sol_flow_res)
            score_sim = _heuristic_score(None, sim_bundle, sim_sol)

            print(f"\n  {timeout_label}:")
            print(f"    Bundle:   {'✅ completes' if bundle_ok else '❌ TIMEOUT'} ({bundle_dur:.1f}s vs {bundle_to}s limit)")
            print(f"    SOL flow: {'✅ completes' if sol_ok else '❌ TIMEOUT'} ({sol_dur:.1f}s vs {sol_to}s limit)")
            print(f"    Heuristic (bundle+sol only): full={score_full} → simulated={score_sim} (delta={score_sim - score_full:+d})")

        print(f"\n{'='*78}")

    finally:
        await close_clients()


async def _run_fingerprint(rpc, deployer):
    from lineage_agent.metadata_dna_service import build_operator_fingerprint
    assets = await rpc.search_assets_by_creator(deployer, limit=50)
    uri_tuples = [
        (a.get("id", ""), deployer, (a.get("content") or {}).get("json_uri") or "")
        for a in assets
    ]
    if uri_tuples:
        return await build_operator_fingerprint(uri_tuples)
    return None


if __name__ == "__main__":
    asyncio.run(main())
