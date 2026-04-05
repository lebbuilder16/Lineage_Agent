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
    snapshot["sol_extracted"] = (getattr(sf, "total_extracted_sol", 0) or 0) if sf else 0
    snapshot["sol_hops"] = (getattr(sf, "hop_count", 0) or 0) if sf else 0

    br = getattr(lin, "bundle_report", None)
    snapshot["bundle_verdict"] = getattr(br, "overall_verdict", None) if br else None
    snapshot["bundle_sol"] = (getattr(br, "total_sol_extracted_confirmed", 0) or 0) if br else 0
    if br:
        fw = getattr(br, "factory_sniper_wallets", None)
        snapshot["bundle_wallets"] = len(fw) if fw else 0
    else:
        snapshot["bundle_wallets"] = 0

    ins = getattr(lin, "insider_sell", None)
    # Always include deployer_exited — even when insider_sell is None.
    # Missing field causes false-positive DEPLOYER_EXITED flags on next rescan.
    snapshot["deployer_exited"] = getattr(ins, "deployer_exited", False) if ins else False
    if ins:
        snapshot["insider_verdict"] = getattr(ins, "verdict", None)
        snapshot["sell_pressure_24h"] = getattr(ins, "sell_pressure_24h", None)

    cr = getattr(lin, "cartel_report", None)
    snapshot["cartel_wallets"] = 0
    if cr:
        dc = getattr(cr, "deployer_community", None)
        if dc:
            wallets = getattr(dc, "wallets", None)
            snapshot["cartel_wallets"] = len(wallets) if wallets else 0
            snapshot["cartel_narrative"] = getattr(dc, "narrative", "") or ""
            snapshot["cartel_sol_extracted"] = getattr(dc, "total_sol_extracted", 0) or 0

    dc = getattr(lin, "death_clock", None)
    if dc:
        snapshot["risk_level"] = getattr(dc, "risk_level", "unknown")
        snapshot["rug_probability"] = getattr(dc, "rug_probability_pct", None)

    dp = getattr(lin, "deployer_profile", None)
    snapshot["rug_count"] = (getattr(dp, "confirmed_rug_count", 0) or 0) if dp else 0
    snapshot["rug_rate"] = (getattr(dp, "rug_rate_pct", 0) or 0) if dp else 0

    # Market metrics (from LineageResult — zero extra API calls)
    qt = getattr(lin, "query_token", None) or getattr(lin, "root", None)
    if qt:
        snapshot["price_usd"] = getattr(qt, "price_usd", None)
        snapshot["mcap_usd"] = getattr(qt, "market_cap_usd", None)
        snapshot["liq_usd"] = getattr(qt, "liquidity_usd", None)
    if ins:
        snapshot["sell_pressure_1h"] = getattr(ins, "sell_pressure_1h", None)
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

    # Risk escalation — only emit when no causal critical flag already explains
    # WHY the risk changed.  If SOL extraction / deployer exit / insider dump
    # already fired, the user can infer the escalation; showing both is noise.
    _CAUSAL_CRITICAL_TYPES = {
        "SOL_EXTRACTION_NEW", "SOL_EXTRACTION_INCREASED", "DEPLOYER_EXITED",
        "INSIDER_DUMP_DETECTED", "DEPLOYER_NEW_RUG", "BUNDLE_WALLETS_ALL_EXITED",
    }
    _has_causal = bool({f["flag_type"] for f in flags} & _CAUSAL_CRITICAL_TYPES)
    risk_order = ["unknown", "insufficient_data", "low", "medium", "high", "critical"]
    old_ri = risk_order.index(old.get("risk_level", "unknown")) if old.get("risk_level") in risk_order else 0
    new_ri = risk_order.index(new.get("risk_level", "unknown")) if new.get("risk_level") in risk_order else 0
    if new_ri > old_ri and new_ri >= 3 and not _has_causal:
        old_r = old.get("risk_level", "unknown")
        new_r = new.get("risk_level", "unknown")
        # Identify the likely cause of escalation from snapshot deltas
        _reasons: list[str] = []
        _new_sol = new.get("sol_extracted", 0) or 0
        _old_sol = old.get("sol_extracted", 0) or 0
        if _new_sol > _old_sol:
            _reasons.append(f"SOL extracted: {_old_sol:.1f} → {_new_sol:.1f}")
        _new_cw = new.get("cartel_wallets", 0) or 0
        _old_cw = old.get("cartel_wallets", 0) or 0
        if _new_cw > _old_cw:
            _reasons.append(f"cartel wallets: {_old_cw} → {_new_cw}")
        _new_bw = new.get("bundle_wallets", 0) or 0
        _old_bw = old.get("bundle_wallets", 0) or 0
        if _new_bw > _old_bw:
            _reasons.append(f"bundle wallets: {_old_bw} → {_new_bw}")
        _new_sp = new.get("sell_pressure_24h") or 0
        _old_sp = old.get("sell_pressure_24h") or 0
        if _new_sp > _old_sp + 0.1:
            _reasons.append(f"sell pressure: {_old_sp*100:.0f}% → {_new_sp*100:.0f}%")
        if new.get("rug_count", 0) > old.get("rug_count", 0):
            _reasons.append(f"deployer rugs: {old.get('rug_count', 0)} → {new.get('rug_count', 0)}")
        _reason_str = " · ".join(_reasons[:3]) if _reasons else ""
        _reason_suffix = f" — {_reason_str}" if _reason_str else ""
        _flag("RISK_ESCALATION", "critical",
              {"old": old_r, "new": new_r, "reasons": _reasons},
              old=old_r, new=new_r, reason_suffix=_reason_suffix)

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
        # Only flag if bundles were NOT all exited at last scan
        old_holders = old.get("bundle_holders")
        old_exits = old.get("bundle_exits_new", 0) or 0
        old_all_exited = old_exits > 0 and old_holders == 0
        if not old_all_exited:
            _flag("BUNDLE_WALLETS_ALL_EXITED", "critical",
                  {"total_exits": new_bundle_exits})

    # ── Cross-signal intelligence ─────────────────────────────────────
    # These only fire when the combination is NEW (not present in old snapshot)
    deployer_exited = new.get("deployer_exited", False)
    old_deployer_exited = old.get("deployer_exited", False)
    bundle_wallets = new.get("bundle_wallets", 0) or 0
    bundle_holders = new.get("bundle_holders", 0)
    bundle_all_exited = (new.get("bundle_exits_new", 0) or 0) > 0 and bundle_holders == 0
    old_bundle_all_exited = (old.get("bundle_exits_new", 0) or 0) > 0 and (old.get("bundle_holders", 0)) == 0
    cartel_wallets = new.get("cartel_wallets", 0) or 0
    sol_extracted = new.get("sol_extracted", 0) or 0
    insider_dump = new.get("insider_verdict") == "insider_dump"
    old_insider_dump = old.get("insider_verdict") == "insider_dump"
    rug_count = new.get("rug_count", 0) or 0
    price_pct = 0.0
    if ref and ref.get("price_usd") and new.get("price_usd") and ref["price_usd"] > 0:
        price_pct = ((new["price_usd"] - ref["price_usd"]) / ref["price_usd"]) * 100

    # Cross-signals only fire when the combination JUST became true
    # (deployer just exited, or bundles just all exited, etc.)
    _deployer_just_exited = deployer_exited and not old_deployer_exited
    _bundle_just_all_exited = bundle_all_exited and not old_bundle_all_exited
    _insider_just_dumped = insider_dump and not old_insider_dump

    if _deployer_just_exited and bundle_wallets > 0 and not bundle_all_exited:
        _flag("CROSS_DEPLOYER_EXIT_BUNDLE_ACTIVE", "critical",
              {"deployer_exited": True, "bundle_wallets_remaining": bundle_wallets},
              bundle=bundle_wallets)

    if _deployer_just_exited and cartel_wallets > 0:
        _flag("CROSS_DEPLOYER_EXIT_CARTEL_ACTIVE", "critical",
              {"deployer_exited": True, "cartel_wallets": cartel_wallets},
              cartel=cartel_wallets)

    if _deployer_just_exited and sol_extracted > 5 and price_pct < -40:
        _flag("CROSS_RUG_PATTERN", "critical",
              {"sol_extracted": sol_extracted, "price_drop_pct": round(price_pct, 1)},
              sol=sol_extracted, pct=price_pct)

    if _bundle_just_all_exited and insider_dump:
        _flag("CROSS_COORDINATED_EXTRACTION", "critical",
              {"insider_dump": True, "bundle_all_exited": True})

    if cartel_wallets > 10 and rug_count > (old.get("rug_count", 0) or 0):
        _flag("CROSS_SERIAL_SCAM_RING", "critical",
              {"cartel_wallets": cartel_wallets, "rug_count": rug_count},
              cartel=cartel_wallets, rugs=rug_count)

    if _bundle_just_all_exited and sol_extracted > 10:
        _flag("CROSS_EXTRACTION_AND_EXIT", "critical",
              {"sol_extracted": sol_extracted, "bundle_all_exited": True},
              sol=sol_extracted)

    # ── Correlative intelligence: forensic × market cross-reference ──
    deltas = _compute_deltas(old, new)
    _existing_types = {f["flag_type"] for f in flags}
    correlated = _cross_reference(deltas, old, new, covered_types=_existing_types)
    for c in correlated:
        # _cross_reference returns pre-formatted flags with title+detail
        flags.append({
            "flag_type": c["type"],
            "severity": c["severity"],
            "title": c["title"],
            "detail": json.dumps(c["detail"], default=str) if isinstance(c["detail"], dict) else c["detail"],
        })

    # ── Cumulative deterioration (vs reference snapshot) ──────────────
    # Tiered thresholds: only fire when a NEW tier is crossed (-30%, -50%, -70%, -90%)
    # so the same flag doesn't repeat every scan while the price stays flat.
    if ref:
        ref_price = ref.get("price_usd") or 0
        new_price = new.get("price_usd") or 0
        old_price = old.get("price_usd") or 0
        ref_liq = ref.get("liq_usd") or 0
        new_liq = new.get("liq_usd") or 0
        old_liq = old.get("liq_usd") or 0

        def _crossed_tier(ref_val, old_val, new_val, tiers=(-30, -50, -70, -90)):
            """Return the newly crossed tier, or None if no new tier was crossed.

            When *old_val* is 0/None (first rescan after INITIAL_ASSESSMENT),
            we don't know what tier was already crossed at the initial snapshot
            — so we skip to avoid false-positive cumulative flags.
            """
            if ref_val <= 0:
                return None
            if not old_val:
                return None  # first rescan: no baseline to compare tiers
            new_pct = (new_val - ref_val) / ref_val * 100
            old_pct = (old_val - ref_val) / ref_val * 100
            for t in tiers:
                if new_pct <= t and old_pct > t:
                    return new_pct
            return None

        # Cumulative price crash — only when crossing a new tier
        price_tier = _crossed_tier(ref_price, old_price, new_price)
        if price_tier is not None:
            if price_tier <= -50:
                _flag("CUMULATIVE_PRICE_CRASH", "critical",
                      {"ref_price": ref_price, "now_price": new_price, "pct": round(price_tier, 1)},
                      pct=price_tier, ref=ref_price, now=new_price)
            else:
                _flag("CUMULATIVE_PRICE_DECLINE", "warning",
                      {"ref_price": ref_price, "now_price": new_price, "pct": round(price_tier, 1)},
                      pct=price_tier)

        # Cumulative liquidity drain — same tiered approach
        liq_tier = _crossed_tier(ref_liq, old_liq, new_liq)
        if liq_tier is not None and liq_tier <= -50:
            _flag("CUMULATIVE_LIQ_DRAIN", "critical",
                  {"ref_liq": ref_liq, "now_liq": new_liq, "pct": round(liq_tier, 1)},
                  pct=liq_tier)

        # Forensic deterioration since reference — only if SOL extraction INCREASED
        # since last scan AND no SOL_EXTRACTION_NEW already covers first detection.
        _sol_flag_exists = any(f["flag_type"] in ("SOL_EXTRACTION_NEW", "SOL_EXTRACTION_INCREASED") for f in flags)
        ref_sol = ref.get("sol_extracted") or 0
        old_sol_total = old.get("sol_extracted") or 0
        new_sol_total = new.get("sol_extracted") or 0
        # Proportional threshold: at least +20 SOL absolute OR +50% relative
        _cumul_threshold = max(20, ref_sol * 0.5) if ref_sol > 0 else 20
        if (new_sol_total > ref_sol + _cumul_threshold
                and new_sol_total > old_sol_total
                and not _sol_flag_exists):
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

    # Only compute sell pressure shift when old snapshot had actual data;
    # otherwise the "shift" is just discovering the current state for the first time.
    if old.get("sell_pressure_1h") is not None:
        d["sell_pressure_shift"] = (new.get("sell_pressure_1h") or 0) - (old.get("sell_pressure_1h") or 0)
    else:
        d["sell_pressure_shift"] = 0
    d["volume_spiking"] = (new.get("volume_spike_ratio") or 0) >= 5
    return d


