"""
Real-time Pump.fun token listener via Helius Enhanced WebSocket.

Subscribes to all transactions involving the Pump.fun program and detects
new token creation events. When a new token is found:

1. **Triage** (<3s): Check deployer history + DNA fingerprint
2. **Escalate** if suspicious: Trigger full forensic pipeline (~22s)
3. **Alert**: Push to WebSocket/FCM/Telegram for users watching the deployer

Architecture follows the same background-task pattern as rug_detector.py
(schedule/cancel via lifespan, asyncio.Task, graceful cancellation).

Requires HELIUS_API_KEY environment variable.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

def _resolve_helius_key() -> str:
    """Extract Helius API key from HELIUS_API_KEY or SOLANA_RPC_ENDPOINT."""
    key = os.environ.get("HELIUS_API_KEY", "")
    if key:
        return key
    # Fallback: extract from SOLANA_RPC_ENDPOINT if it's a Helius URL
    rpc = os.environ.get("SOLANA_RPC_ENDPOINT", "")
    if "helius" in rpc and "api-key=" in rpc:
        return rpc.split("api-key=")[-1].split("&")[0]
    return ""

_HELIUS_API_KEY = _resolve_helius_key()
_HELIUS_WS_URL = os.environ.get(
    "HELIUS_WS_URL",
    f"wss://mainnet.helius-rpc.com/?api-key={_HELIUS_API_KEY}" if _HELIUS_API_KEY else "",
)
_PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm"

# Reconnect backoff
_RECONNECT_BASE = 2.0   # seconds
_RECONNECT_MAX = 60.0   # seconds
_RECONNECT_MULTIPLIER = 2.0

# Triage thresholds
_HIGH_RISK_RUG_RATE = 0.5       # 50%+ rug rate → escalate to full pipeline
_MIN_TOKENS_FOR_TRIAGE = 2      # deployer must have ≥2 tokens for meaningful rug rate

# Rate limiter: max tokens to process per minute (avoid flooding the pipeline)
_MAX_TOKENS_PER_MINUTE = 30
_token_timestamps: list[float] = []

# ── Background task handle ────────────────────────────────────────────────────

_listener_task: Optional[asyncio.Task] = None


# ── Token extraction from Pump.fun transaction ───────────────────────────────

def _extract_created_token(tx_data: dict) -> Optional[dict]:
    """Extract new token info from a Pump.fun create transaction.

    Returns {'mint': str, 'deployer': str, 'name': str, 'symbol': str} or None.
    """
    try:
        # Helius Enhanced Transaction format
        description = tx_data.get("description", "")
        tx_type = tx_data.get("type", "")

        # Helius enriches Pump.fun creates as "CREATE" or "SWAP" with specific patterns
        account_data = tx_data.get("accountData", [])
        token_transfers = tx_data.get("tokenTransfers", [])
        instructions = tx_data.get("instructions", [])

        # Method 1: Check native transfers for token creation pattern
        # Pump.fun create txs have a distinct instruction pattern:
        # the deployer sends SOL to the bonding curve PDA
        for inst in instructions:
            program_id = inst.get("programId", "")
            if program_id == _PUMP_PROGRAM_ID:
                # Found a Pump.fun instruction — check inner instructions
                inner = inst.get("innerInstructions", [])
                accounts = inst.get("accounts", [])

                # The mint is typically the 2nd account in a create instruction
                # The deployer is the fee payer
                if len(accounts) >= 3:
                    fee_payer = tx_data.get("feePayer", "")
                    possible_mint = accounts[1] if len(accounts) > 1 else ""

                    # Validate: mint should be a base58 string of 32-44 chars
                    if possible_mint and 32 <= len(possible_mint) <= 44 and fee_payer:
                        return {
                            "mint": possible_mint,
                            "deployer": fee_payer,
                            "name": "",
                            "symbol": "",
                            "signature": tx_data.get("signature", ""),
                        }

        # Method 2: Parse from description (Helius often includes human-readable desc)
        if "created" in description.lower() and _PUMP_PROGRAM_ID in str(instructions):
            fee_payer = tx_data.get("feePayer", "")
            # Try to extract mint from token transfers
            for tt in token_transfers:
                mint = tt.get("mint", "")
                if mint and fee_payer:
                    return {
                        "mint": mint,
                        "deployer": fee_payer,
                        "name": "",
                        "symbol": "",
                        "signature": tx_data.get("signature", ""),
                    }

    except Exception as exc:
        logger.debug("[listener] token extraction error: %s", exc)

    return None


# ── Rate limiter ──────────────────────────────────────────────────────────────

def _rate_limited() -> bool:
    """Return True if we've exceeded the per-minute token processing limit."""
    now = time.monotonic()
    # Prune old timestamps
    while _token_timestamps and now - _token_timestamps[0] > 60:
        _token_timestamps.pop(0)
    return len(_token_timestamps) >= _MAX_TOKENS_PER_MINUTE


