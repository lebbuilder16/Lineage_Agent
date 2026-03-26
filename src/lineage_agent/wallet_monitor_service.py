"""Wallet monitoring service — scans user wallet holdings for risk.

Background loop reads SPL token holdings from Solana RPC, cross-references
each token with the forensic pipeline, and alerts users when risk crosses
their configured threshold.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

SWEEP_CHECK_INTERVAL = 120  # seconds — how often the loop checks who needs scanning
MIN_LIQUIDITY_USD = 100.0   # skip dust tokens below this
MAX_TOKENS_PER_WALLET = 150
CONCURRENT_ENRICHMENTS = 5

# Well-known infrastructure tokens — never risk-check these
KNOWN_SKIP_MINTS: frozenset[str] = frozenset({
    "So11111111111111111111111111111111111111112",     # WSOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  # USDC
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  # USDT
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",  # mSOL
    "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",  # JupSOL
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", # jitoSOL
    "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",  # bSOL
    "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj", # stSOL
})

SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"


# ── Fetch holdings from Solana RPC ───────────────────────────────────────────

async def fetch_wallet_holdings(wallet_address: str) -> list[dict]:
    """Read SPL token holdings for a wallet via getTokenAccountsByOwner.

    Returns list of {mint, ui_amount, decimals} sorted by ui_amount desc.
    Skips zero-balance accounts and caps at MAX_TOKENS_PER_WALLET.
    """
    from .data_sources._clients import get_rpc_client
    rpc = get_rpc_client()

    result = await rpc._call(
        "getTokenAccountsByOwner",
        [
            wallet_address,
            {"programId": SPL_TOKEN_PROGRAM},
            {"encoding": "jsonParsed"},
        ],
    )

    accounts = (result or {}).get("value", [])
    holdings = []
    for acc in accounts:
        parsed = acc.get("account", {}).get("data", {}).get("parsed", {}).get("info", {})
        mint = parsed.get("mint", "")
        token_amount = parsed.get("tokenAmount", {})
        ui_amount = float(token_amount.get("uiAmount") or 0)
        decimals = int(token_amount.get("decimals") or 0)

        if not mint or ui_amount <= 0:
            continue
        if mint in KNOWN_SKIP_MINTS:
            continue

        holdings.append({"mint": mint, "ui_amount": ui_amount, "decimals": decimals})

    holdings.sort(key=lambda h: h["ui_amount"], reverse=True)
    return holdings[:MAX_TOKENS_PER_WALLET]


# ── Enrich token metadata from DexScreener ───────────────────────────────────

async def enrich_holding_metadata(mint: str) -> dict:
    """Fetch name, symbol, image, price, liquidity for a token.

    Returns empty dict with liquidity_usd=0 if no pool found (dust).
    """
    try:
        from .data_sources._clients import get_dex_client
        dex = get_dex_client()
        pairs = await asyncio.wait_for(dex.get_token_pairs(mint), timeout=5.0)
        if not pairs:
            return {"liquidity_usd": 0}
        meta = dex.pairs_to_metadata(mint, pairs)
        return {
            "token_name": meta.name or "",
            "token_symbol": meta.symbol or "",
            "image_uri": meta.image_uri or "",
            "price_usd": meta.price_usd or 0,
            "liquidity_usd": meta.liquidity_usd or 0,
            "mcap_usd": meta.market_cap_usd or 0,
        }
    except Exception:
        return {"liquidity_usd": 0}


# ── Risk assessment ──────────────────────────────────────────────────────────

def _extract_flags_from_lineage(lin: Any) -> list[str]:
    """Extract human-readable risk flags from a lineage result."""
    flags: list[str] = []
    try:
        # Deployer signals
        dp = getattr(lin, "deployer_profile", None)
        if dp:
            rc = getattr(dp, "confirmed_rug_count", 0) or 0
            if rc > 0:
                flags.append(f"deployer: {rc} prior rug{'s' if rc > 1 else ''}")
            rr = getattr(dp, "rug_rate_pct", 0) or 0
            if rr > 40:
                flags.append(f"rug rate {rr:.0f}%")

        # Insider sell
        ins = getattr(lin, "insider_sell", None)
        if ins:
            if getattr(ins, "deployer_exited", False):
                flags.append("deployer exited")
            verdict = getattr(ins, "verdict", "")
            if verdict == "insider_dump":
                flags.append("insider dump")

        # Bundle
        br = getattr(lin, "bundle_report", None)
        if br:
            bv = getattr(br, "overall_verdict", "")
            if "extraction" in str(bv):
                flags.append("bundle extraction")
            bw = getattr(br, "bundle_wallet_count", 0) or 0
            if bw >= 3:
                flags.append(f"{bw} bundled wallets")

        # Death clock
        dc = getattr(lin, "death_clock", None)
        if dc:
            rl = getattr(dc, "risk_level", "")
            if rl in ("high", "critical"):
                flags.append(f"death clock: {rl}")

        # SOL flow
        sf = getattr(lin, "sol_flow", None)
        if sf:
            ext = getattr(sf, "total_extracted_sol", 0) or 0
            if ext > 5:
                flags.append(f"{ext:.1f} SOL extracted")

        # Cartel
        cr = getattr(lin, "cartel_report", None)
        if cr:
            dc_comm = getattr(cr, "deployer_community", None)
            if dc_comm and getattr(dc_comm, "community_size", 0) >= 3:
                flags.append(f"cartel: {getattr(dc_comm, 'community_size', 0)} wallets")
    except Exception:
        pass
    return flags


async def assess_risk_lightweight(mint: str) -> tuple[int, str, list[str]]:
    """Fast risk check using cached lineage data (zero external calls).

    Returns (risk_score, risk_level, risk_flags).
    """
    try:
        from .lineage_detector import get_cached_lineage_report
        from .ai_analyst import _heuristic_score

        cached = await get_cached_lineage_report(mint)
        if cached:
            flags = _extract_flags_from_lineage(cached)
            dc = getattr(cached, "death_clock", None)
            if dc and getattr(dc, "risk_level", None):
                score = int(getattr(dc, "rug_probability_pct", 50) or 50)
                level = getattr(dc, "risk_level", "unknown")
                return (score, level, flags)

            cached_dict = cached.model_dump(mode="json") if hasattr(cached, "model_dump") else {}
            score = _heuristic_score(
                cached_dict,
                cached_dict.get("bundle_report"),
                cached_dict.get("sol_flow"),
            )
            level = "critical" if score >= 75 else "high" if score >= 50 else "medium" if score >= 25 else "low"
            return (score, level, flags)
    except Exception:
        pass
    return (0, "unknown", [])


async def assess_risk_full(mint: str) -> tuple[int, str, list[str]]:
    """Full forensic pipeline — only called when lightweight shows risk.

    Returns (risk_score, risk_level, risk_flags).
    """
    try:
        from .lineage_detector import detect_lineage
        from .ai_analyst import _heuristic_score

        lin = await asyncio.wait_for(detect_lineage(mint, force_refresh=True), timeout=60.0)
        flags = _extract_flags_from_lineage(lin)
        scan_dict = lin.model_dump(mode="json") if hasattr(lin, "model_dump") else {}
        score = _heuristic_score(
            scan_dict,
            scan_dict.get("bundle_report"),
            scan_dict.get("sol_flow"),
        )
        level = "critical" if score >= 75 else "high" if score >= 50 else "medium" if score >= 25 else "low"
        return (score, level, flags)
    except Exception as exc:
        logger.debug("[wallet_monitor] full risk assess failed for %s: %s", mint[:12], exc)
        return (0, "unknown", [])


# ── Alert broadcast ──────────────────────────────────────────────────────────

async def _broadcast_wallet_alert(
    alert_data: dict, user_id: int, cache: Any,
) -> None:
    """Send a wallet risk alert via WebSocket + FCM push."""
    from .alert_service import _broadcast_web_alert, _send_fcm_push

    token_name = alert_data.get("token_name") or alert_data["mint"][:8]
    score = alert_data["risk_score"]
    level = alert_data.get("risk_level", "high")
    emoji = "🔴" if level == "critical" else "⚠️"

    payload = {
        "type": "wallet_risk",
        "alert_type": "wallet_risk",
        "title": f"{emoji} {token_name} — Risk {score}/100",
        "message": alert_data.get("reason", f"Risk score {score}/100"),
        "body": alert_data.get("reason", f"Risk score {score}/100"),
        "mint": alert_data["mint"],
        "token_name": token_name,
        "risk_score": score,
        "risk_level": level,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "id": f"wm-{alert_data['mint'][:8]}-{int(time.time())}",
        "read": False,
    }
    await _broadcast_web_alert(payload, user_id=user_id)

    # FCM push
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL",
            (user_id,),
        )
        row = await cursor.fetchone()
        if row and row[0]:
            asyncio.create_task(_send_fcm_push(
                row[0],
                title=payload["title"],
                body=payload["message"],
                data={
                    "type": "wallet_risk",
                    "mint": alert_data["mint"],
                    "risk_score": str(score),
                    "urgency": "high" if score >= 75 else "normal",
                },
            ))
    except Exception:
        pass


# ── Single wallet sweep ──────────────────────────────────────────────────────

async def run_wallet_monitor_sweep(
    user_id: int, wallet_address: str, threshold: int, cache: Any,
) -> dict:
    """Scan a single wallet's holdings, assess risk, generate alerts.

    Returns {holdings_count, risky_count, alerts_sent}.
    """
    db = await cache._get_conn()
    now = time.time()

    # 1. Fetch on-chain holdings
    current = await fetch_wallet_holdings(wallet_address)
    current_mints = {h["mint"] for h in current}

    # 2. Load previous holdings from DB
    cursor = await db.execute(
        "SELECT mint, risk_score, risk_level, last_scanned, token_name, token_symbol, "
        "image_uri, liquidity_usd, price_usd "
        "FROM wallet_holdings WHERE user_id = ? AND wallet_address = ?",
        (user_id, wallet_address),
    )
    prev_rows = await cursor.fetchall()
    prev: dict[str, dict] = {}
    for r in prev_rows:
        prev[r[0]] = {
            "risk_score": r[1], "risk_level": r[2], "last_scanned": r[3],
            "token_name": r[4], "token_symbol": r[5], "image_uri": r[6],
            "liquidity_usd": r[7], "price_usd": r[8],
        }

    alerts: list[dict] = []
    risky_count = 0

    # 3. Process each holding
    for holding in current:
        mint = holding["mint"]
        p = prev.get(mint)

        # Determine if this holding needs re-evaluation
        old_score = p["risk_score"] if p else None
        risk_flags: list[str] = []
        needs_recheck = (
            not p
            or p.get("risk_score") is None
            or (now - (p.get("last_scanned") or 0)) > 600
        )

        # Enrich metadata — refresh price/liquidity when rechecking
        meta: dict = {}
        if not p or not p.get("token_name") or needs_recheck:
            meta = await enrich_holding_metadata(mint)
            if (meta.get("liquidity_usd") or 0) < MIN_LIQUIDITY_USD and not p:
                continue  # new dust token, skip
            # Keep existing name/symbol/image if DexScreener returned empty
            if p and not meta.get("token_name"):
                meta["token_name"] = p.get("token_name", "")
                meta["token_symbol"] = p.get("token_symbol", "")
                meta["image_uri"] = p.get("image_uri", "")
        else:
            meta = {
                "token_name": p["token_name"], "token_symbol": p["token_symbol"],
                "image_uri": p["image_uri"], "liquidity_usd": p["liquidity_usd"],
                "price_usd": p["price_usd"],
            }

        if needs_recheck:
            score, level, risk_flags = await assess_risk_lightweight(mint)
            needs_full = (
                score >= threshold
                or (level == "unknown" and (meta.get("liquidity_usd") or 0) >= 500)
            )
            if needs_full:
                full_score, full_level, full_flags = await assess_risk_full(mint)
                if full_score > 0:
                    score, level, risk_flags = full_score, full_level, full_flags
        else:
            score = old_score or 0
            level = p.get("risk_level", "unknown") if p else "unknown"

        if score >= threshold:
            risky_count += 1

        # Compute status delta
        is_new = p is None
        if is_new:
            status = "new"
        elif old_score is not None and score > old_score + 10:
            status = "risk_up"
        elif old_score is not None and score < old_score - 10:
            status = "risk_down"
        else:
            status = "held"

        # Generate alert if risk crossed threshold upward
        crossed_up = (
            (old_score is not None and old_score < threshold and score >= threshold)
            or (is_new and score >= threshold)
        )
        if crossed_up:
            flag_summary = (" — " + ", ".join(risk_flags[:2])) if risk_flags else ""
            alerts.append({
                "mint": mint,
                "token_name": meta.get("token_name", ""),
                "risk_score": score,
                "risk_level": level,
                "reason": f"Risk {score}/100{flag_summary}",
            })

        # Upsert holding with flags + delta
        import json as _json
        await db.execute(
            """INSERT OR REPLACE INTO wallet_holdings
               (user_id, wallet_address, mint, token_name, token_symbol, image_uri,
                ui_amount, decimals, risk_score, risk_level, liquidity_usd, price_usd,
                risk_flags, prev_risk_score, status,
                last_scanned, first_seen, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                       ?, ?, ?,
                       ?, COALESCE((SELECT first_seen FROM wallet_holdings
                                    WHERE user_id=? AND wallet_address=? AND mint=?), ?), ?)""",
            (user_id, wallet_address, mint,
             meta.get("token_name", ""), meta.get("token_symbol", ""), meta.get("image_uri", ""),
             holding["ui_amount"], holding["decimals"],
             score, level,
             meta.get("liquidity_usd"), meta.get("price_usd"),
             _json.dumps(risk_flags) if risk_flags else None,
             old_score, status,
             now if needs_recheck else (p.get("last_scanned") if p else now),
             user_id, wallet_address, mint, now, now),
        )

        # Record risk history for sparkline (only when score changed or first scan)
        if needs_recheck and score > 0:
            await db.execute(
                "INSERT INTO wallet_risk_history (user_id, mint, risk_score, scanned_at) "
                "VALUES (?, ?, ?, ?)",
                (user_id, mint, score, now),
            )
            # Keep max 20 history points per (user, mint)
            await db.execute(
                "DELETE FROM wallet_risk_history WHERE id IN ("
                "  SELECT id FROM wallet_risk_history WHERE user_id=? AND mint=? "
                "  ORDER BY scanned_at DESC LIMIT -1 OFFSET 20"
                ")",
                (user_id, mint),
            )

    # 4. Remove tokens no longer held
    prev_mints = set(prev.keys())
    sold = prev_mints - current_mints
    for sold_mint in sold:
        await db.execute(
            "DELETE FROM wallet_holdings WHERE user_id = ? AND wallet_address = ? AND mint = ?",
            (user_id, wallet_address, sold_mint),
        )

    await db.commit()

    # 5. Broadcast alerts
    for alert in alerts:
        try:
            await _broadcast_wallet_alert(alert, user_id, cache)
        except Exception as exc:
            logger.debug("[wallet_monitor] alert broadcast failed: %s", exc)

    return {
        "holdings_count": len(current),
        "risky_count": risky_count,
        "alerts_sent": len(alerts),
    }


# ── Background sweep loop ───────────────────────────────────────────────────

async def wallet_monitor_loop(cache: Any) -> None:
    """Background loop that scans wallets for users with monitoring enabled."""
    first_run = True
    while True:
        await asyncio.sleep(30 if first_run else SWEEP_CHECK_INTERVAL)
        first_run = False
        try:
            db = await cache._get_conn()

            # Find users with monitored wallets (Pro+/Whale only).
            # Uses LEFT JOIN so users without agent_prefs row are still picked
            # up if they have monitored_wallets entries.
            cursor = await db.execute(
                """SELECT DISTINCT u.id,
                          COALESCE(ap.wallet_monitor_threshold, 60),
                          COALESCE(ap.wallet_monitor_interval, 600)
                   FROM users u
                   INNER JOIN monitored_wallets mw ON mw.user_id = u.id AND mw.enabled = 1
                   LEFT JOIN agent_prefs ap ON ap.user_id = u.id
                   WHERE u.plan IN ('pro_plus', 'whale')
                     AND (ap.wallet_monitor_enabled = 1
                          OR ap.wallet_monitor_enabled IS NULL)"""
            )
            users = await cursor.fetchall()

            for i, (user_id, threshold, interval) in enumerate(users):
                # Check if enough time since last sweep
                cursor2 = await db.execute(
                    "SELECT MAX(created_at) FROM wallet_monitor_log WHERE user_id = ?",
                    (user_id,),
                )
                last_row = await cursor2.fetchone()
                last_sweep = last_row[0] if last_row and last_row[0] else 0
                if time.time() - last_sweep < interval:
                    continue

                # Get all enabled monitored wallets for this user
                cursor3 = await db.execute(
                    "SELECT address FROM monitored_wallets WHERE user_id = ? AND enabled = 1",
                    (user_id,),
                )
                wallets = [r[0] for r in await cursor3.fetchall()]
                if not wallets:
                    continue

                if i > 0:
                    await asyncio.sleep(5)  # stagger between users

                start = time.time()
                total_holdings = 0
                total_risky = 0
                total_alerts = 0

                for wallet_addr in wallets:
                    try:
                        result = await run_wallet_monitor_sweep(
                            user_id, wallet_addr, threshold, cache,
                        )
                        total_holdings += result["holdings_count"]
                        total_risky += result["risky_count"]
                        total_alerts += result["alerts_sent"]
                    except Exception as exc:
                        logger.warning(
                            "[wallet_monitor] sweep failed user=%d wallet=%s: %s",
                            user_id, wallet_addr[:12], exc,
                        )

                # Log sweep
                duration_ms = (time.time() - start) * 1000
                await db.execute(
                    "INSERT INTO wallet_monitor_log "
                    "(user_id, holdings_count, risky_count, alerts_sent, duration_ms, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (user_id, total_holdings, total_risky, total_alerts, duration_ms, time.time()),
                )
                await db.commit()

                if total_alerts > 0:
                    logger.info(
                        "[wallet_monitor] user=%d: %d holdings, %d risky, %d alerts (%.0fms)",
                        user_id, total_holdings, total_risky, total_alerts, duration_ms,
                    )

        except asyncio.CancelledError:
            logger.info("[wallet_monitor] loop cancelled")
            break
        except Exception as exc:
            logger.exception("[wallet_monitor] loop error: %s", exc)