def _cross_reference(deltas: dict, old: dict, new: dict, *, covered_types: set[str] | None = None) -> list[dict]:
    """Cross-reference forensic and market layers. Observational, not causal.

    *covered_types*: flag types already emitted by phase-1 checks.  When a
    forensic signal is already reported by a dedicated flag, we skip it here
    to avoid showing the same information twice.
    """
    results: list[dict] = []
    _ct = covered_types or set()

    # Map: forensic signal → flag types that already cover it
    _COVERED_BY = {
        "sol_delta": {"SOL_EXTRACTION_NEW", "SOL_EXTRACTION_INCREASED"},
        "deployer_just_exited": {"DEPLOYER_EXITED"},
        "insider_escalated": {"INSIDER_DUMP_DETECTED"},
        "bundle_wallets_delta": {"BUNDLE_WALLETS_NEW", "BUNDLE_DETECTED"},
        "cartel_wallets_delta": {"CARTEL_DETECTED", "CARTEL_EXPANDED"},
        "bundle_exits_new": {"BUNDLE_WALLET_EXIT", "BUNDLE_WALLETS_ALL_EXITED"},
    }

    def _already_covered(signal_key: str) -> bool:
        return bool(_ct & _COVERED_BY.get(signal_key, set()))

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

    # Build factual observations per layer — skip facts already covered
    forensic_facts = []
    if deltas["sol_delta"] > 0 and not _already_covered("sol_delta"):
        forensic_facts.append(f"+{deltas['sol_delta']:.1f} SOL extracted")
    if deltas["deployer_just_exited"] and not _already_covered("deployer_just_exited"):
        forensic_facts.append("deployer exited")
    if deltas["insider_escalated"] and not _already_covered("insider_escalated"):
        forensic_facts.append("insider dump detected")
    if deltas["bundle_wallets_delta"] > 0 and not _already_covered("bundle_wallets_delta"):
        forensic_facts.append(f"+{deltas['bundle_wallets_delta']} bundle wallets")
    if deltas["cartel_wallets_delta"] > 0 and not _already_covered("cartel_wallets_delta"):
        forensic_facts.append(f"+{deltas['cartel_wallets_delta']} cartel wallets")
    if deltas["rug_count_delta"] > 0:
        forensic_facts.append(f"+{deltas['rug_count_delta']} new rug(s)")
    if deltas.get("bundle_exits_new", 0) > 0 and not _already_covered("bundle_exits_new"):
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

    if forensic_changed and market_stressed and forensic_facts:
        title = " · ".join(market_facts) + " | " + ", ".join(forensic_facts) if market_facts else ", ".join(forensic_facts)
        results.append({"type": "CORRELATED_FORENSIC_MARKET", "severity": "critical", "title": title, "detail": detail})
    elif forensic_changed and forensic_facts:
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