# ── Triage: quick risk assessment ─────────────────────────────────────────────

async def _triage_token(mint: str, deployer: str) -> dict:
    """Quick risk assessment for a new token (<3s).

    Returns a dict with triage results:
    - escalate: bool — whether to trigger full forensic pipeline
    - risk_signals: list[str] — reasons for escalation
    - deployer_profile: dict | None
    """
    risk_signals: list[str] = []
    deployer_profile = None

    try:
        from .deployer_service import compute_deployer_profile
        dp = await asyncio.wait_for(
            compute_deployer_profile(deployer),
            timeout=5.0,
        )
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
    except asyncio.TimeoutError:
        logger.debug("[listener] triage timeout for deployer %s", deployer[:12])
    except Exception as exc:
        logger.debug("[listener] triage error: %s", exc)

    # Check operator DNA fingerprint
    try:
        from .metadata_dna_service import compute_dna_fingerprint
        fingerprint = await asyncio.wait_for(
            compute_dna_fingerprint(mint),
            timeout=3.0,
        )
        if fingerprint:
            # Check if this fingerprint matches known operators
            from .data_sources._clients import cache as _cache
            from .cache import SQLiteCache
            if isinstance(_cache, SQLiteCache):
                db = await _cache._get_conn()
                cursor = await db.execute(
                    "SELECT COUNT(*) FROM operator_mappings WHERE fingerprint = ?",
                    (fingerprint,),
                )
                row = await cursor.fetchone()
                if row and row[0] > 1:
                    risk_signals.append(f"known_operator:{fingerprint[:12]}")
    except Exception:
        pass  # best-effort

    escalate = len(risk_signals) > 0
    return {
        "escalate": escalate,
        "risk_signals": risk_signals,
        "deployer_profile": deployer_profile,
    }


# ── Process a detected token ─────────────────────────────────────────────────

async def _process_new_token(token_info: dict) -> None:
    """Process a newly detected Pump.fun token."""
    mint = token_info["mint"]
    deployer = token_info["deployer"]
    sig = token_info.get("signature", "")[:12]

    logger.info("[listener] new token detected: %s (deployer=%s, sig=%s)", mint[:12], deployer[:12], sig)

    # Record the event
    try:
        from .data_sources._clients import event_insert
        await event_insert(
            event_type="token_created",
            mint=mint,
            deployer=deployer,
            name=token_info.get("name", ""),
            symbol=token_info.get("symbol", ""),
            launch_platform="pump_fun",
            lifecycle_stage="launchpad_curve_only",
            market_surface="launchpad_curve_only",
            recorded_at=time.time(),
        )
    except Exception as exc:
        logger.debug("[listener] event_insert error: %s", exc)

    # Bootstrap deployer history (fire-and-forget)
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
        logger.info(
            "[listener] ESCALATING %s — signals: %s",
            mint[:12], ", ".join(triage["risk_signals"]),
        )

        # Alert users watching this deployer
        try:
            from .alert_service import _broadcast_web_alert
            from .data_sources._clients import cache as _cache
            from .cache import SQLiteCache

            if isinstance(_cache, SQLiteCache):
                db = await _cache._get_conn()
                cursor = await db.execute(
                    "SELECT uw.user_id FROM user_watches uw "
                    "WHERE uw.sub_type = 'deployer' AND uw.value = ?",
                    (deployer,),
                )
                watcher_rows = await cursor.fetchall()

                dp = triage.get("deployer_profile")
                rug_info = f"{dp.rug_count}/{dp.total_tokens_launched} rugs" if dp else "unknown history"
                alert_payload = {
                    "event": "alert",
                    "type": "deployer_launch",
                    "title": "New token from watched deployer",
                    "body": f"Deployer ({rug_info}) launched a new token",
                    "mint": mint,
                    "deployer": deployer,
                    "risk_signals": triage["risk_signals"],
                }

                for (uid,) in watcher_rows:
                    await _broadcast_web_alert(alert_payload, user_id=uid)
        except Exception as exc:
            logger.debug("[listener] alert dispatch error: %s", exc)

        # Trigger full forensic pipeline (background, don't block the listener)
        async def _run_pipeline():
            try:
                from .forensic_pipeline import run_forensic_pipeline
                async for _event in run_forensic_pipeline(mint):
                    pass  # consume the stream; results are stored by the pipeline
                logger.info("[listener] pipeline completed for %s", mint[:12])
            except Exception as exc:
                logger.warning("[listener] pipeline failed for %s: %s", mint[:12], exc)

        asyncio.create_task(_run_pipeline(), name=f"pipeline_{mint[:8]}")
    else:
        logger.debug("[listener] %s passed triage — no escalation needed", mint[:12])


