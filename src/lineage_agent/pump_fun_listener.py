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

_POLL_INTERVAL = 10        # seconds
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
    """Quick risk assessment: deployer history + DNA fingerprint."""
    risk_signals: list[str] = []
    deployer_profile = None

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

    try:
        from .metadata_dna_service import compute_dna_fingerprint
        fp = await asyncio.wait_for(compute_dna_fingerprint(mint), timeout=3.0)
        if fp:
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

    return {
        "escalate": len(risk_signals) > 0,
        "risk_signals": risk_signals,
        "deployer_profile": deployer_profile,
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

        # Alert users who watch this deployer
        try:
            from .alert_service import _broadcast_web_alert
            from .data_sources._clients import cache as _cache
            from .cache import SQLiteCache
            if isinstance(_cache, SQLiteCache):
                db = await _cache._get_conn()
                cur = await db.execute(
                    "SELECT uw.user_id FROM user_watches uw "
                    "WHERE uw.sub_type = 'deployer' AND uw.value = ?",
                    (deployer,),
                )
                dp = triage.get("deployer_profile")
                rug_info = (
                    f"{dp.rug_count}/{dp.total_tokens_launched} rugs"
                    if dp else "unknown history"
                )
                payload = {
                    "event": "alert",
                    "type": "token_graduated",
                    "title": "Watched deployer launched on DEX",
                    "body": f"Deployer ({rug_info}) — token now live on Raydium",
                    "mint": mint,
                    "deployer": deployer,
                    "risk_signals": triage["risk_signals"],
                }
                for (uid,) in await cur.fetchall():
                    await _broadcast_web_alert(payload, user_id=uid)
        except Exception as exc:
            logger.debug("[listener] alert dispatch error: %s", exc)

        # Run full forensic pipeline in background
        async def _run_pipeline():
            try:
                from .forensic_pipeline import run_forensic_pipeline
                async for _ in run_forensic_pipeline(mint):
                    pass
                logger.info("[listener] pipeline done: %s", mint[:16])
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

    logger.info(
        "[listener] started — polling Pump.fun graduations every %ds (key=%s...)",
        _POLL_INTERVAL, _HELIUS_API_KEY[:8],
    )

    # Warm up: get the latest signature to avoid processing old data
    initial = await _fetch_recent_graduations()
    if initial:
        _last_tx_sig = initial[0].get("signature")
        logger.info(
            "[listener] warm-up: %d recent graduations, starting from %s",
            len(initial), _last_tx_sig[:16] if _last_tx_sig else "none",
        )

    while True:
        try:
            txs = await _fetch_recent_graduations()
            if not txs:
                await asyncio.sleep(_POLL_INTERVAL)
                continue

            # Process only NEW transactions (ones we haven't seen)
            new_txs = []
            for tx in txs:
                sig = tx.get("signature", "")
                if sig == _last_tx_sig:
                    break  # Reached the last known tx
                if sig not in _seen_mints:
                    new_txs.append(tx)

            # Update last known signature
            if txs:
                _last_tx_sig = txs[0].get("signature")

            # Process new graduations (oldest first)
            for tx in reversed(new_txs):
                sig = tx.get("signature", "")
                _seen_mints[sig] = time.monotonic()

                token_info = _extract_graduated_token(tx)
                if not token_info:
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
    """Start the background graduation listener."""
    global _listener_task
    if not _HELIUS_API_KEY:
        logger.info("[listener] no Helius API key found — listener disabled")
        return None
    if _listener_task is not None and not _listener_task.done():
        return _listener_task
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