# ── Trinity AI flag generation ──────────────────────────────────────────────

_TRINITY_FLAG_SYSTEM = """\
You are a Solana token forensics analyst generating watchlist alerts for investors.
You receive a delta between two forensic scans of a watched token.
Output 0-5 flags as a JSON array. Each flag:
  {"flag_type": "SCREAMING_SNAKE_CASE", "severity": "critical"|"warning"|"info", "title": "...", "detail": "..."}
Rules:
- flag_type: 2-4 words describing the signal (e.g. DEPLOYER_EXIT_WITH_DRAIN, CARTEL_NETWORK_GROWING)
- title: 1 sentence, plain English, investor-readable, include key numbers ($, SOL, %)
- detail: 1-2 sentences expanding context and implications for a non-technical investor
- severity: critical = immediate danger/rug signal, warning = concerning change, info = notable but not urgent
- Output [] (empty array) if nothing meaningful changed
- Max 5 flags, prioritize by severity
Respond with ONLY a JSON array. No markdown, no commentary, no explanation outside the JSON."""


def _compute_compact_delta(old: dict, new: dict) -> str:
    """Return a compact string of only changed fields between two forensic snapshots."""
    lines = []
    for key in sorted(set(old.keys()) | set(new.keys())):
        if key.startswith("_"):
            continue
        ov = old.get(key)
        nv = new.get(key)
        # Skip unchanged values
        if ov == nv:
            continue
        # Skip None→None
        if ov is None and nv is None:
            continue
        # Format values
        def _fmt(v):
            if v is None:
                return "unknown"
            if isinstance(v, bool):
                return str(v).lower()
            if isinstance(v, float):
                if abs(v) >= 1000:
                    return f"{v:,.0f}"
                return f"{v:.4f}" if abs(v) < 1 else f"{v:.1f}"
            return str(v)
        lines.append(f"{key}: {_fmt(ov)} → {_fmt(nv)}")
    return "\n".join(lines) if lines else "(no changes)"


