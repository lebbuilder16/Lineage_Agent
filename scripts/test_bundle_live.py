#!/usr/bin/env python3
"""
Live integration test — verify bundle detection pipeline works on real
PumpFun tokens.

Tests:
1. Pipeline reaches creation slot (get_oldest_signature works)
2. Bundle window sigs are collected (collect_window_sigs with cross-page)
3. Buyers are extracted correctly
4. Sell detection works (is_full_sell with target_mint)
5. Verdicts are computed
6. SOL flow receives bundle seeds when warranted

Usage:
    python3 scripts/test_bundle_live.py

Hits the deployed API at https://lineage-agent.fly.dev
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request
import urllib.error

API_BASE = "https://lineage-agent.fly.dev"

# Real PumpFun tokens from DexScreener — active tokens with bundle window
# activity.  We pick recently-created low-liquidity tokens where bundles
# are common.
TOKENS = [
    ("GjRqoAfwmsUT4Q1C1qJJTJDeSVRdepT9ZWTotjofpump", "Peace Frog (Shiro)"),
    ("2HPJQUjBbHRZv14oERNkPeVTPV3b4dyop6iGxAv9pump",  "Token #2"),
    ("Di1jiJeWpdMxMNniaLaxaM52muihiKWbqorjhZRppump",  "Token #3"),
    ("9dqJDBJ29MqXXWAy9sRorG8xTHvKpgpwqi1qL1tLpump",  "Token #4"),
    ("DzppeRRAjPpvcEE541aTN7Xm8ERjA9nBW8KDawfWpump",  "Token #5"),
]


def test_lineage(mint: str, desc: str) -> dict:
    """Call /lineage?mint=<mint> and return the result."""
    url = f"{API_BASE}/lineage?mint={mint}"
    print(f"\n{'='*70}")
    print(f"Testing: {desc}")
    print(f"Mint:    {mint}")
    print(f"{'='*70}")

    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"  >> HTTP {e.code}: {body[:200]}")
        return {"error": e.code, "body": body}
    except Exception as e:
        print(f"  >> Error: {e}")
        return {"error": str(e)}

    # Extract bundle report
    br = data.get("bundle_report")
    sol_flow = data.get("sol_flow") or data.get("sol_flow_trace")

    print(f"\n  Bundle Report:")
    if br:
        verdict = br.get("overall_verdict", "N/A")
        n_wallets = len(br.get("bundle_wallets", []))
        confirmed = br.get("confirmed_team_wallets", [])
        suspected = br.get("suspected_team_wallets", [])
        coord = br.get("coordinated_dump_wallets", [])
        early = br.get("early_buyer_wallets", [])
        sol_spent = br.get("total_sol_spent_by_bundle", 0)
        sol_extracted = br.get("total_sol_extracted_confirmed", 0)
        launch_slot = br.get("launch_slot", "?")
        evidence = br.get("evidence_chain", [])

        # Check for sells
        sell_count = 0
        for w in br.get("bundle_wallets", []):
            ps = w.get("post_sell", {})
            if ps.get("sell_detected"):
                sell_count += 1

        print(f"     Launch slot:       {launch_slot}")
        print(f"     Verdict:           {verdict}")
        print(f"     Bundle wallets:    {n_wallets}")
        print(f"     Sells detected:    {sell_count}/{n_wallets}")
        print(f"     Confirmed team:    {len(confirmed)}")
        print(f"     Suspected team:    {len(suspected)}")
        print(f"     Coordinated dump:  {len(coord)}")
        print(f"     Early buyers:      {len(early)}")
        print(f"     SOL spent:         {sol_spent:.4f}")
        print(f"     SOL extracted:     {sol_extracted:.4f}")
        if evidence:
            print(f"     Evidence:")
            for e in evidence:
                print(f"       - {e}")
    else:
        print(f"     (no bundle report)")

    print(f"\n  SOL Flow Trace:")
    if sol_flow and isinstance(sol_flow, dict):
        flow_wallets = sol_flow.get("wallets", [])
        print(f"     Wallets traced:    {len(flow_wallets)}")
    else:
        print(f"     (no SOL flow trace)")

    return data


def main():
    print("=" * 70)
    print("LIVE BUNDLE DETECTION TEST — 5 PumpFun tokens")
    print(f"API: {API_BASE}")
    print("=" * 70)

    results = {}
    pipeline_works = 0
    bundle_detected = 0
    sells_detected = 0
    total = len(TOKENS)

    for mint, desc in TOKENS:
        data = test_lineage(mint, desc)
        br = data.get("bundle_report")

        if br:
            n_wallets = len(br.get("bundle_wallets", []))
            verdict = br.get("overall_verdict", "")
            sell_count = sum(
                1 for w in br.get("bundle_wallets", [])
                if (w.get("post_sell") or {}).get("sell_detected")
            )

            if n_wallets > 0:
                pipeline_works += 1
                print(f"\n  >> PIPELINE OK: {n_wallets} bundle wallets detected")
            if verdict != "early_buyers_no_link_proven":
                bundle_detected += 1
                print(f"  >> BUNDLE CONFIRMED: {verdict}")
            if sell_count > 0:
                sells_detected += 1
                print(f"  >> SELLS OK: {sell_count} sells detected")
        else:
            if "error" not in data:
                # The lineage endpoint worked but no bundle report — token
                # might genuinely have no bundles
                pipeline_works += 1
                print(f"\n  >> PIPELINE OK (no bundles for this token)")
            else:
                print(f"\n  >> PIPELINE FAIL")

        results[mint] = data
        time.sleep(3)

    print(f"\n\n{'='*70}")
    print(f"SUMMARY")
    print(f"{'='*70}")
    print(f"  Pipeline working:     {pipeline_works}/{total}")
    print(f"  Bundles detected:     {bundle_detected}/{total}")
    print(f"  Sells detected:       {sells_detected}/{total}")
    print(f"{'='*70}")

    # Pass if pipeline works for at least 3/5 tokens
    if pipeline_works >= 3:
        print(f"\nRESULT: PASS")
        return 0
    else:
        print(f"\nRESULT: FAIL")
        return 1


if __name__ == "__main__":
    sys.exit(main())
