"""
Real-time Pump.fun token listener via Solana logsSubscribe WebSocket.

Uses standard Solana RPC `logsSubscribe` (works on ALL endpoints including
Helius, QuickNode, etc.) to detect Pump.fun program activity. When a new
token creation is detected:

1. **Triage** (<3s): Check deployer history + DNA fingerprint
2. **Escalate** if suspicious: Trigger full forensic pipeline (~22s)
3. **Alert**: Push to WebSocket/FCM/Telegram for users watching the deployer

Architecture follows the same background-task pattern as rug_detector.py.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

def _resolve_helius_key() -> str:
    key = os.environ.get("HELIUS_API_KEY", "")
    if key:
        return key
    rpc = os.environ.get("SOLANA_RPC_ENDPOINT", "")
    if "helius" in rpc and "api-key=" in rpc:
        return rpc.split("api-key=")[-1].split("&")[0]
    return ""

def _build_ws_url() -> str:
    """Build WebSocket URL from SOLANA_RPC_ENDPOINT (https → wss)."""
    rpc = os.environ.get("SOLANA_RPC_ENDPOINT", "")
    if rpc.startswith("https://"):
        return "wss://" + rpc[len("https://"):]
    if rpc.startswith("http://"):
        return "ws://" + rpc[len("http://"):]
    return ""

_HELIUS_API_KEY = _resolve_helius_key()
_WS_URL = os.environ.get("HELIUS_WS_URL", _build_ws_url())
_RPC_URL = os.environ.get("SOLANA_RPC_ENDPOINT", "")
_PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm"

# Reconnect backoff
_RECONNECT_BASE = 2.0
_RECONNECT_MAX = 60.0
_RECONNECT_MULTIPLIER = 2.0

# Triage thresholds
_HIGH_RISK_RUG_RATE = 0.5
_MIN_TOKENS_FOR_TRIAGE = 2

# Rate limiter
_MAX_TOKENS_PER_MINUTE = 30
_token_timestamps: list[float] = []

# Dedup: avoid processing same signature twice
_seen_sigs: dict[str, float] = {}
_DEDUP_TTL = 300  # 5 min

# Background task
_listener_task: Optional[asyncio.Task] = None

# Base58 alphabet for validation
_B58_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


# ── Extract mint from Pump.fun logs ──────────────────────────────────────────

async def _resolve_tx_accounts(signature: str) -> Optional[dict]:
    """Fetch transaction details via RPC to extract mint and deployer."""
    if not _RPC_URL:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_RPC_URL, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "getTransaction",
                "params": [signature, {
                    "encoding": "jsonParsed",
                    "maxSupportedTransactionVersion": 0,
                    "commitment": "confirmed",
                }],
            })
            data = resp.json()
            result = data.get("result")
            if not result:
                return None

            tx = result.get("transaction", {})
            msg = tx.get("message", {})
            account_keys = msg.get("accountKeys", [])
            instructions = msg.get("instructions", [])

            # Fee payer = deployer (first account key)
            deployer = ""
            if account_keys:
                ak0 = account_keys[0]
                deployer = ak0.get("pubkey", ak0) if isinstance(ak0, dict) else str(ak0)

            # Find the Pump.fun instruction and extract the mint
            for ix in instructions:
                prog = ix.get("programId", "")
                if prog == _PUMP_PROGRAM_ID:
                    accounts = ix.get("accounts", [])
                    # Pump.fun create: mint is account index 0 in the instruction
                    # The exact index depends on the instruction variant, but typically:
                    # accounts[0] = mint, accounts[1] = mintAuthority/curve, accounts[2] = bondingCurve
                    for acc in accounts[:4]:
                        acc_str = acc.get("pubkey", acc) if isinstance(acc, dict) else str(acc)
                        if _B58_RE.match(acc_str) and acc_str != deployer and acc_str != _PUMP_PROGRAM_ID:
                            # Likely the mint — verify it's not a known system program
                            if not acc_str.startswith("1111") and not acc_str.startswith("Token"):
                                return {
                                    "mint": acc_str,
                                    "deployer": deployer,
                                    "signature": signature,
                                    "name": "",
                                    "symbol": "",
                                }
            return None
    except Exception as exc:
        logger.debug("[listener] getTransaction error for %s: %s", signature[:12], exc)
        return None


def _is_create_log(logs: list[str]) -> bool:
    """Check if logs indicate a Pump.fun token creation (not a swap/buy/sell)."""
    # Pump.fun create instructions produce specific log patterns:
    # "Program 6EF8... invoke [1]" + "Program log: Instruction: Create" or
    # InitializeMint-related logs
    log_text = " ".join(logs)
    # Look for creation indicators
    if "InitializeMint" in log_text or "Instruction: Create" in log_text:
        return True
    if "Instruction: Initialize" in log_text and _PUMP_PROGRAM_ID in log_text:
        return True
    return False


# ── Rate limiter ──────────────────────────────────────────────────────────────

def _rate_limited() -> bool:
    now = time.monotonic()
    while _token_timestamps and now - _token_timestamps[0] > 60:
        _token_timestamps.pop(0)
    return len(_token_timestamps) >= _MAX_TOKENS_PER_MINUTE


def _prune_seen():
    now = time.monotonic()
    stale = [k for k, v in _seen_sigs.items() if now - v > _DEDUP_TTL]
    for k in stale:
        del _seen_sigs[k]


# ── Triage ────────────────────────────────────────────────────────────────────

async def _triage_token(mint: str, deployer: str) -> dict:
    risk_signals: list[str] = []
    deployer_profile = None

    try:
        from .deployer_service import compute_deployer_profile
        dp = await asyncio.wait_for(compute_deployer_profile(deployer), timeout=5.0)
        if dp:
            deployer_profile = dp
            if dp.rug_count > 0:
                risk_signals.append(f"deployer_has_rugs:{dp.rug_count}")
            if dp.total_tokens_launched >= _MIN_TOKENS_FOR_TRIAGE:
                rate = dp.rug_count / dp.total_tokens_launched
                if rate >= _HIGH_RISK_RUG_RATE:
                    risk_signals.append(f"high_rug_rate:{rate:.0%}")
            if dp.total_tokens_launched >= 5:
                risk_signals.append(f"serial_deployer:{dp.total_tokens_launched}")
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
                cur = await db.execute("SELECT COUNT(*) FROM operator_mappings WHERE fingerprint = ?", (fp,))
                row = await cur.fetchone()
                if row and row[0] > 1:
                    risk_signals.append(f"known_operator:{fp[:12]}")
    except Exception:
        pass

    return {"escalate": len(risk_signals) > 0, "risk_signals": risk_signals, "deployer_profile": deployer_profile}


# ── Process detected token ────────────────────────────────────────────────────

async def _process_new_token(token_info: dict) -> None:
    mint = token_info["mint"]
    deployer = token_info["deployer"]
    logger.info("[listener] NEW TOKEN: %s (deployer=%s)", mint[:12], deployer[:12])

    # Record event
    try:
        from .data_sources._clients import event_insert
        await event_insert(
            event_type="token_created", mint=mint, deployer=deployer,
            name=token_info.get("name", ""), symbol=token_info.get("symbol", ""),
            launch_platform="pump_fun", lifecycle_stage="launchpad_curve_only",
            market_surface="launchpad_curve_only", recorded_at=time.time(),
        )
    except Exception:
        pass

    # Bootstrap deployer history
    try:
        from .lineage_detector import _bootstrap_deployer_history
        asyncio.create_task(_bootstrap_deployer_history(deployer), name=f"boot_{deployer[:8]}")
    except Exception:
        pass

    # Triage
    triage = await _triage_token(mint, deployer)
    if triage["escalate"]:
        logger.info("[listener] ESCALATING %s — %s", mint[:12], ", ".join(triage["risk_signals"]))

        # Alert watchers
        try:
            from .alert_service import _broadcast_web_alert
            from .data_sources._clients import cache as _cache
            from .cache import SQLiteCache
            if isinstance(_cache, SQLiteCache):
                db = await _cache._get_conn()
                cur = await db.execute(
                    "SELECT uw.user_id FROM user_watches uw WHERE uw.sub_type = 'deployer' AND uw.value = ?",
                    (deployer,),
                )
                dp = triage.get("deployer_profile")
                rug_info = f"{dp.rug_count}/{dp.total_tokens_launched} rugs" if dp else "unknown"
                for (uid,) in await cur.fetchall():
                    await _broadcast_web_alert({
                        "event": "alert", "type": "deployer_launch",
                        "title": "New token from watched deployer",
                        "body": f"Deployer ({rug_info}) launched a new token",
                        "mint": mint, "deployer": deployer,
                    }, user_id=uid)
        except Exception:
            pass

        # Full pipeline (background)
        async def _pipeline():
            try:
                from .forensic_pipeline import run_forensic_pipeline
                async for _ in run_forensic_pipeline(mint):
                    pass
                logger.info("[listener] pipeline done for %s", mint[:12])
            except Exception as e:
                logger.warning("[listener] pipeline failed for %s: %s", mint[:12], e)
        asyncio.create_task(_pipeline(), name=f"pipeline_{mint[:8]}")
    else:
        logger.debug("[listener] %s — triage clean, no escalation", mint[:12])


# ── WebSocket listener (logsSubscribe) ────────────────────────────────────────

async def _ws_listener_loop() -> None:
    """Listen for Pump.fun logs via standard Solana RPC logsSubscribe."""
    import websockets

    retry_delay = _RECONNECT_BASE
    total_detected = 0

    while True:
        if not _WS_URL:
            logger.warning("[listener] no WebSocket URL — listener disabled")
            return

        try:
            logger.info("[listener] connecting to %s...", _WS_URL[:40])
            async with websockets.connect(_WS_URL, ping_interval=30, ping_timeout=10, close_timeout=5) as ws:
                # Subscribe to Pump.fun program logs
                sub = json.dumps({
                    "jsonrpc": "2.0", "id": 1,
                    "method": "logsSubscribe",
                    "params": [
                        {"mentions": [_PUMP_PROGRAM_ID]},
                        {"commitment": "confirmed"},
                    ],
                })
                await ws.send(sub)
                logger.info("[listener] subscribed to Pump.fun logs (logsSubscribe)")
                retry_delay = _RECONNECT_BASE

                async for raw_msg in ws:
                    try:
                        msg = json.loads(raw_msg)

                        # Subscription confirmation
                        if "result" in msg and "id" in msg:
                            logger.info("[listener] subscription confirmed (id=%s)", msg.get("result"))
                            continue

                        # Extract log notification
                        params = msg.get("params", {})
                        result = params.get("result", {})
                        value = result.get("value", {})

                        signature = value.get("signature", "")
                        logs = value.get("logs", [])
                        err = value.get("err")

                        # Skip failed transactions
                        if err is not None:
                            continue
                        if not signature or not logs:
                            continue

                        # Dedup
                        if signature in _seen_sigs:
                            continue
                        _seen_sigs[signature] = time.monotonic()

                        # Periodically prune dedup cache
                        if len(_seen_sigs) > 1000:
                            _prune_seen()

                        # Only process token CREATION logs (not swaps/buys/sells)
                        if not _is_create_log(logs):
                            continue

                        # Rate limit
                        if _rate_limited():
                            continue

                        _token_timestamps.append(time.monotonic())

                        # Resolve tx details in background
                        async def _handle(sig: str):
                            token_info = await _resolve_tx_accounts(sig)
                            if token_info:
                                total_detected_local = total_detected  # capture for logging
                                await _process_new_token(token_info)

                        asyncio.create_task(_handle(signature), name=f"resolve_{signature[:8]}")

                    except json.JSONDecodeError:
                        continue
                    except Exception as exc:
                        logger.debug("[listener] msg error: %s", exc)

        except asyncio.CancelledError:
            logger.info("[listener] cancelled (total detected: %d)", total_detected)
            return
        except Exception as exc:
            logger.warning("[listener] WS error: %s — reconnecting in %.0fs", exc, retry_delay)
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * _RECONNECT_MULTIPLIER, _RECONNECT_MAX)


# ── Public API ────────────────────────────────────────────────────────────────

def schedule_pump_fun_listener() -> Optional[asyncio.Task]:
    global _listener_task
    if not _WS_URL:
        logger.info("[listener] no WS URL — Pump.fun listener disabled")
        return None
    if _listener_task is not None and not _listener_task.done():
        return _listener_task
    _listener_task = asyncio.create_task(_ws_listener_loop(), name="pump_fun_listener")
    logger.info("[listener] Pump.fun real-time listener started")
    return _listener_task

def cancel_pump_fun_listener() -> None:
    global _listener_task
    if _listener_task is not None and not _listener_task.done():
        _listener_task.cancel()
        logger.info("[listener] cancelled")
    _listener_task = None

def is_listener_active() -> bool:
    return _listener_task is not None and not _listener_task.done()