def _parse_trinity_flags(text: str) -> list[dict] | None:
    """Parse Trinity's raw text into validated flag dicts.

    Returns list[dict] on success (may be empty), None on total parse failure.
    """
    if not text or not text.strip():
        return None

    # Strip markdown fences
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Remove opening fence (with optional language tag)
        first_nl = cleaned.index("\n") if "\n" in cleaned else len(cleaned)
        cleaned = cleaned[first_nl + 1:]
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3].rstrip()

    # Try to extract JSON array
    import re as _re
    # Find first [ ... last ]
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return None
    json_str = cleaned[start:end + 1]

    try:
        arr = json.loads(json_str)
    except json.JSONDecodeError:
        try:
            import json_repair  # noqa: PLC0415
            arr = json_repair.loads(json_str)
        except Exception:
            return None

    if not isinstance(arr, list):
        return None

    # Validate and normalize each flag
    valid_severities = {"critical", "warning", "info"}
    flags = []
    for item in arr[:5]:  # cap at 5
        if not isinstance(item, dict):
            continue
        ft = item.get("flag_type", "")
        sev = item.get("severity", "")
        title = item.get("title", "")
        detail_text = item.get("detail", "")

        if not ft or not title:
            continue
        # Normalize flag_type to SCREAMING_SNAKE
        ft = ft.upper().replace(" ", "_")
        ft = _re.sub(r"[^A-Z0-9_]", "", ft)
        if len(ft) < 4:
            continue
        if sev not in valid_severities:
            sev = "warning"

        # Build detail dict matching existing flag format
        detail_dict = {
            "narrative": detail_text,
            "source": "trinity",
        }

        flags.append({
            "flag_type": ft,
            "severity": sev,
            "title": title,
            "detail": json.dumps(detail_dict, default=str),
        })

    return flags


