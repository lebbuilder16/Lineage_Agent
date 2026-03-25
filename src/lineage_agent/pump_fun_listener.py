"""
Real-time Pump.fun DEX graduation detector.

Polls Helius Enhanced Transactions API every 10 seconds for new CREATE_POOL
events from the Pump.fun migration authority. Only processes tokens that have
GRADUATED to a DEX pool — high-signal, low-noise.

Flow:
1. Poll Helius Enhanced API on Pump.fun migration authority
2. Filter for CREATE_POOL transaction type
3. Extract the token mint from tokenTransfers
4. Triage: check deployer history + DNA fingerprint
5. Escalate if suspicious → full forensic pipeline + alerts
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from typing import Optional
from urllib.parse import urlparse, parse_qs

import httpx

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

_RPC_URL = os.environ.get("SOLANA_RPC_ENDPOINT", "")

# Extract Helius API key from the RPC endpoint URL
def _extract_helius_key() -> str:
    if not _RPC_URL or "helius" not in _RPC_URL:
        return os.environ.get("HELIUS_API_KEY", "")
    parsed = urlparse(_RPC_URL)
    qs = parse_qs(parsed.query)
    keys = qs.get("api-key", [])
    return keys[0] if keys else ""

_HELIUS_API_KEY = _extract_helius_key()
_HELIUS_API_BASE = "https://api.helius.xyz/v0"

# Pump.fun migration authority — all graduations flow through this address
_PUMP_MIGRATION_AUTHORITY = "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg"

_POLL_INTERVAL = 30        # seconds (reduced from 10 to avoid saturating Helius RPC quota)
_MAX_PER_POLL = 20         # max transactions to fetch per poll
_HIGH_RISK_RUG_RATE = 0.5
_MIN_TOKENS_FOR_TRIAGE = 2

# Known non-token addresses to skip
_SKIP_MINTS = {
    "So11111111111111111111111111111111111111112",  # WSOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  # USDC
}

_B58_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")

# State
_listener_task: Optional[asyncio.Task] = None
_seen_mints: dict[str, float] = {}
_last_tx_sig: Optional[str] = None
_stats = {"total_detected": 0, "total_escalated": 0, "errors": 0}

# Recent graduations buffer — serves the REST endpoint /graduations
_recent_graduations: list[dict] = []
_MAX_RECENT = 50


# ── Helius Enhanced API ───────────────────────────────────────────────────────

async def _fetch_recent_graduations() -> list[dict]:
    """Fetch recent CREATE_POOL transactions from the Pump.fun migration authority."""
    if not _HELIUS_API_KEY:
        return []

    url = (
        f"{_HELIUS_API_BASE}/addresses/{_PUMP_MIGRATION_AUTHORITY}/transactions"
        f"?api-key={_HELIUS_API_KEY}&limit={_MAX_PER_POLL}&type=CREATE_POOL"
    )

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                logger.debug("[listener] Helius API %d", resp.status_code)
                return []
            data = resp.json()
            return data if isinstance(data, list) else []
    except Exception as exc:
        logger.debug("[listener] fetch error: %s", exc)
        _stats["errors"] += 1
        return []


def _extract_graduated_token(tx: dict) -> Optional[dict]:
    """Extract the graduated token mint and deployer from a CREATE_POOL tx."""
    transfers = tx.get("tokenTransfers", [])
    fee_payer = tx.get("feePayer", "")
    sig = tx.get("signature", "")
    timestamp = tx.get("timestamp")

    # Find the non-SOL token mint in transfers
    for t in transfers:
        mint = t.get("mint", "")
        if mint and mint not in _SKIP_MINTS and _B58_RE.match(mint):
            # The fromUserAccount or toUserAccount may hint at the deployer
            from_acc = t.get("fromUserAccount", "")
            return {
                "mint": mint,
                "deployer": from_acc or fee_payer,
                "signature": sig,
                "timestamp": timestamp,
                "amount": t.get("tokenAmount"),
            }

    return None


# ── Triage ────────────────────────────────────────────────────────────────────

async def _triage_token(mint: str, deployer: str) -> dict:
    """Quick risk assessment with 7 independent signals.

    Designed to catch factory-deployed scam tokens where the visible deployer
    is a fresh wallet with no history.  Signals:
    1. Deployer rug history (classic — fails against factories)
    2. Operator DNA fingerprint (metadata pattern matching)
    3. Deployer wallet age < 24h (fresh wallet = disposable)
    4. Deployer SOL funding trace (funded by known scammer?)
    5. Factory rhythm (deployer launched many tokens recently)
    6. Bundle activity (coordinated launch wallets / team extraction)
    7. Always escalate → run pipeline on EVERY graduated token
    """
    risk_signals: list[str] = []
    deployer_profile = None

    # ── Signal 1: Deployer rug history ────────────────────────────────────
    try:
        from .deployer_service import compute_deployer_profile
        dp = await asyncio.wait_for(compute_deployer_profile(deployer), timeout=5.0)
        if dp:
            deployer_profile = dp
            if dp.rug_count > 0:
                risk_signals.append(f"deployer_rugs:{dp.rug_count}")
            if dp.total_tokens_launched >= _MIN_TOKENS_FOR_TRIAGE:
                rate = dp.rug_count / dp.total_tokens_launched
                if rate >= _HIGH_RISK_RUG_RATE:
                    risk_signals.append(f"rug_rate:{rate:.0%}")
            if dp.total_tokens_launched >= 5:
                risk_signals.append(f"serial:{dp.total_tokens_launched}_tokens")
    except Exception:
        pass

    # ── Signal 2: Operator DNA fingerprint (catches factory operators) ────
    dna_fingerprint = None
    try:
        from .metadata_dna_service import compute_dna_fingerprint
        fp = await asyncio.wait_for(compute_dna_fingerprint(mint), timeout=3.0)
        if fp:
            dna_fingerprint = fp
            from .data_sources._clients import cache as _cache
            from .cache import SQLiteCache
            if isinstance(_cache, SQLiteCache):
                db = await _cache._get_conn()
                cur = await db.execute(
                    "SELECT COUNT(*) FROM operator_mappings WHERE fingerprint = ?", (fp,),
                )
                row = await cur.fetchone()
                if row and row[0] > 1:
                    risk_signals.append(f"known_operator:{fp[:12]}")
    except Exception:
        pass

    # ── Signal 3: Fresh deployer wallet (< 24h old) ──────────────────────
    try:
        from .data_sources._clients import get_rpc_client
        rpc = get_rpc_client()
        sigs = await asyncio.wait_for(
            rpc.get_signatures_for_address(deployer, limit=1, sort_order="asc"),
            timeout=5.0,
        )
        if sigs:
            first_ts = sigs[0].get("blockTime", 0)
            if first_ts:
                age_hours = (time.time() - first_ts) / 3600
                if age_hours < 24:
                    risk_signals.append(f"fresh_wallet:{age_hours:.0f}h")
                if age_hours < 2:
                    risk_signals.append("disposable_wallet")
    except Exception:
        pass

    # ── Signal 4: Deployer funded by known scammer ───────────────────────
    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if isinstance(_cache, SQLiteCache):
            db = await _cache._get_conn()
            # Check if deployer received SOL from any wallet in operator_mappings
            cur = await db.execute(
                "SELECT DISTINCT sf.from_address FROM sol_flows sf "
                "INNER JOIN operator_mappings om ON sf.from_address = om.wallet "
                "WHERE sf.to_address = ? LIMIT 3",
                (deployer,),
            )
            funders = await cur.fetchall()
            if funders:
                risk_signals.append(f"funded_by_operator:{funders[0][0][:12]}")
    except Exception:
        pass

    # ── Signal 5: Factory rhythm (many tokens from same deployer recently) ─
    try:
        from .data_sources._clients import event_query
        recent = await event_query(
            where="deployer = ? AND event_type = 'token_created' AND recorded_at > ?",
            params=(deployer, time.time() - 7 * 86400),  # last 7 days
            limit=50,
        )
        if len(recent) >= 3:
            risk_signals.append(f"factory_rhythm:{len(recent)}_tokens_7d")
    except Exception:
        pass

    # ── Signal 6: Bundle activity (coordinated launch wallets) ────────────
    try:
        from .bundle_tracker_service import analyze_bundle
        bundle = await asyncio.wait_for(analyze_bundle(mint, deployer), timeout=10.0)
        if bundle:
            verdict = bundle.overall_verdict
            bw_count = bundle.bundle_wallet_count or 0
            extracted = bundle.total_extracted_sol or 0
            if verdict in ("confirmed_team_extraction", "suspected_team_extraction"):
                risk_signals.append(f"bundle:{verdict}:{bw_count}w:{extracted:.1f}sol")
            elif verdict == "coordinated_dump_unknown_team" and bw_count >= 3:
                risk_signals.append(f"bundle:coordinated_dump:{bw_count}w")
            elif bw_count >= 5:
                risk_signals.append(f"bundle:large_cluster:{bw_count}w")
    except Exception:
        pass

    # ── Decision: ALWAYS escalate graduated tokens ────────────────────────
    # Every token that graduates to a DEX has real liquidity and real traders
    # at risk. The full forensic pipeline is the only way to catch factory-
    # deployed scams where the deployer is a fresh, clean wallet.
    # The triage signals above determine PRIORITY, not whether to escalate.
    return {
        "escalate": True,  # Always run full pipeline on graduated tokens
        "risk_signals": risk_signals if risk_signals else ["graduated_no_prior_signals"],
        "deployer_profile": deployer_profile,
        "dna_fingerprint": dna_fingerprint,
    }


# ── Process graduated token ───────────────────────────────────────────────────

async def _process_graduated_token(token_info: dict) -> None:
    """Record, triage, and optionally escalate a graduated token."""
    mint = token_info["mint"]
    deployer = token_info["deployer"]

    logger.info(
        "[listener] GRADUATED: %s (deployer=%s)",
        mint[:16], deployer[:12],
    )
    _stats["total_detected"] += 1

    # Add to recent graduations buffer (for REST endpoint)
    _recent_graduations.insert(0, {
        "mint": mint,
        "deployer": deployer,
        "timestamp": time.time(),
        "signature": token_info.get("signature", ""),
        "name": "",
        "symbol": "",
        "image_uri": "",
    })
    if len(_recent_graduations) > _MAX_RECENT:
        _recent_graduations[:] = _recent_graduations[:_MAX_RECENT]

    # Record event in intelligence DB
    try:
        from .data_sources._clients import event_insert
        await event_insert(
            event_type="token_created", mint=mint, deployer=deployer,
            launch_platform="pump_fun", lifecycle_stage="dex_live",
            market_surface="dex_active", recorded_at=time.time(),
        )
    except Exception:
        pass

    # Bootstrap deployer history in background
    try:
        from .lineage_detector import _bootstrap_deployer_history
        asyncio.create_task(
            _bootstrap_deployer_history(deployer),
            name=f"boot_{deployer[:8]}",
        )
    except Exception:
        pass

    # Triage
    triage = await _triage_token(mint, deployer)
    if triage["escalate"]:
        _stats["total_escalated"] += 1
        logger.info(
            "[listener] ESCALATING %s — %s",
            mint[:16], ", ".join(triage["risk_signals"]),
        )

        # Enrich with token metadata (name, symbol, image) from DexScreener
        token_name = ""
        token_symbol = ""
        token_image = ""
        try:
            from .data_sources._clients import get_dex_client
            dex = get_dex_client()
            pairs = await asyncio.wait_for(dex.get_token_pairs(mint), timeout=5.0)
            if pairs:
                meta = dex.pairs_to_metadata(mint, pairs)
                token_name = meta.name or ""
                token_symbol = meta.symbol or ""
                token_image = meta.image_uri or ""
        except Exception:
            pass

        # Update the recent graduations buffer with enriched metadata
        for g in _recent_graduations:
            if g.get("mint") == mint:
                g["name"] = token_name
                g["symbol"] = token_symbol
                g["image_uri"] = token_image
                break

        # Alert ALL connected users (global broadcast)
        try:
            from .alert_service import _broadcast_web_alert, _web_clients

            dp = triage.get("deployer_profile")
            signals = triage["risk_signals"]
            has_risk = any(s != "graduated_no_prior_signals" for s in signals)
            rug_info = (
                f"{dp.rug_count}/{dp.total_tokens_launched} rugs"
                if dp else "new deployer"
            )
            display_name = token_name or token_symbol or mint[:8]

            payload = {
                "event": "alert",
                "type": "token_graduated",
                "title": f"{display_name}" + (f" ⚠️" if has_risk else " 🎓"),
                "body": f"Graduated to DEX — deployer ({rug_info})",
                "message": f"Graduated to DEX — deployer ({rug_info})",
                "token_name": display_name,
                "mint": mint,
                "deployer": deployer,
                "image_uri": token_image,
                "risk_signals": signals,
            }

            # Broadcast to ALL connected WebSocket users
            for uid in list(_web_clients.keys()):
                try:
                    await _broadcast_web_alert(payload, user_id=uid)
                except Exception:
                    pass

            # FCM push only to users who already investigated a token from this deployer
            from .alert_service import _push_fcm_to_deployer_investigators
            asyncio.create_task(
                _push_fcm_to_deployer_investigators(
                    deployer=deployer,
                    title=f"{display_name} — deployer suivi vient de graduer",
                    body=f"Nouveau token sur Raydium — {rug_info}",
                    data={"type": "deployer_graduation", "mint": mint, "deployer": deployer},
                ),
                name=f"fcm_dep_{deployer[:8]}",
            )

        except Exception as exc:
            logger.debug("[listener] alert dispatch error: %s", exc)

        # Run full forensic pipeline in background and record memory episode
        async def _run_pipeline():
            try:
                from .forensic_pipeline import run_forensic_pipeline, report_to_lineage_result
                report = None
                async for evt in run_forensic_pipeline(mint):
                    if isinstance(evt, dict) and evt.get("event") == "_report":
                        report = evt["data"]
                logger.info("[listener] pipeline done: %s", mint[:16])

                # Record memory episode so the agent learns from every graduation
                if report is not None:
                    try:
                        from .memory_service import record_episode
                        from .ai_analyst import _heuristic_score
                        scan_data = report_to_lineage_result(report)
                        scan_dict = scan_data.__dict__ if hasattr(scan_data, "__dict__") else {}
                        dp = report.deployer_profile
                        op = report.operator_fingerprint
                        op_fp = (op.fingerprint if hasattr(op, "fingerprint") else None) if op else None
                        cr = report.cartel_report
                        community_id = None
                        if cr and hasattr(cr, "deployer_community") and cr.deployer_community:
                            community_id = getattr(cr.deployer_community, "community_id", None)
                        computed_score = _heuristic_score(
                            lineage=report.family_tree,
                            bundle=report.bundle_report,
                            sol_flow=report.sol_flow,
                            behavioral_signals=None,
                        )
                        await record_episode(
                            mint=mint,
                            verdict={
                                "risk_score": computed_score,
                                "confidence": "medium" if computed_score > 30 else "low",
                                "rug_pattern": "graduation_scan",
                                "verdict_summary": "Auto-scan on DEX graduation",
                                "conviction_chain": "",
                                "key_findings": triage["risk_signals"],
                                "model": "heuristic_graduation",
                            },
                            scan_data=scan_dict,
                            deployer=deployer,
                            operator_fp=op_fp,
                            community_id=community_id,
                        )
                        logger.info("[listener] memory episode recorded: %s", mint[:16])
                    except Exception as mem_exc:
                        logger.debug("[listener] memory record failed %s: %s", mint[:16], mem_exc)
            except Exception as e:
                logger.warning("[listener] pipeline error %s: %s", mint[:16], e)

        asyncio.create_task(_run_pipeline(), name=f"pipeline_{mint[:8]}")
    else:
        logger.debug("[listener] %s — triage clean, no escalation", mint[:16])


# ── Polling loop ──────────────────────────────────────────────────────────────

async def _poll_loop() -> None:
    """Poll Helius for new Pump.fun graduations every 10 seconds."""
    global _last_tx_sig

    if not _HELIUS_API_KEY:
        logger.warning("[listener] no Helius API key — listener disabled")
        return

    import sys
    print(f"[LISTENER] Starting pump_fun graduation listener (key={_HELIUS_API_KEY[:8]}...)", flush=True)
    logger.warning(
        "[listener] STARTED — polling Pump.fun graduations every %ds (key=%s...)",
        _POLL_INTERVAL, _HELIUS_API_KEY[:8],
    )

    # Warm up: get the latest signature to avoid processing old data
    initial = await _fetch_recent_graduations()
    if initial:
        _last_tx_sig = initial[0].get("signature")
        logger.warning(
            "[listener] warm-up: %d recent graduations, starting from %s",
            len(initial), _last_tx_sig[:16] if _last_tx_sig else "none",
        )
    else:
        logger.warning("[listener] warm-up: no recent graduations found — API may be failing")

    while True:
        try:
            txs = await _fetch_recent_graduations()
            if not txs:
                await asyncio.sleep(_POLL_INTERVAL)
                continue

            # Process only NEW transactions (after _last_tx_sig)
            new_txs = []
            for tx in txs:
                sig = tx.get("signature", "")
                if sig == _last_tx_sig:
                    break  # Reached the last known tx
                new_txs.append(tx)

            if new_txs:
                logger.info("[listener] poll: %d new graduations found", len(new_txs))

            # Update last known signature
            if txs:
                _last_tx_sig = txs[0].get("signature")

            # Process new graduations (oldest first)
            for tx in reversed(new_txs):
                sig = tx.get("signature", "")
                if sig in _seen_mints:
                    continue
                _seen_mints[sig] = time.monotonic()

                token_info = _extract_graduated_token(tx)
                if not token_info:
                    logger.debug("[listener] no token extracted from %s", sig[:16])
                    continue

                mint = token_info["mint"]
                if mint in _seen_mints:
                    continue
                _seen_mints[mint] = time.monotonic()

                # Process in background (don't block the poll loop)
                asyncio.create_task(
                    _process_graduated_token(token_info),
                    name=f"grad_{mint[:8]}",
                )

            # Prune dedup cache (keep last 10 min)
            if len(_seen_mints) > 1000:
                now = time.monotonic()
                stale = [k for k, v in _seen_mints.items() if now - v > 600]
                for k in stale:
                    del _seen_mints[k]

        except asyncio.CancelledError:
            logger.info(
                "[listener] stopped (detected=%d, escalated=%d)",
                _stats["total_detected"], _stats["total_escalated"],
            )
            return
        except Exception as exc:
            logger.warning("[listener] poll error: %s", exc)
            _stats["errors"] += 1

        await asyncio.sleep(_POLL_INTERVAL)


# ── Public API ────────────────────────────────────────────────────────────────

def schedule_pump_fun_listener() -> Optional[asyncio.Task]:
    """Start the background graduation listener.

    Uses a file lock to ensure only ONE worker runs the listener across
    all uvicorn workers (multi-process safe).
    """
    global _listener_task
    if not _HELIUS_API_KEY:
        logger.info("[listener] no Helius API key found — listener disabled")
        return None
    if _listener_task is not None and not _listener_task.done():
        return _listener_task

    # File-based lock: only one worker gets the lock
    import fcntl
    lock_path = "/tmp/lineage_listener.lock"
    try:
        lock_fd = open(lock_path, "w")
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Got the lock — this worker runs the listener
        lock_fd.write(str(os.getpid()))
        lock_fd.flush()
    except (BlockingIOError, OSError):
        # Another worker already has the lock — skip
        logger.info("[listener] another worker holds the lock — skipping")
        return None

    _listener_task = asyncio.create_task(_poll_loop(), name="pump_fun_listener")
    return _listener_task


def cancel_pump_fun_listener() -> None:
    """Stop the background graduation listener."""
    global _listener_task
    if _listener_task is not None and not _listener_task.done():
        _listener_task.cancel()
    _listener_task = None


def is_listener_active() -> bool:
    """Return True if the listener task is running."""
    return _listener_task is not None and not _listener_task.done()


def get_listener_stats() -> dict:
    """Return listener statistics."""
    return {
        "active": is_listener_active(),
        "total_detected": _stats["total_detected"],
        "total_escalated": _stats["total_escalated"],
        "errors": _stats["errors"],
        "seen_cache_size": len(_seen_mints),
    }


def get_recent_graduations(limit: int = 20) -> list[dict]:
    """Return the most recent graduated tokens (for REST polling)."""
    return _recent_graduations[:limit]
