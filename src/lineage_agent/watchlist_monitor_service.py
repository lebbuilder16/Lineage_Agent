"""Watchlist monitor service — periodic rescan with intelligence flag generation."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_SECONDS = 7200  # 2 hours


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

    return snapshot


def _generate_flags(old: dict, new: dict, mint: str) -> list[dict]:
    """Compare old and new forensic snapshots and return intelligence flags."""
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

    return flags


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

        # Rescan
        from .lineage_detector import detect_lineage
        lin = await asyncio.wait_for(detect_lineage(mint), timeout=45.0)

        # Extract new forensic snapshot
        new_forensic = _extract_forensic_snapshot(lin)

        dc = getattr(lin, "death_clock", None)
        new_risk = getattr(dc, "risk_level", "unknown") if dc else "unknown"
        new_score = getattr(dc, "rug_probability_pct", 0) or 0 if dc else 0

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

        # Generate intelligence flags
        flags = _generate_flags(old_forensic, new_forensic, mint)
        now = time.time()

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