async def _generate_flags_trinity(
    old: dict, new: dict, mint: str,
    *,
    ref: Optional[dict] = None,
    symbol: str = "",
    old_score: int = 0,
    new_score: int = 0,
) -> list[dict] | None:
    """Generate flags using Trinity AI. Returns flags on success, None on failure."""
    try:
        from .ai_analyst import _get_openrouter_client, _OPENROUTER_API_KEY  # noqa: PLC0415

        client = _get_openrouter_client()
        if not client:
            return None

        delta_str = _compute_compact_delta(old, new)

        # Build compact current state
        state_lines = [
            f"Token: {symbol or '?'} ({mint[:12]})",
            f"Risk score: {old_score} → {new_score}",
            "",
            f"Changes since last scan:",
            delta_str,
            "",
            "Current state:",
            f"- SOL extracted: {new.get('sol_extracted', 0):.1f} | Deployer exited: {new.get('deployer_exited', False)}",
            f"- Bundle: {new.get('bundle_wallets', 0)} wallets ({new.get('bundle_holders', '?')} holding)",
            f"- Cartel: {new.get('cartel_wallets', 0)} wallets | Risk: {new.get('risk_level', 'unknown')}",
        ]
        price = new.get("price_usd")
        if price:
            h1 = new.get("price_change_h1") or 0
            h24 = new.get("price_change_h24") or 0
            liq = new.get("liq_usd") or 0
            state_lines.append(f"- Price: ${price:.6f} (1h: {h1:+.1f}%, 24h: {h24:+.1f}%) | Liq: ${liq:,.0f}")
        sp = new.get("sell_pressure_1h")
        if sp:
            state_lines.append(f"- Sell pressure 1h: {sp * 100:.0f}%")

        user_msg = "\n".join(state_lines)

        _trinity_model = "trinity-large-thinking" if _OPENROUTER_API_KEY and _OPENROUTER_API_KEY.startswith("rcai-") else "arcee-ai/trinity-large-thinking"

        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=_trinity_model,
                max_tokens=2048,  # thinking model needs budget for reasoning + JSON output
                temperature=0,
                messages=[
                    {"role": "system", "content": _TRINITY_FLAG_SYSTEM},
                    {"role": "user", "content": user_msg},
                ],
            ),
            timeout=20.0,  # thinking models need more time
        )

        _msg = response.choices[0].message
        text = _msg.content or ""
        if not text:
            text = getattr(_msg, "reasoning_content", None) or ""
            if not text:
                _psf = getattr(_msg, "provider_specific_fields", None) or {}
                text = _psf.get("reasoning_content", "")

        _usage = response.usage
        logger.info(
            "[sweep] Trinity flags for %s | tokens=%d/%d | raw_len=%d",
            mint[:12],
            _usage.prompt_tokens if _usage else 0,
            _usage.completion_tokens if _usage else 0,
            len(text),
        )

        flags = _parse_trinity_flags(text)
        if flags is not None:
            # Deduplicate Trinity flags within the batch: collapse flags whose
            # types map to the same logical signal (e.g. SOL_DRAIN + EXTRACTION
            # both describing the same SOL movement).
            _TRINITY_DEDUP_KEYWORDS = {
                "SOL": "sol_group",
                "EXTRACT": "sol_group",
                "DRAIN": "sol_group",
                "DEPLOY": "deployer_group",
                "CREATOR": "deployer_group",
                "BUNDLE": "bundle_group",
                "CARTEL": "cartel_group",
                "INSIDER": "insider_group",
                "DUMP": "insider_group",
            }
            seen_groups: set[str] = set()
            deduped: list[dict] = []
            for f in flags:
                groups_hit = {g for kw, g in _TRINITY_DEDUP_KEYWORDS.items() if kw in f["flag_type"]}
                if groups_hit and groups_hit & seen_groups:
                    continue  # skip: same logical group already present
                seen_groups |= groups_hit
                deduped.append(f)
            flags = deduped

            logger.info("[sweep] Trinity generated %d flag(s) for %s", len(flags), mint[:12])
            return flags

        logger.warning("[sweep] Trinity flag parse failed for %s, falling back", mint[:12])
        return None

    except asyncio.TimeoutError:
        logger.warning("[sweep] Trinity flag gen timed out for %s", mint[:12])
        return None
    except Exception as exc:
        logger.warning("[sweep] Trinity flag gen failed for %s: %s", mint[:12], exc)
        return None


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


