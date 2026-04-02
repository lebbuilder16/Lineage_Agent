"""Watchlist monitor service — periodic rescan with intelligence flag generation."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_SECONDS = 2700  # 45 minutes (was 2h — too slow to catch rapid crashes)

# ── Market pulse — lightweight price check between full forensic sweeps ────
PULSE_INTERVAL_SECONDS = 60    # 1 minute (was 10min — too slow to catch rapid crashes)
# Thresholds for triggering immediate full rescan from pulse
PULSE_DROP_VS_LAST_PCT = -25      # -25% since last snapshot → urgent rescan
PULSE_DROP_VS_REF_PCT = -40       # -40% since reference (first watch) → urgent rescan
PULSE_LIQ_DROP_VS_LAST_PCT = -35  # -35% liquidity drop → urgent rescan


# ── Flag generation — compare old snapshot vs new scan ────────────────────────

def _extract_forensic_snapshot(lin: Any) -> dict:
    """Extract key forensic values from a LineageResult for delta comparison."""
    snapshot: dict[str, Any] = {}

    sf = getattr(lin, "sol_flow", None)
    if sf:
        snapshot["sol_extracted"] = getattr(sf, "total_extracted_sol", 0) or 0
        snapshot["sol_hops"] = getattr(sf, "hop_count", 0) or 0

    br = getattr(lin, "bundle_report", None)
    if br:
        snapshot["bundle_verdict"] = getattr(br, "overall_verdict", None)
        snapshot["bundle_sol"] = getattr(br, "total_sol_extracted_confirmed", 0) or 0
        fw = getattr(br, "factory_sniper_wallets", None)
        snapshot["bundle_wallets"] = len(fw) if fw else 0

    ins = getattr(lin, "insider_sell", None)
    if ins:
        snapshot["insider_verdict"] = getattr(ins, "verdict", None)
        snapshot["deployer_exited"] = getattr(ins, "deployer_exited", False)
        snapshot["sell_pressure_24h"] = getattr(ins, "sell_pressure_24h", None)

    cr = getattr(lin, "cartel_report", None)
    if cr:
        dc = getattr(cr, "deployer_community", None)
        if dc:
            wallets = getattr(dc, "wallets", None)
            snapshot["cartel_wallets"] = len(wallets) if wallets else 0
            dc_comm = getattr(cr, "deployer_community", None) if cr else None
            if dc_comm:
                snapshot["cartel_narrative"] = getattr(dc_comm, "narrative", "") or ""
                snapshot["cartel_sol_extracted"] = getattr(dc_comm, "total_sol_extracted", 0) or 0
        else:
            snapshot["cartel_wallets"] = 0

    dc = getattr(lin, "death_clock", None)
    if dc:
        snapshot["risk_level"] = getattr(dc, "risk_level", "unknown")
        snapshot["rug_probability"] = getattr(dc, "rug_probability_pct", None)

    dp = getattr(lin, "deployer_profile", None)
    if dp:
        snapshot["rug_count"] = getattr(dp, "confirmed_rug_count", 0) or 0
        snapshot["rug_rate"] = getattr(dp, "rug_rate_pct", 0) or 0

    # Market metrics (from LineageResult — zero extra API calls)
    qt = getattr(lin, "query_token", None) or getattr(lin, "root", None)
    if qt:
        snapshot["price_usd"] = getattr(qt, "price_usd", None)
        snapshot["mcap_usd"] = getattr(qt, "market_cap_usd", None)
        snapshot["liq_usd"] = getattr(qt, "liquidity_usd", None)
    if ins:
        snapshot["sell_pressure_1h"] = getattr(ins, "sell_pressure_1h", None)
        snapshot["sell_pressure_24h_snap"] = getattr(ins, "sell_pressure_24h", None)
        snapshot["volume_spike_ratio"] = getattr(ins, "volume_spike_ratio", None)
        snapshot["price_change_h1"] = getattr(ins, "price_change_1h", None)
        snapshot["price_change_h24"] = getattr(ins, "price_change_24h", None)

    return snapshot


def _generate_flags(old: dict, new: dict, mint: str, *, ref: Optional[dict] = None) -> list[dict]:
    """Compare old and new forensic snapshots and return intelligence flags.

    *ref* is the reference snapshot taken when the token was first watched.
    When provided, cumulative deterioration flags are also generated.
    """
    from .flag_templates import render_flag

    flags: list[dict] = []

    def _flag(flag_type: str, severity: str, detail: Optional[dict] = None, **tmpl_kwargs):
        title = render_flag(flag_type, **tmpl_kwargs)
        flags.append({
            "flag_type": flag_type,
            "severity": severity,
            "title": title,
            "detail": json.dumps(detail or {}, default=str),
        })

    # SOL extraction
    old_sol = old.get("sol_extracted", 0) or 0
    new_sol = new.get("sol_extracted", 0) or 0
    if new_sol > 0 and old_sol == 0:
        _flag("SOL_EXTRACTION_NEW", "critical",
              {"old": old_sol, "new": new_sol, "hops": new.get("sol_hops")},
              new_sol=new_sol, hops=new.get("sol_hops", "?"))
    elif new_sol > old_sol + 5:
        delta = new_sol - old_sol
        _flag("SOL_EXTRACTION_INCREASED", "critical",
              {"old": old_sol, "new": new_sol, "delta": delta},
              delta=delta, old_sol=old_sol, new_sol=new_sol)

    # Deployer exit
    if new.get("deployer_exited") and not old.get("deployer_exited"):
        _flag("DEPLOYER_EXITED", "critical",
              {"insider_verdict": new.get("insider_verdict")})

    # Insider verdict change
    old_iv = old.get("insider_verdict")
    new_iv = new.get("insider_verdict")
    if new_iv == "insider_dump" and old_iv != "insider_dump":
        sp = new.get("sell_pressure_24h")
        sp_str = f" ({sp*100:.0f}% sell pressure)" if sp else ""
        _flag("INSIDER_DUMP_DETECTED", "critical",
              {"old_verdict": old_iv, "new_verdict": new_iv},
              sell_pressure=sp_str)

    # Bundle detection
    old_bv = old.get("bundle_verdict")
    new_bv = new.get("bundle_verdict")
    if new_bv and not old_bv:
        _flag("BUNDLE_DETECTED", "warning",
              {"verdict": new_bv, "sol": new.get("bundle_sol")})
    old_bw = old.get("bundle_wallets", 0) or 0
    new_bw = new.get("bundle_wallets", 0) or 0
    if new_bw > old_bw and new_bw >= 2:
        delta_bw = new_bw - old_bw
        _flag("BUNDLE_WALLETS_NEW", "warning",
              {"old": old_bw, "new": new_bw},
              delta=delta_bw, old=old_bw, new=new_bw)

    # Cartel detection
    old_cw = old.get("cartel_wallets", 0) or 0
    new_cw = new.get("cartel_wallets", 0) or 0
    cartel_narrative = new.get("cartel_narrative", "")
    cartel_sol = new.get("cartel_sol_extracted", 0)
    if new_cw > 0 and old_cw == 0:
        _flag("CARTEL_DETECTED", "warning",
              {"wallets": new_cw, "narrative": cartel_narrative, "sol_extracted": cartel_sol},
              wallets=new_cw)
    elif new_cw > old_cw + 1:
        delta_cw = new_cw - old_cw
        _flag("CARTEL_EXPANDED", "warning",
              {"old": old_cw, "new": new_cw, "delta": delta_cw},
              delta=delta_cw, old=old_cw, new=new_cw)

    # Risk escalation
    risk_order = ["unknown", "insufficient_data", "low", "medium", "high", "critical"]
    old_ri = risk_order.index(old.get("risk_level", "unknown")) if old.get("risk_level") in risk_order else 0
    new_ri = risk_order.index(new.get("risk_level", "unknown")) if new.get("risk_level") in risk_order else 0
    if new_ri > old_ri and new_ri >= 3:
        old_r = old.get("risk_level", "unknown")
        new_r = new.get("risk_level", "unknown")
        _flag("RISK_ESCALATION", "critical",
              {"old": old_r, "new": new_r},
              old=old_r, new=new_r)

    # New rug by deployer
    old_rc = old.get("rug_count", 0) or 0
    new_rc = new.get("rug_count", 0) or 0
    if new_rc > old_rc:
        delta_rc = new_rc - old_rc
        _flag("DEPLOYER_NEW_RUG", "critical",
              {"old": old_rc, "new": new_rc, "rug_rate": new.get("rug_rate")},
              delta=delta_rc, old=old_rc, new=new_rc)

    # Sell pressure spike
    old_sp = old.get("sell_pressure_24h") or 0
    new_sp = new.get("sell_pressure_24h") or 0
    if new_sp > 0.6 and old_sp < 0.5:
        _flag("SELL_PRESSURE_SPIKE", "warning",
              {"old": old_sp, "new": new_sp},
              old=old_sp * 100, new=new_sp * 100)

    # Bundle wallet exits
    new_bundle_exits = new.get("bundle_exits_new") or 0
    old_bundle_exits = old.get("bundle_exits_new") or 0
    if new_bundle_exits > old_bundle_exits:
        exit_wallets = new.get("bundle_exit_wallets") or []
        _flag("BUNDLE_WALLET_EXIT", "critical",
              {"new_exits": new_bundle_exits, "wallets": exit_wallets[:3],
               "still_holding": new.get("bundle_holders", 0)},
              exits=new_bundle_exits, holding=new.get("bundle_holders", 0))
    elif new_bundle_exits > 0 and new.get("bundle_holders", 0) == 0:
        _flag("BUNDLE_WALLETS_ALL_EXITED", "critical",
              {"total_exits": new_bundle_exits})

    # ── Cross-signal intelligence ─────────────────────────────────────
    deployer_exited = new.get("deployer_exited", False)
    bundle_wallets = new.get("bundle_wallets", 0) or 0
    bundle_holders = new.get("bundle_holders", 0)
    bundle_all_exited = (new.get("bundle_exits_new", 0) or 0) > 0 and bundle_holders == 0
    cartel_wallets = new.get("cartel_wallets", 0) or 0
    sol_extracted = new.get("sol_extracted", 0) or 0
    insider_dump = new.get("insider_verdict") == "insider_dump"
    rug_count = new.get("rug_count", 0) or 0
    price_pct = 0.0
    if ref and ref.get("price_usd") and new.get("price_usd") and ref["price_usd"] > 0:
        price_pct = ((new["price_usd"] - ref["price_usd"]) / ref["price_usd"]) * 100

    if deployer_exited and bundle_wallets > 0 and not bundle_all_exited:
        _flag("CROSS_DEPLOYER_EXIT_BUNDLE_ACTIVE", "critical",
              {"deployer_exited": True, "bundle_wallets_remaining": bundle_wallets},
              bundle=bundle_wallets)

    if deployer_exited and cartel_wallets > 0:
        _flag("CROSS_DEPLOYER_EXIT_CARTEL_ACTIVE", "critical",
              {"deployer_exited": True, "cartel_wallets": cartel_wallets},
              cartel=cartel_wallets)

    if deployer_exited and sol_extracted > 5 and price_pct < -40:
        _flag("CROSS_RUG_PATTERN", "critical",
              {"sol_extracted": sol_extracted, "price_drop_pct": round(price_pct, 1)},
              sol=sol_extracted, pct=price_pct)

    if bundle_all_exited and insider_dump:
        _flag("CROSS_COORDINATED_EXTRACTION", "critical",
              {"insider_dump": True, "bundle_all_exited": True})

    if cartel_wallets > 10 and rug_count > 1:
        _flag("CROSS_SERIAL_SCAM_RING", "critical",
              {"cartel_wallets": cartel_wallets, "rug_count": rug_count},
              cartel=cartel_wallets, rugs=rug_count)

    if sol_extracted > 10 and bundle_all_exited:
        _flag("CROSS_EXTRACTION_AND_EXIT", "critical",
              {"sol_extracted": sol_extracted, "bundle_all_exited": True},
              sol=sol_extracted)

    # ── Correlative intelligence: forensic × market cross-reference ──
    deltas = _compute_deltas(old, new)
    correlated = _cross_reference(deltas, old, new)
    for c in correlated:
        # _cross_reference returns pre-formatted flags with title+detail
        flags.append({
            "flag_type": c["type"],
            "severity": c["severity"],
            "title": c["title"],
            "detail": json.dumps(c["detail"], default=str) if isinstance(c["detail"], dict) else c["detail"],
        })

    # ── Cumulative deterioration (vs reference snapshot) ──────────────
    if ref:
        ref_price = ref.get("price_usd") or 0
        new_price = new.get("price_usd") or 0
        ref_liq = ref.get("liq_usd") or 0
        new_liq = new.get("liq_usd") or 0

        # Cumulative price crash since first watched
        if ref_price > 0 and new_price > 0:
            cum_pct = (new_price - ref_price) / ref_price * 100
            if cum_pct <= -50:
                _flag("CUMULATIVE_PRICE_CRASH", "critical",
                      {"ref_price": ref_price, "now_price": new_price, "pct": round(cum_pct, 1)},
                      pct=cum_pct, ref=ref_price, now=new_price)
            elif cum_pct <= -30:
                _flag("CUMULATIVE_PRICE_DECLINE", "warning",
                      {"ref_price": ref_price, "now_price": new_price, "pct": round(cum_pct, 1)},
                      pct=cum_pct)

        # Cumulative liquidity drain
        if ref_liq > 0 and new_liq > 0:
            liq_pct = (new_liq - ref_liq) / ref_liq * 100
            if liq_pct <= -50:
                _flag("CUMULATIVE_LIQ_DRAIN", "critical",
                      {"ref_liq": ref_liq, "now_liq": new_liq, "pct": round(liq_pct, 1)},
                      pct=liq_pct)

        # Forensic deterioration since reference
        ref_sol = ref.get("sol_extracted") or 0
        new_sol_total = new.get("sol_extracted") or 0
        if new_sol_total > ref_sol + 20:
            delta_sol = new_sol_total - ref_sol
            _flag("CUMULATIVE_SOL_EXTRACTION", "critical",
                  {"ref_sol": ref_sol, "now_sol": new_sol_total},
                  delta=delta_sol, ref=ref_sol, now=new_sol_total)

        # Deployer exited since reference (catches gradual exit)
        if new.get("deployer_exited") and not ref.get("deployer_exited"):
            if not any(f["flag_type"] == "DEPLOYER_EXITED" for f in flags):
                _flag("DEPLOYER_EXITED", "critical",
                      {"ref_deployed": True})

    return flags


def _compute_deltas(old: dict, new: dict) -> dict:
    """Compute independent forensic + market deltas between two snapshots."""
    d: dict = {}
    # Forensic deltas
    d["sol_delta"] = (new.get("sol_extracted") or 0) - (old.get("sol_extracted") or 0)
    d["bundle_wallets_delta"] = (new.get("bundle_wallets") or 0) - (old.get("bundle_wallets") or 0)
    d["cartel_wallets_delta"] = (new.get("cartel_wallets") or 0) - (old.get("cartel_wallets") or 0)
    d["rug_count_delta"] = (new.get("rug_count") or 0) - (old.get("rug_count") or 0)
    d["deployer_just_exited"] = (not old.get("deployer_exited")) and bool(new.get("deployer_exited"))
    d["bundle_exits_new"] = (new.get("bundle_exits_new") or 0) - (old.get("bundle_exits_new") or 0)
    d["insider_escalated"] = (
        old.get("insider_verdict") != "insider_dump"
        and new.get("insider_verdict") == "insider_dump"
    )

    # Market deltas (% between scans)
    for key in ["price_usd", "mcap_usd", "liq_usd"]:
        ov, nv = old.get(key), new.get(key)
        d[f"{key}_pct"] = round((nv - ov) / ov * 100, 1) if ov and nv and ov > 0 else None

    d["sell_pressure_shift"] = (new.get("sell_pressure_1h") or 0) - (old.get("sell_pressure_1h") or 0)
    d["volume_spiking"] = (new.get("volume_spike_ratio") or 0) >= 5
    return d


def _cross_reference(deltas: dict, old: dict, new: dict) -> list[dict]:
    """Cross-reference forensic and market layers. Observational, not causal."""
    results: list[dict] = []

    forensic_changed = (
        deltas["sol_delta"] > 0
        or deltas["bundle_wallets_delta"] > 0
        or deltas["cartel_wallets_delta"] > 0
        or deltas["deployer_just_exited"]
        or deltas["insider_escalated"]
        or deltas.get("bundle_exits_new", 0) > 0
    )
    market_stressed = (
        (deltas.get("price_usd_pct") or 0) <= -20
        or (deltas.get("liq_usd_pct") or 0) <= -20
        or (deltas.get("mcap_usd_pct") or 0) <= -30
    )

    if not forensic_changed and not market_stressed:
        return results

    # Build factual observations per layer
    forensic_facts = []
    if deltas["sol_delta"] > 0:
        forensic_facts.append(f"+{deltas['sol_delta']:.1f} SOL extracted")
    if deltas["deployer_just_exited"]:
        forensic_facts.append("deployer exited")
    if deltas["insider_escalated"]:
        forensic_facts.append("insider dump detected")
    if deltas["bundle_wallets_delta"] > 0:
        forensic_facts.append(f"+{deltas['bundle_wallets_delta']} bundle wallets")
    if deltas["cartel_wallets_delta"] > 0:
        forensic_facts.append(f"+{deltas['cartel_wallets_delta']} cartel wallets")
    if deltas["rug_count_delta"] > 0:
        forensic_facts.append(f"+{deltas['rug_count_delta']} new rug(s)")
    if deltas.get("bundle_exits_new", 0) > 0:
        forensic_facts.append(f"{deltas['bundle_exits_new']} bundle wallet(s) sold")

    market_facts = []
    price_pct = deltas.get("price_usd_pct")
    if price_pct is not None and abs(price_pct) >= 10:
        market_facts.append(f"price {price_pct:+.0f}%")
    mcap_pct = deltas.get("mcap_usd_pct")
    if mcap_pct is not None and mcap_pct <= -15:
        market_facts.append(f"mcap {mcap_pct:+.0f}%")
    liq_pct = deltas.get("liq_usd_pct")
    if liq_pct is not None and liq_pct <= -15:
        market_facts.append(f"liq {liq_pct:+.0f}%")
    if deltas["sell_pressure_shift"] > 0.15:
        sp_now = (new.get("sell_pressure_1h") or 0) * 100
        market_facts.append(f"sell pressure {sp_now:.0f}%")
    if deltas["volume_spiking"]:
        market_facts.append(f"volume {new.get('volume_spike_ratio', 0):.0f}x normal")

    detail = {
        "forensic_changes": forensic_facts or ["none"],
        "market_changes": market_facts or ["stable"],
        "deltas": {k: v for k, v in deltas.items() if v is not None and v != 0 and v is not False},
    }

    if forensic_changed and market_stressed:
        title = " · ".join(market_facts) + " | " + ", ".join(forensic_facts) if market_facts else ", ".join(forensic_facts)
        results.append({"type": "CORRELATED_FORENSIC_MARKET", "severity": "critical", "title": title, "detail": detail})
    elif forensic_changed:
        results.append({"type": "FORENSIC_ACTIVITY", "severity": "warning",
                        "title": ", ".join(forensic_facts) + (" · market: " + " · ".join(market_facts) if market_facts else " · market stable"),
                        "detail": detail})
    elif market_stressed:
        results.append({"type": "MARKET_STRESS", "severity": "warning",
                        "title": " · ".join(market_facts) + " · no new forensic trigger",
                        "detail": detail})

    # Extraction paused + recovery
    if (deltas["sol_delta"] == 0 and (old.get("sol_extracted") or 0) > 0
            and (deltas.get("price_usd_pct") or 0) > 10):
        results.append({"type": "EXTRACTION_PAUSED", "severity": "info",
                        "title": f"No new extraction · price {deltas['price_usd_pct']:+.0f}%",
                        "detail": detail})

    return results


# ── Bundle wallet activity tracking ──────────────────────────────────────────

async def _check_bundle_wallet_balances(mint: str, lin: Any) -> dict | None:
    """Check if known bundle wallets still hold tokens (1 RPC call per wallet).

    Returns {total, still_holding, new_exits, exit_wallets} or None if no bundle.
    """
    br = getattr(lin, "bundle_report", None)
    if not br:
        # Try cached report
        try:
            from .bundle_tracker_service import get_cached_bundle_report
            br = await get_cached_bundle_report(mint)
        except Exception:
            pass
    if not br:
        return None

    # Collect all bundle wallets worth tracking
    wallets_to_check: list[tuple[str, bool]] = []  # (address, was_sold_initially)
    bundle_wallets = getattr(br, "bundle_wallets", None) or []
    for bw in bundle_wallets:
        addr = getattr(bw, "wallet", None) or (bw.get("wallet") if isinstance(bw, dict) else None)
        if not addr:
            continue
        post = getattr(bw, "post_sell", None) or (bw.get("post_sell") if isinstance(bw, dict) else None)
        was_sold = False
        if post:
            was_sold = getattr(post, "sell_detected", False) if hasattr(post, "sell_detected") else post.get("sell_detected", False)
        wallets_to_check.append((addr, was_sold))

    if not wallets_to_check:
        return None

    # Check current balances — try DAS batch first, fallback to individual RPC
    from .data_sources._clients import get_rpc_client
    rpc = get_rpc_client()

    results: list[tuple[str, float]] = []

    # Try Helius DAS get_assets_by_owner for each wallet (pre-parsed, includes all tokens)
    sem = asyncio.Semaphore(8)

    async def _check_das(wallet: str) -> tuple[str, float]:
        """Check balance via DAS (returns all tokens, we filter by mint)."""
        async with sem:
            try:
                assets = await asyncio.wait_for(
                    rpc.get_assets_by_owner(wallet, limit=50),
                    timeout=5.0,
                )
                for asset in assets:
                    asset_id = asset.get("id", "")
                    if asset_id == mint:
                        # Found the token — check balance
                        token_info = asset.get("token_info", {})
                        balance = token_info.get("balance", 0)
                        decimals = token_info.get("decimals", 0)
                        if balance > 0 and decimals > 0:
                            return (wallet, balance / (10 ** decimals))
                        return (wallet, float(balance))
                return (wallet, 0.0)  # token not found = sold
            except Exception:
                # Fallback to individual RPC call
                try:
                    bal = await asyncio.wait_for(
                        rpc.get_wallet_token_balance(wallet, mint),
                        timeout=5.0,
                    )
                    return (wallet, bal)
                except Exception:
                    return (wallet, -1.0)

    results = await asyncio.gather(*[_check_das(w) for w, _ in wallets_to_check])

    still_holding = 0
    new_exits: list[str] = []
    for (wallet, was_sold), (_, balance) in zip(wallets_to_check, results):
        if balance < 0:
            continue  # RPC failed, skip
        if balance > 0:
            still_holding += 1
        elif not was_sold and balance == 0:
            new_exits.append(wallet)

    return {
        "total": len(wallets_to_check),
        "still_holding": still_holding,
        "new_exits": len(new_exits),
        "exit_wallets": new_exits[:5],  # cap for display
    }


# ── Main rescan function ─────────────────────────────────────────────────────

async def run_single_rescan(watch_id: int, user_id: int, cache) -> dict | None:
    """Rescan a single watch, generate flags, return result.

    Returns {mint, old_risk, new_risk, escalated, flags_count} or None on failure.
    """
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "SELECT value FROM user_watches WHERE id = ?", (watch_id,)
        )
        row = await cursor.fetchone()
        if not row:
            return None

        mint = row[0]

        # Skip native SOL and other non-token addresses that can't be analyzed
        _SKIP_MINTS = {
            "So11111111111111111111111111111111111111112",   # Wrapped SOL
            "11111111111111111111111111111111",               # System Program
        }
        if mint in _SKIP_MINTS:
            logger.debug("run_single_rescan skipping non-token mint %s (watch %d)", mint[:12], watch_id)
            return None

        # Get reference snapshot (first-ever snapshot for this watch)
        cursor = await db.execute(
            "SELECT detail FROM sweep_flags WHERE watch_id = ? AND flag_type = '_REFERENCE' "
            "ORDER BY created_at ASC LIMIT 1",
            (watch_id,),
        )
        ref_row = await cursor.fetchone()
        ref_forensic = json.loads(ref_row[0]) if ref_row else None

        # Get previous forensic snapshot
        cursor = await db.execute(
            "SELECT detail FROM sweep_flags WHERE watch_id = ? AND flag_type = '_SNAPSHOT' "
            "ORDER BY created_at DESC LIMIT 1",
            (watch_id,),
        )
        prev_snap_row = await cursor.fetchone()
        old_forensic = json.loads(prev_snap_row[0]) if prev_snap_row else {}

        # Get previous risk snapshot (from watch_snapshots table)
        cursor = await db.execute(
            "SELECT risk_level, risk_score FROM watch_snapshots WHERE watch_id = ? ORDER BY scanned_at DESC LIMIT 1",
            (watch_id,)
        )
        prev = await cursor.fetchone()
        old_risk = prev[0] if prev else "unknown"
        old_score = prev[1] if prev else 0

        # Rescan — use cached lineage data (TTL 10min) to avoid RPC timeouts.
        # The sweep's real value comes from _generate_flags (delta detection)
        # and _check_bundle_wallet_balances (live balance check), not from
        # re-running the full pipeline every 45 min.  force_refresh=True is
        # only needed on user-initiated manual rescans.
        from .lineage_detector import detect_lineage
        lin = await asyncio.wait_for(
            detect_lineage(mint, force_refresh=False), timeout=90.0
        )

        # Extract new forensic snapshot
        new_forensic = _extract_forensic_snapshot(lin)

        # Compute heuristic score (the real risk indicator) — not death_clock's
        # rug_probability_pct which is often 0 for tokens with insufficient data.
        from .ai_analyst import _heuristic_score
        br = getattr(lin, "bundle_report", None)
        sf = getattr(lin, "sol_flow", None)
        new_score = _heuristic_score(lin, br, sf)

        # Risk level from heuristic score (consistent with investigation)
        if new_score >= 75:
            new_risk = "critical"
        elif new_score >= 50:
            new_risk = "high"
        elif new_score >= 25:
            new_risk = "medium"
        else:
            new_risk = "low"

        # Inject into snapshot so _generate_flags can detect risk_level changes
        new_forensic["risk_level"] = new_risk
        new_forensic["heuristic_score"] = new_score

        # Store risk snapshot
        for _attempt in range(3):
            try:
                await db.execute(
                    "INSERT INTO watch_snapshots (watch_id, mint, risk_level, risk_score, scanned_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (watch_id, mint, new_risk, new_score, time.time())
                )
                await db.commit()
                break
            except Exception as e:
                if "locked" in str(e).lower() and _attempt < 2:
                    await asyncio.sleep(1)
                    continue
                logger.warning("[sweep] snapshot write failed: %s", e)

        # ── Bundle wallet activity check ─────────────────────────────
        # Check if known bundle wallets still hold the token (cheap: 1 RPC/wallet)
        bundle_activity = await _check_bundle_wallet_balances(mint, lin)
        if bundle_activity:
            new_forensic["bundle_holders"] = bundle_activity["still_holding"]
            new_forensic["bundle_exits_new"] = bundle_activity["new_exits"]
            new_forensic["bundle_exit_wallets"] = bundle_activity["exit_wallets"]

        # Generate intelligence flags (with reference for cumulative detection)
        flags = _generate_flags(old_forensic, new_forensic, mint, ref=ref_forensic)
        now = time.time()

        # Enrich flag details with token name/symbol for mobile display
        qt = getattr(lin, "query_token", None) or getattr(lin, "root", None)
        _token_name = getattr(qt, "name", "") or ""
        _token_symbol = getattr(qt, "symbol", "") or ""
        for flag in flags:
            try:
                raw = flag["detail"]
                detail_dict = json.loads(raw) if isinstance(raw, str) else (raw if isinstance(raw, dict) else {})
                if not isinstance(detail_dict, dict):
                    detail_dict = {"raw": detail_dict}
            except Exception:
                detail_dict = {}
            detail_dict["token_name"] = _token_name
            detail_dict["symbol"] = _token_symbol
            detail_dict["risk_score"] = new_score
            _image = getattr(qt, "image_uri", None) or getattr(qt, "icon", None) or ""
            if _image:
                detail_dict["image_uri"] = _image
            flag["detail"] = json.dumps(detail_dict, default=str)

        # Store flags + new forensic snapshot
        for _attempt in range(3):
            try:
                for flag in flags:
                    await db.execute(
                        "INSERT INTO sweep_flags "
                        "(watch_id, mint, user_id, flag_type, severity, title, detail, created_at) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (watch_id, mint, user_id, flag["flag_type"], flag["severity"],
                         flag["title"], flag["detail"], now),
                    )
                # Store forensic snapshot for next comparison (flag_type = '_SNAPSHOT')
                await db.execute(
                    "INSERT INTO sweep_flags "
                    "(watch_id, mint, user_id, flag_type, severity, title, detail, created_at, read) "
                    "VALUES (?, ?, ?, '_SNAPSHOT', 'info', 'snapshot', ?, ?, 1)",
                    (watch_id, mint, user_id, json.dumps(new_forensic, default=str), now),
                )
                # Store reference snapshot on first-ever scan (immutable baseline)
                if ref_forensic is None:
                    await db.execute(
                        "INSERT INTO sweep_flags "
                        "(watch_id, mint, user_id, flag_type, severity, title, detail, created_at, read) "
                        "VALUES (?, ?, ?, '_REFERENCE', 'info', 'reference', ?, ?, 1)",
                        (watch_id, mint, user_id, json.dumps(new_forensic, default=str), now),
                    )
                    logger.info("[sweep] stored reference snapshot for %s", mint[:12])
                await db.commit()
                break
            except Exception as e:
                if "locked" in str(e).lower() and _attempt < 2:
                    await asyncio.sleep(1)
                    continue
                logger.warning("[sweep] flags write failed: %s", e)

        if flags:
            logger.info("[sweep] %d flag(s) for %s: %s",
                        len(flags), mint[:12],
                        ", ".join(f["flag_type"] for f in flags))

            # ── Push notification to user for critical/warning flags ─────
            try:
                from .alert_service import _push_fcm_to_watchers
                critical_flags = [f for f in flags if f["severity"] in ("critical", "warning")]
                if critical_flags:
                    top = critical_flags[0]
                    _token_name = detail_dict.get("token_name") or detail_dict.get("name") or mint[:12]
                    asyncio.create_task(
                        _push_fcm_to_watchers(
                            mint=mint,
                            title=top["title"],
                            body=f"{_token_name} — {top['flag_type'].replace('_', ' ')}",
                            alert_type="sweep_flag",
                        ),
                        name=f"sweep_push_{mint[:8]}",
                    )
            except Exception:
                pass  # best-effort, never block sweep

        # Record memory episode from sweep (enriches agent memory passively)
        try:
            from .memory_service import record_episode
            from .ai_analyst import _heuristic_score

            scan_dict = lin.model_dump(mode="json") if hasattr(lin, "model_dump") else {}
            hscore = 0
            try:
                hscore = _heuristic_score(
                    scan_dict,
                    scan_dict.get("bundle_report"),
                    scan_dict.get("sol_flow"),
                )
            except Exception:
                pass

            pattern = "minimal_risk"
            if hscore >= 75:
                pattern = "high_risk_signals"
            elif hscore >= 50:
                pattern = "moderate_risk_signals"
            elif hscore >= 25:
                pattern = "low_risk_signals"

            root = scan_dict.get("root") or scan_dict.get("query_token") or {}
            _deployer = root.get("deployer", "")
            op = scan_dict.get("operator_fingerprint") or {}
            _operator_fp = op.get("fingerprint", "") if isinstance(op, dict) else ""
            cr = scan_dict.get("cartel_report") or {}
            dc_comm = cr.get("deployer_community") or {}
            _community_id = dc_comm.get("community_id", "") if isinstance(dc_comm, dict) else ""

            sweep_confidence = "high" if hscore >= 75 else "medium" if hscore >= 50 else "low"
            await record_episode(
                mint=mint,
                verdict={
                    "risk_score": hscore,
                    "confidence": sweep_confidence,
                    "rug_pattern": pattern,
                    "verdict_summary": f"Sweep rescan: {hscore}/100 ({pattern})",
                    "conviction_chain": "",
                    "key_findings": [f["title"] for f in flags] if flags else [],
                    "model": "heuristic_sweep",
                },
                scan_data=scan_dict,
                deployer=_deployer or None,
                operator_fp=_operator_fp or None,
                community_id=_community_id or None,
            )
        except Exception as _mem_exc:
            logger.debug("[sweep] episode record failed for %s: %s", mint[:12], _mem_exc)

        # Check for escalation
        risk_levels = ["unknown", "insufficient_data", "low", "medium", "high", "critical"]
        old_idx = risk_levels.index(old_risk) if old_risk in risk_levels else 0
        new_idx = risk_levels.index(new_risk) if new_risk in risk_levels else 0
        escalated = new_idx > old_idx and new_idx >= 3

        return {
            "mint": mint,
            "watch_id": watch_id,
            "old_risk": old_risk,
            "new_risk": new_risk,
            "old_score": old_score,
            "new_score": new_score,
            "escalated": escalated,
            "flags": flags,
            "flags_count": len(flags),
        }
    except Exception as exc:
        logger.warning(
            "run_single_rescan failed for watch %d: [%s] %s",
            watch_id, type(exc).__name__, exc, exc_info=True,
        )
        return None


# ── Market Pulse — lightweight price check between full sweeps ─────────────

# Semaphore: only 1 pulse rescan at a time to avoid starving user investigations
_PULSE_RESCAN_SEM = asyncio.Semaphore(1)


async def _pulse_rescan_one(t: dict, cache) -> None:
    """Run a single pulse-triggered rescan in the background, rate-limited."""
    async with _PULSE_RESCAN_SEM:
        try:
            result = await run_single_rescan(t["watch_id"], t["user_id"], cache)
            if not result:
                return
            logger.info(
                "[pulse] rescan complete for %s: %d flags, risk %s->%s",
                t["mint"][:12], result.get("flags_count", 0),
                result.get("old_risk"), result.get("new_risk"),
            )
            # Push FCM for pulse-triggered flags
            if result.get("flags"):
                try:
                    from .alert_service import _push_fcm_to_watchers
                    top_flag = result["flags"][0]
                    asyncio.create_task(
                        _push_fcm_to_watchers(
                            mint=t["mint"],
                            title=top_flag["title"],
                            body=f"Pulse: {t['trigger']}",
                            alert_type="pulse_flag",
                        ),
                        name=f"pulse_push_{t['mint'][:8]}",
                    )
                except Exception:
                    pass
            elif abs(t.get("now_price", 0)) > 0:
                try:
                    from .alert_service import _push_fcm_to_watchers
                    asyncio.create_task(
                        _push_fcm_to_watchers(
                            mint=t["mint"],
                            title=f"Pulse: {t['trigger']}",
                            body=f"Price: ${t['now_price']:.6f}",
                            alert_type="pulse_alert",
                        ),
                        name=f"pulse_alert_{t['mint'][:8]}",
                    )
                except Exception:
                    pass
        except Exception as exc:
            logger.warning("[pulse] rescan failed for %s: %s", t["mint"][:12], exc)


async def run_market_pulse(cache) -> list[dict]:
    """Fast price check for all watched tokens.

    Uses batched DexScreener calls (comma-separated mints, max 30 per call)
    to minimize API usage. Compares against reference + last snapshot.
    """
    from .data_sources._clients import get_dex_client

    try:
        db = await cache._get_conn()

        cursor = await db.execute(
            "SELECT uw.id, uw.user_id, uw.value AS mint "
            "FROM user_watches uw WHERE uw.sub_type = 'mint'"
        )
        watches = await cursor.fetchall()
        if not watches:
            return []

        triggered: list[dict] = []
        dex = get_dex_client()

        # Build mint→watch lookup
        mint_map: dict[str, list[tuple[int, int]]] = {}  # mint → [(watch_id, user_id)]
        for watch_id, user_id, mint in watches:
            mint_map.setdefault(mint, []).append((watch_id, user_id))

        all_mints = list(mint_map.keys())

        # Batch DexScreener calls (comma-separated, max 30 per call)
        price_data: dict[str, tuple[float, float]] = {}  # mint → (price, liq)
        _BATCH_SIZE = 30
        for i in range(0, len(all_mints), _BATCH_SIZE):
            batch = all_mints[i:i + _BATCH_SIZE]
            mints_csv = ",".join(batch)
            try:
                pairs = await asyncio.wait_for(
                    dex.get_token_pairs(mints_csv), timeout=15.0,
                )
                if pairs:
                    # Parse pairs per mint
                    for mint in batch:
                        mint_pairs = [p for p in pairs if (p.get("baseToken", {}).get("address", "").lower() == mint.lower()
                                      or p.get("quoteToken", {}).get("address", "").lower() == mint.lower())]
                        if mint_pairs:
                            meta = dex.pairs_to_metadata(mint, mint_pairs)
                            if meta.price_usd and meta.price_usd > 0:
                                price_data[mint] = (meta.price_usd, meta.liquidity_usd or 0)
            except asyncio.TimeoutError:
                logger.debug("[pulse] batch timeout for %d mints", len(batch))
            except Exception as exc:
                logger.debug("[pulse] batch error: %s", exc)

        # Compare prices against snapshots
        for mint, watchers in mint_map.items():
            pd = price_data.get(mint)
            if not pd:
                continue
            now_price, now_liq = pd

            watch_id, user_id = watchers[0]  # use first watcher for snapshot lookup

            # Load last snapshot
            c2 = await db.execute(
                "SELECT detail FROM sweep_flags WHERE watch_id = ? AND flag_type = '_SNAPSHOT' "
                "ORDER BY created_at DESC LIMIT 1", (watch_id,),
            )
            snap_row = await c2.fetchone()
            last_snap = json.loads(snap_row[0]) if snap_row else {}

            # Load reference
            c3 = await db.execute(
                "SELECT detail FROM sweep_flags WHERE watch_id = ? AND flag_type = '_REFERENCE' "
                "ORDER BY created_at ASC LIMIT 1", (watch_id,),
            )
            ref_row = await c3.fetchone()
            ref_snap = json.loads(ref_row[0]) if ref_row else {}

            trigger_reason = None

            last_price = last_snap.get("price_usd") or 0
            if last_price > 0:
                delta_pct = (now_price - last_price) / last_price * 100
                if delta_pct <= PULSE_DROP_VS_LAST_PCT:
                    trigger_reason = f"price {delta_pct:+.0f}% vs last scan"

            last_liq = last_snap.get("liq_usd") or 0
            if not trigger_reason and last_liq > 0 and now_liq > 0:
                liq_pct = (now_liq - last_liq) / last_liq * 100
                if liq_pct <= PULSE_LIQ_DROP_VS_LAST_PCT:
                    trigger_reason = f"liquidity {liq_pct:+.0f}% vs last scan"

            ref_price = ref_snap.get("price_usd") or 0
            if not trigger_reason and ref_price > 0:
                ref_pct = (now_price - ref_price) / ref_price * 100
                if ref_pct <= PULSE_DROP_VS_REF_PCT:
                    trigger_reason = f"price {ref_pct:+.0f}% since first watched"

            if trigger_reason:
                logger.warning("[pulse] %s triggered: %s (now=$%.6f)", mint[:12], trigger_reason, now_price)
                for wid, uid in watchers:
                    triggered.append({
                        "mint": mint, "watch_id": wid, "user_id": uid,
                        "trigger": trigger_reason, "now_price": now_price, "now_liq": now_liq,
                    })
            else:
                logger.debug("[pulse] %s OK ($%.6f)", mint[:12], now_price)

        # Trigger rescans (deduplicated by mint)
        seen_rescans: set[str] = set()
        for t in triggered:
            if t["mint"] not in seen_rescans:
                seen_rescans.add(t["mint"])
                asyncio.create_task(
                    _pulse_rescan_one(t, cache),
                    name=f"pulse_rescan_{t['mint'][:8]}",
                )

        if triggered:
            logger.info("[pulse] %d/%d watches triggered (%d API calls)",
                        len(triggered), len(watches), (len(all_mints) + _BATCH_SIZE - 1) // _BATCH_SIZE)
        else:
            logger.debug("[pulse] all %d watches stable (1 batch call)", len(watches))

        return triggered

    except Exception as exc:
        logger.warning("[pulse] market pulse failed: %s", exc)
        return []