# ── WebSocket listener loop ──────────────────────────────────────────────────

async def _ws_listener_loop() -> None:
    """Main WebSocket listener loop with auto-reconnect."""
    import websockets  # type: ignore

    retry_delay = _RECONNECT_BASE
    tokens_processed = 0

    while True:
        if not _HELIUS_WS_URL:
            logger.warning("[listener] HELIUS_API_KEY not set — listener disabled")
            return

        try:
            logger.info("[listener] connecting to Helius WebSocket...")
            async with websockets.connect(
                _HELIUS_WS_URL,
                ping_interval=30,
                ping_timeout=10,
                close_timeout=5,
            ) as ws:
                # Subscribe to Pump.fun program transactions
                subscribe_msg = json.dumps({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "transactionSubscribe",
                    "params": [
                        {
                            "accountInclude": [_PUMP_PROGRAM_ID],
                            "type": "all",
                        },
                        {
                            "commitment": "confirmed",
                            "encoding": "jsonParsed",
                            "transactionDetails": "full",
                            "maxSupportedTransactionVersion": 0,
                        },
                    ],
                })
                await ws.send(subscribe_msg)
                logger.info("[listener] subscribed to Pump.fun program transactions")

                # Reset backoff on successful connection
                retry_delay = _RECONNECT_BASE

                async for raw_msg in ws:
                    try:
                        msg = json.loads(raw_msg)

                        # Skip subscription confirmation
                        if "result" in msg and "id" in msg:
                            logger.debug("[listener] subscription confirmed: %s", msg.get("result"))
                            continue

                        # Extract transaction data
                        params = msg.get("params", {})
                        result = params.get("result", {})
                        tx_data = result.get("transaction", result)

                        if not tx_data or not isinstance(tx_data, dict):
                            continue

                        # Try to extract a new token creation
                        token_info = _extract_created_token(tx_data)
                        if not token_info:
                            continue

                        # Rate limiter
                        if _rate_limited():
                            logger.debug("[listener] rate limited — skipping %s", token_info["mint"][:12])
                            continue

                        _token_timestamps.append(time.monotonic())
                        tokens_processed += 1

                        # Process in background (don't block the listener)
                        asyncio.create_task(
                            _process_new_token(token_info),
                            name=f"detect_{token_info['mint'][:8]}",
                        )

                    except json.JSONDecodeError:
                        continue
                    except Exception as exc:
                        logger.debug("[listener] message processing error: %s", exc)

        except asyncio.CancelledError:
            logger.info("[listener] cancelled — shutting down (processed %d tokens)", tokens_processed)
            return
        except Exception as exc:
            logger.warning("[listener] WebSocket error: %s — reconnecting in %.0fs", exc, retry_delay)
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * _RECONNECT_MULTIPLIER, _RECONNECT_MAX)


# ── Public API (schedule/cancel) ──────────────────────────────────────────────

def schedule_pump_fun_listener() -> Optional[asyncio.Task]:
    """Launch the Pump.fun listener background task.

    Returns the task, or None if HELIUS_API_KEY is not configured.
    """
    global _listener_task

    if not _HELIUS_API_KEY:
        logger.info("[listener] HELIUS_API_KEY not set — Pump.fun listener disabled")
        return None

    if _listener_task is not None and not _listener_task.done():
        return _listener_task

    _listener_task = asyncio.create_task(_ws_listener_loop(), name="pump_fun_listener")
    logger.info("[listener] Pump.fun real-time listener started")
    return _listener_task


def cancel_pump_fun_listener() -> None:
    """Cancel the Pump.fun listener background task."""
    global _listener_task
    if _listener_task is not None and not _listener_task.done():
        _listener_task.cancel()
        logger.info("[listener] Pump.fun listener cancelled")
    _listener_task = None


def is_listener_active() -> bool:
    """Return True if the listener is running."""
    return _listener_task is not None and not _listener_task.done()