# ── Deployer watch rescan ────────────────────────────────────────────────────

async def _rescan_deployer_watch(
    watch_id: int, user_id: int, deployer: str, cache,
) -> dict | None:
    """Check if a watched deployer launched new tokens since last check."""
    try:
        db = await cache._get_conn()
        # Get last check timestamp
        cursor = await db.execute(
            "SELECT MAX(scanned_at) FROM watch_snapshots WHERE watch_id = ?",
            (watch_id,),
        )
        row = await cursor.fetchone()
        last_check = row[0] if row and row[0] else 0

        # Query intelligence_events for new tokens by this deployer
        from .data_sources._clients import event_query
        new_tokens = await event_query(
            where="deployer = ? AND recorded_at > ?",
            params=(deployer, last_check),
            columns="mint,name,symbol,mcap_usd,recorded_at",
            limit=10,
        )

        # Store snapshot
        now = time.time()
        await db.execute(
            "INSERT INTO watch_snapshots (watch_id, mint, risk_level, risk_score, scanned_at) "
            "VALUES (?, ?, 'unknown', 0, ?)",
            (watch_id, deployer, now),
        )

        if not new_tokens:
            await db.commit()
            return None

        # Generate flags for each new token
        flags = []
        for token in new_tokens:
            name = token.get("name", "Unknown")
            symbol = token.get("symbol", "?")
            mint_addr = token.get("mint", "")
            flags.append({
                "flag_type": "DEPLOYER_NEW_TOKEN",
                "severity": "warning",
                "title": f"Deployer launched new token: {name} ({symbol})",
                "detail": json.dumps({
                    "deployer": deployer,
                    "mint": mint_addr,
                    "name": name,
                    "symbol": symbol,
                    "mcap_usd": token.get("mcap_usd"),
                }, default=str),
            })

        # Store flags
        for flag in flags:
            await db.execute(
                "INSERT INTO sweep_flags "
                "(watch_id, mint, user_id, flag_type, severity, title, detail, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (watch_id, deployer, user_id, flag["flag_type"], flag["severity"],
                 flag["title"], flag["detail"], now),
            )
        await db.commit()

        if flags:
            logger.info("[sweep] deployer %s: %d new token(s) detected", deployer[:12], len(flags))

        return {
            "mint": deployer,
            "old_risk": "unknown",
            "new_risk": "unknown",
            "new_score": 0,
            "escalated": False,
            "flags_count": len(flags),
            "flags": flags,
        }
    except Exception as exc:
        logger.warning("[sweep] deployer watch %d failed: %s", watch_id, exc)
        return None


