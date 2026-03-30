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
PULSE_INTERVAL_SECONDS = 600   # 10 minutes
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
    flags: list[dict] = []

    def _flag(flag_type: str, severity: str, title: str, detail: Optional[dict] = None):
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
              f"{new_sol:.1f} SOL extracted via {new.get('sol_hops', '?')}-hop chain",
              {"old": old_sol, "new": new_sol, "hops": new.get("sol_hops")})
    elif new_sol > old_sol + 5:  # >5 SOL increase
        delta = new_sol - old_sol
        _flag("SOL_EXTRACTION_INCREASED", "critical",
              f"+{delta:.1f} SOL extracted (total {new_sol:.1f} SOL)",
              {"old": old_sol, "new": new_sol, "delta": delta})

    # Deployer exit
    if new.get("deployer_exited") and not old.get("deployer_exited"):
        _flag("DEPLOYER_EXITED", "critical",
              "Deployer exited — sold entire position",
              {"insider_verdict": new.get("insider_verdict")})

    # Insider verdict change
    old_iv = old.get("insider_verdict")
    new_iv = new.get("insider_verdict")
    if new_iv == "insider_dump" and old_iv != "insider_dump":
        sp = new.get("sell_pressure_24h")
        sp_str = f" · {sp*100:.0f}% sell pressure" if sp else ""
        _flag("INSIDER_DUMP_DETECTED", "critical",
              f"Insider dump detected{sp_str}",
              {"old_verdict": old_iv, "new_verdict": new_iv})

    # Bundle detection
    old_bv = old.get("bundle_verdict")
    new_bv = new.get("bundle_verdict")
    if new_bv and not old_bv:
        _flag("BUNDLE_DETECTED", "warning",
              f"Bundle activity: {(new_bv or '').replace('_', ' ')}",
              {"verdict": new_bv, "sol": new.get("bundle_sol")})
    old_bw = old.get("bundle_wallets", 0) or 0
    new_bw = new.get("bundle_wallets", 0) or 0
    if new_bw > old_bw and new_bw >= 2:
        _flag("BUNDLE_WALLETS_NEW", "warning",
              f"{new_bw - old_bw} new bundle wallet(s) detected (total {new_bw})",
              {"old": old_bw, "new": new_bw})

    # Cartel detection
    old_cw = old.get("cartel_wallets", 0) or 0
    new_cw = new.get("cartel_wallets", 0) or 0
    if new_cw > 0 and old_cw == 0:
        _flag("CARTEL_DETECTED", "warning",
              f"Deployer linked to {new_cw}-wallet cartel network",
              {"wallets": new_cw})
    elif new_cw > old_cw + 1:
        _flag("CARTEL_EXPANDED", "warning",
              f"Cartel grew: {old_cw} → {new_cw} wallets",
              {"old": old_cw, "new": new_cw})

    # Risk escalation
    risk_order = ["unknown", "insufficient_data", "low", "medium", "high", "critical"]
    old_ri = risk_order.index(old.get("risk_level", "unknown")) if old.get("risk_level") in risk_order else 0
    new_ri = risk_order.index(new.get("risk_level", "unknown")) if new.get("risk_level") in risk_order else 0
    if new_ri > old_ri and new_ri >= 3:
        _flag("RISK_ESCALATION", "critical",
              f"Risk level: {old.get('risk_level', 'unknown')} → {new.get('risk_level', 'unknown')}",
              {"old": old.get("risk_level"), "new": new.get("risk_level")})

    # New rug by deployer
    old_rc = old.get("rug_count", 0) or 0
    new_rc = new.get("rug_count", 0) or 0
    if new_rc > old_rc:
        _flag("DEPLOYER_NEW_RUG", "critical",
              f"Deployer confirmed {new_rc - old_rc} new rug(s) (total {new_rc})",
              {"old": old_rc, "new": new_rc, "rug_rate": new.get("rug_rate")})

    # Sell pressure spike
    old_sp = old.get("sell_pressure_24h") or 0
    new_sp = new.get("sell_pressure_24h") or 0
    if new_sp > 0.6 and old_sp < 0.5:
        _flag("SELL_PRESSURE_SPIKE", "warning",
              f"Sell pressure spiked: {old_sp*100:.0f}% → {new_sp*100:.0f}%",
              {"old": old_sp, "new": new_sp})

    # Bundle wallet exits (detected by balance check)
    new_bundle_exits = new.get("bundle_exits_new") or 0
    old_bundle_exits = old.get("bundle_exits_new") or 0
    if new_bundle_exits > old_bundle_exits:
        exit_wallets = new.get("bundle_exit_wallets") or []
        _flag("BUNDLE_WALLET_EXIT", "critical",
              f"{new_bundle_exits} bundle wallet(s) sold since last scan",
              {"new_exits": new_bundle_exits, "wallets": exit_wallets[:3],
               "still_holding": new.get("bundle_holders", 0)})
    elif new_bundle_exits > 0 and new.get("bundle_holders", 0) == 0:
        _flag("BUNDLE_WALLETS_ALL_EXITED", "critical",
              "All bundle wallets have exited — full team extraction",
              {"total_exits": new_bundle_exits})

    # ── Correlative intelligence: forensic × market cross-reference ──
    deltas = _compute_deltas(old, new)
    correlated = _cross_reference(deltas, old, new)
    for c in correlated:
        _flag(c["type"], c["severity"], c["title"], c["detail"])

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
                      f"Price {cum_pct:+.0f}% since first watched",
                      {"ref_price": ref_price, "now_price": new_price,
                       "pct": round(cum_pct, 1)})
            elif cum_pct <= -30:
                _flag("CUMULATIVE_PRICE_DECLINE", "warning",
                      f"Price {cum_pct:+.0f}% since first watched",
                      {"ref_price": ref_price, "now_price": new_price,
                       "pct": round(cum_pct, 1)})

        # Cumulative liquidity drain
        if ref_liq > 0 and new_liq > 0:
            liq_pct = (new_liq - ref_liq) / ref_liq * 100
            if liq_pct <= -50:
                _flag("CUMULATIVE_LIQ_DRAIN", "critical",
                      f"Liquidity {liq_pct:+.0f}% since first watched",
                      {"ref_liq": ref_liq, "now_liq": new_liq,
                       "pct": round(liq_pct, 1)})

        # Forensic deterioration since reference
        ref_sol = ref.get("sol_extracted") or 0
        new_sol_total = new.get("sol_extracted") or 0
        if new_sol_total > ref_sol + 20:
            _flag("CUMULATIVE_SOL_EXTRACTION", "critical",
                  f"{new_sol_total - ref_sol:.0f} SOL extracted since first watched",
                  {"ref_sol": ref_sol, "now_sol": new_sol_total})

        # Deployer exited since reference (catches gradual exit)
        if new.get("deployer_exited") and not ref.get("deployer_exited"):
            # Only flag if delta check didn't already catch it
            if not any(f["flag_type"] == "DEPLOYER_EXITED" for f in flags):
                _flag("DEPLOYER_EXITED", "critical",
                      "Deployer exited position since first watched",
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

    detail = json.dumps({
        "forensic_changes": forensic_facts or ["none"],
        "market_changes": market_facts or ["stable"],
        "deltas": {k: v for k, v in deltas.items() if v is not None and v != 0 and v is not False},
    })

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

    # Check current balances in parallel (max 8 concurrent)
    from .data_sources._clients import get_rpc_client
    rpc = get_rpc_client()
    sem = asyncio.Semaphore(8)

    async def _check(wallet: str) -> tuple[str, float]:
        async with sem:
            try:
                bal = await asyncio.wait_for(
                    rpc.get_wallet_token_balance(wallet, mint),
                    timeout=5.0,
                )
                return (wallet, bal)
            except Exception:
                return (wallet, -1.0)  # unknown

    results = await asyncio.gather(*[_check(w) for w, _ in wallets_to_check])

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

        # Rescan — force_refresh=True so deployer profiles / bundle data
        # are fetched fresh instead of using stale 24-hour caches.
        from .lineage_detector import detect_lineage
        lin = await asyncio.wait_for(
            detect_lineage(mint, force_refresh=True), timeout=60.0
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
                detail_dict = json.loads(flag["detail"]) if isinstance(flag["detail"], str) else {}
            except Exception:
                detail_dict = {}
            detail_dict["token_name"] = _token_name
            detail_dict["symbol"] = _token_symbol
            detail_dict["risk_score"] = new_score
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
        logger.warning("run_single_rescan failed for watch %d: %s", watch_id, exc)
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
    """Fast price check for all watched tokens (runs every ~10 min).

    Fetches current prices from DexScreener (1 API call per token — no
    full forensic pipeline).  Compares against reference + last snapshot:
    - Large drop vs last snapshot → trigger immediate full rescan
    - Large cumulative drop vs reference → trigger immediate full rescan

    Returns list of {mint, watch_id, user_id, trigger, pct} for triggered rescans.
    """
    from .data_sources._clients import get_dex_client

    try:
        db = await cache._get_conn()

        # Get all active mint watches with their latest snapshot prices
        cursor = await db.execute(
            "SELECT uw.id, uw.user_id, uw.value AS mint "
            "FROM user_watches uw WHERE uw.sub_type = 'mint'"
        )
        watches = await cursor.fetchall()
        if not watches:
            return []

        triggered: list[dict] = []
        dex = get_dex_client()

        # Process in batches of 8 to avoid hammering DexScreener
        sem = asyncio.Semaphore(8)

        async def _check_one(watch_id: int, user_id: int, mint: str):
            async with sem:
                try:
                    pairs = await asyncio.wait_for(
                        dex.get_token_pairs(mint), timeout=10.0,
                    )
                    if not pairs:
                        return
                    meta = dex.pairs_to_metadata(mint, pairs)
                    now_price = meta.price_usd or 0
                    now_liq = meta.liquidity_usd or 0
                    now_mcap = meta.market_cap_usd or 0

                    if now_price <= 0:
                        return

                    # Load last snapshot price
                    c2 = await db.execute(
                        "SELECT detail FROM sweep_flags "
                        "WHERE watch_id = ? AND flag_type = '_SNAPSHOT' "
                        "ORDER BY created_at DESC LIMIT 1",
                        (watch_id,),
                    )
                    snap_row = await c2.fetchone()
                    last_snap = json.loads(snap_row[0]) if snap_row else {}

                    # Load reference snapshot
                    c3 = await db.execute(
                        "SELECT detail FROM sweep_flags "
                        "WHERE watch_id = ? AND flag_type = '_REFERENCE' "
                        "ORDER BY created_at ASC LIMIT 1",
                        (watch_id,),
                    )
                    ref_row = await c3.fetchone()
                    ref_snap = json.loads(ref_row[0]) if ref_row else {}

                    trigger_reason = None

                    # Check vs last snapshot
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

                    # Check vs reference
                    ref_price = ref_snap.get("price_usd") or 0
                    if not trigger_reason and ref_price > 0:
                        ref_pct = (now_price - ref_price) / ref_price * 100
                        if ref_pct <= PULSE_DROP_VS_REF_PCT:
                            trigger_reason = f"price {ref_pct:+.0f}% since first watched"

                    if trigger_reason:
                        logger.warning(
                            "[pulse] ⚡ %s triggered urgent rescan: %s (now=$%.6f)",
                            mint[:12], trigger_reason, now_price,
                        )
                        triggered.append({
                            "mint": mint,
                            "watch_id": watch_id,
                            "user_id": user_id,
                            "trigger": trigger_reason,
                            "now_price": now_price,
                            "now_liq": now_liq,
                        })
                    else:
                        logger.debug("[pulse] %s OK (price=$%.6f)", mint[:12], now_price)

                except asyncio.TimeoutError:
                    logger.debug("[pulse] timeout fetching %s", mint[:12])
                except Exception as exc:
                    logger.debug("[pulse] error checking %s: %s", mint[:12], exc)

        await asyncio.gather(*[
            _check_one(w[0], w[1], w[2]) for w in watches
        ])

        # Trigger full rescans as background tasks (non-blocking)
        # Limit to 1 concurrent pulse rescan to avoid saturating RPC
        for t in triggered:
            asyncio.create_task(
                _pulse_rescan_one(t, cache),
                name=f"pulse_rescan_{t['mint'][:8]}",
            )

        if triggered:
            logger.info("[pulse] %d/%d watches triggered urgent rescan", len(triggered), len(watches))
        else:
            logger.debug("[pulse] all %d watches stable", len(watches))

        return triggered

    except Exception as exc:
        logger.warning("[pulse] market pulse failed: %s", exc)
        return []