# ── Main rescan function ─────────────────────────────────────────────────────

async def run_single_rescan(watch_id: int, user_id: int, cache, *, skip_ai: bool = False, plan: str = "free") -> dict | None:
    """Rescan a single watch, generate flags, return result.

    *skip_ai*: When True, skips forensic enrichment entirely (pulse loop).
    *plan*: User plan — Elite gets AI analysis (Trinity), others get heuristic.

    Returns {mint, old_risk, new_risk, escalated, flags_count} or None on failure.
    """
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "SELECT value, sub_type FROM user_watches WHERE id = ?", (watch_id,)
        )
        row = await cursor.fetchone()
        if not row:
            return None

        watch_value = row[0]
        sub_type = row[1] if len(row) > 1 else "mint"

        # Deployer watches: check for new tokens launched by this deployer
        if sub_type == "deployer":
            return await _rescan_deployer_watch(
                watch_id, user_id, watch_value, cache,
            )

        mint = watch_value

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
        # Free/Pro = heuristic only (skip AI), Elite = Trinity AI via write-through
        _skip_enrichment = skip_ai or (plan != "elite")
        from .lineage_detector import detect_lineage
        try:
            lin = await asyncio.wait_for(
                detect_lineage(mint, force_refresh=False, skip_forensic_enrichment=_skip_enrichment),
                timeout=90.0,
            )
        except asyncio.TimeoutError:
            logger.warning("[sweep] detect_lineage timed out for %s (watch %d) — skipping", mint[:12], watch_id)
            return None

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

        # Extract token metadata early (needed for Trinity prompt + flag enrichment)
        qt = getattr(lin, "query_token", None) or getattr(lin, "root", None)
        _token_name = getattr(qt, "name", "") or ""
        _token_symbol = getattr(qt, "symbol", "") or ""

        # Generate intelligence flags (with reference for cumulative detection)
        # On the FIRST scan (no previous snapshot), every signal looks "new" because
        # old_forensic is empty — generating a flood of redundant flags that all
        # describe the same initial state.  Instead, store the baseline quietly and
        # emit a single consolidated "initial assessment" flag.
        _is_first_scan = not prev_snap_row
        if _is_first_scan:
            flags = []
            # Single summary flag so the user knows the baseline
            from .flag_templates import render_flag
            _summary_parts = []
            if new_forensic.get("sol_extracted", 0) > 0:
                _summary_parts.append(f"{new_forensic['sol_extracted']:.1f} SOL extracted")
            if new_forensic.get("cartel_wallets", 0) > 0:
                _summary_parts.append(f"{new_forensic['cartel_wallets']} cartel wallets")
            if new_forensic.get("bundle_wallets", 0) > 0:
                _summary_parts.append(f"{new_forensic['bundle_wallets']} bundle wallets")
            if new_forensic.get("deployer_exited"):
                _summary_parts.append("deployer exited")
            _risk_label = new_forensic.get("risk_level", "unknown")
            _sev = "critical" if _risk_label in ("critical", "high") else "warning" if _risk_label == "medium" else "info"
            _title = f"Initial scan: {_risk_label} risk"
            if _summary_parts:
                _title += " — " + ", ".join(_summary_parts)
            flags.append({
                "flag_type": "INITIAL_ASSESSMENT",
                "severity": _sev,
                "title": _title,
                "detail": json.dumps({"snapshot": new_forensic, "risk_score": new_score}, default=str),
            })
        else:
            flags = None
            # Elite users: Trinity AI generates contextual flags
            if plan == "elite":
                flags = await _generate_flags_trinity(
                    old_forensic, new_forensic, mint,
                    ref=ref_forensic,
                    symbol=_token_symbol,
                    old_score=old_score,
                    new_score=new_score,
                )
            # Fallback: deterministic flags (Free/Pro, or Trinity failure)
            if flags is None:
                flags = _generate_flags(old_forensic, new_forensic, mint, ref=ref_forensic)
        now = time.time()

        # Enrich flag details with token name/symbol for mobile display
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

        # Deduplicate: skip flags of the same type created in the last hour,
        # AND expand to logical groups so related flags don't repeat.
        _dedup_window = 3600  # 1 hour
        _recent_cursor = await db.execute(
            "SELECT DISTINCT flag_type FROM sweep_flags "
            "WHERE watch_id = ? AND created_at > ? AND flag_type NOT LIKE ?",
            (watch_id, now - _dedup_window, "_%"),
        )
        _recent_types = {r[0] for r in await _recent_cursor.fetchall()}

        # Logical groups: if any member was recently emitted, suppress all members
        _DEDUP_GROUPS = [
            {"SOL_EXTRACTION_NEW", "SOL_EXTRACTION_INCREASED", "CUMULATIVE_SOL_EXTRACTION", "FORENSIC_ACTIVITY"},
            {"DEPLOYER_EXITED", "CROSS_DEPLOYER_EXIT_BUNDLE_ACTIVE", "CROSS_DEPLOYER_EXIT_CARTEL_ACTIVE"},
            {"BUNDLE_WALLET_EXIT", "BUNDLE_WALLETS_ALL_EXITED", "CROSS_EXTRACTION_AND_EXIT", "CROSS_COORDINATED_EXTRACTION"},
        ]
        for group in _DEDUP_GROUPS:
            if _recent_types & group:
                _recent_types |= group  # expand: block all members of the group

        flags = [f for f in flags if f["flag_type"] not in _recent_types]

        # Snooze filter: skip flag_types that the user has snoozed
        try:
            _snooze_cursor = await db.execute(
                "SELECT DISTINCT sf.flag_type FROM flag_feedback ff "
                "JOIN sweep_flags sf ON ff.flag_id = sf.id "
                "WHERE ff.user_id = ? AND ff.rating = 'snoozed' AND ff.snooze_until > ?",
                (user_id, now),
            )
            _snoozed_types = {r[0] for r in await _snooze_cursor.fetchall()}
            if _snoozed_types:
                flags = [f for f in flags if f["flag_type"] not in _snoozed_types]
        except Exception:
            pass  # table may not exist yet on older DBs

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
                _SEV_RANK = {"critical": 0, "warning": 1, "info": 2}
                critical_flags = sorted(
                    [f for f in flags if f["severity"] in ("critical", "warning")],
                    key=lambda f: _SEV_RANK.get(f["severity"], 9),
                )
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
            except Exception as _push_exc:
                logger.warning("[sweep] push notification failed for %s: %s", mint[:12], _push_exc)

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

# Semaphore: limit concurrent pulse rescans to avoid starving user investigations
_PULSE_RESCAN_SEM = asyncio.Semaphore(3)


async def _pulse_rescan_one(t: dict, cache) -> None:
    """Run a single pulse-triggered rescan in the background, rate-limited."""
    async with _PULSE_RESCAN_SEM:
        try:
            result = await run_single_rescan(t["watch_id"], t["user_id"], cache, skip_ai=True)
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
