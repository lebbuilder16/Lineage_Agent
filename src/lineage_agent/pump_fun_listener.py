"""
Real-time Pump.fun DEX graduation detector.

Polls Helius RPC every 10 seconds for new Raydium pool initializations
that involve Pump.fun tokens (= tokens that just graduated to DEX).

Only processes GRADUATED tokens — not every Pump.fun token creation.
This is the high-signal, low-noise approach:
- ~50-200 graduations/day vs ~5000+ creations/day
- Graduated tokens have real liquidity and real traders at risk

Flow:
1. Poll getSignaturesForAddress on Raydium AMM program
2. Filter for pool initialization transactions
3. Extract the token mint from the new pool
4. Triage: check deployer history + DNA fingerprint
5. Escalate if suspicious → full forensic pipeline + alerts
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

_RPC_URL = os.environ.get("SOLANA_RPC_ENDPOINT", "")
_PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm"
_RAYDIUM_AMM = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"

# Poll interval
_POLL_INTERVAL = 10  # seconds
_HIGH_RISK_RUG_RATE = 0.5
_MIN_TOKENS_FOR_TRIAGE = 2
_MAX_TOKENS_PER_MINUTE = 20

# State
_listener_task: Optional[asyncio.Task] = None
_last_signature: Optional[str] = None
_token_timestamps: list[float] = []
_seen_mints: dict[str, float] = {}

_B58_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


# ── RPC helpers ───────────────────────────────────────────────────────────────

async def _rpc_call(method: str, params: list, timeout: float = 10) -> dict | None:
    """Make a JSON-RPC call to the Solana RPC endpoint."""
    if not _RPC_URL:
        return None
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(_RPC_URL, json={
                "jsonrpc": "2.0", "id": 1,
                "method": method, "params": params,
            })
            data = resp.json()
            return data.get("result")
    except Exception as exc:
        logger.debug("[listener] RPC error (%s): %s", method, exc)
        return None


async def _get_recent_signatures(limit: int = 20) -> list[dict]:
    """Get recent transaction signatures for Raydium AMM."""
    params: list = [_RAYDIUM_AMM, {"limit": limit, "commitment": "confirmed"}]
    if _last_signature:
        params[1]["until"] = _last_signature
    result = await _rpc_call("getSignaturesForAddress", params, timeout=15)
    return result or []


async def _get_transaction(signature: str) -> dict | None:
    """Fetch a parsed transaction."""
    result = await _rpc_call("getTransaction", [
        signature,
        {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0, "commitment": "confirmed"},
    ], timeout=10)
    return result


# ── Transaction analysis ──────────────────────────────────────────────────────

def _is_pool_init(tx: dict) -> bool:
    """Check if a transaction is a Raydium pool initialization (not a swap)."""
    meta = tx.get("meta", {})
    log_messages = meta.get("logMessages", [])
    log_text = " ".join(log_messages)

    # Pool init has "Instruction: Initialize2" or "Program log: initialize2" in Raydium context
    if "initialize2" in log_text.lower():
        return True
    # Alternative: check for multiple InitializeMint + InitializeAccount in same tx
    init_count = log_text.lower().count("initializeaccount")
    if init_count >= 3 and _RAYDIUM_AMM in log_text:
        return True
    return False


def _extract_mint_from_pool_init(tx: dict) -> Optional[dict]:
    """Extract the token mint and deployer from a Raydium pool init transaction."""
    try:
        message = tx.get("transaction", {}).get("message", {})
        account_keys = message.get("accountKeys", [])
        instructions = message.get("instructions", [])
        inner_instructions = tx.get("meta", {}).get("innerInstructions", [])

        fee_payer = ""
        if account_keys:
            ak0 = account_keys[0]
            fee_payer = ak0.get("pubkey", ak0) if isinstance(ak0, dict) else str(ak0)

        # Look for the token mint in the instruction accounts
        # In a Raydium pool init, the mint is one of the first accounts
        all_accounts: set[str] = set()
        for ix in instructions:
            for acc in ix.get("accounts", []):
                acc_str = acc.get("pubkey", acc) if isinstance(acc, dict) else str(acc)
                all_accounts.add(acc_str)

        # Also check inner instructions for InitializeMint
        for inner_group in inner_instructions:
            for ix in inner_group.get("instructions", []):
                parsed = ix.get("parsed", {})
                if isinstance(parsed, dict):
                    ix_type = parsed.get("type", "")
                    info = parsed.get("info", {})
                    # InitializeMint tells us the mint address
                    if ix_type == "initializeAccount3" or ix_type == "initializeAccount":
                        mint = info.get("mint", "")
                        if mint and _B58_RE.match(mint):
                            # Skip SOL (WSOL) — we want the token, not SOL
                            if mint != "So11111111111111111111111111111111111111112":
                                return {"mint": mint, "deployer": fee_payer, "name": "", "symbol": ""}

        # Fallback: look for token accounts that aren't SOL or known programs
        known = {_RAYDIUM_AMM, _PUMP_PROGRAM_ID, "11111111111111111111111111111111",
                 "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                 "So11111111111111111111111111111111111111112",
                 "SysvarRent111111111111111111111111111111111"}
        for acc in all_accounts:
            if acc not in known and _B58_RE.match(acc) and acc != fee_payer:
                if acc.endswith("pump"):  # Pump.fun mints end with "pump"
                    return {"mint": acc, "deployer": fee_payer, "name": "", "symbol": ""}

    except Exception as exc:
        logger.debug("[listener] extraction error: %s", exc)
    return None


# ── Rate limiter ──────────────────────────────────────────────────────────────

def _rate_limited() -> bool:
    now = time.monotonic()
    while _token_timestamps and now - _token_timestamps[0] > 60:
        _token_timestamps.pop(0)
    return len(_token_timestamps) >= _MAX_TOKENS_PER_MINUTE


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


# ── Process graduated token ───────────────────────────────────────────────────

async def _process_graduated_token(token_info: dict) -> None:
    mint = token_info["mint"]
    deployer = token_info["deployer"]
    logger.info("[listener] GRADUATED TOKEN: %s (deployer=%s)", mint, deployer[:12])

    # Record event
    try:
        from .data_sources._clients import event_insert
        await event_insert(
            event_type="token_created", mint=mint, deployer=deployer,
            name=token_info.get("name", ""), symbol=token_info.get("symbol", ""),
            launch_platform="pump_fun", lifecycle_stage="dex_live",
            market_surface="dex_active", recorded_at=time.time(),
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
                        "event": "alert", "type": "token_graduated",
                        "title": f"Token graduated to DEX",
                        "body": f"Deployer ({rug_info}) token now trading on Raydium",
                        "mint": mint, "deployer": deployer,
                    }, user_id=uid)
        except Exception:
            pass

        # Full pipeline
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
        logger.debug("[listener] %s — triage clean", mint[:12])


# ── Polling loop ──────────────────────────────────────────────────────────────

async def _poll_loop() -> None:
    """Poll Raydium AMM for new pool initializations every 10 seconds."""
    global _last_signature

    logger.info("[listener] starting graduation poll loop (interval=%ds)", _POLL_INTERVAL)

    # Warm up: get the latest signature to start from
    sigs = await _get_recent_signatures(limit=1)
    if sigs:
        _last_signature = sigs[0].get("signature")
        logger.info("[listener] starting from signature %s", _last_signature[:20] if _last_signature else "none")

    total_detected = 0

    while True:
        try:
            # Get new signatures since last check
            new_sigs = await _get_recent_signatures(limit=30)
            if not new_sigs:
                await asyncio.sleep(_POLL_INTERVAL)
                continue

            # Update last_signature to the most recent
            _last_signature = new_sigs[0].get("signature")

            # Process each new transaction
            for sig_info in reversed(new_sigs):  # oldest first
                sig = sig_info.get("signature", "")
                if not sig or sig_info.get("err"):
                    continue

                # Dedup
                if sig in _seen_mints:
                    continue
                _seen_mints[sig] = time.monotonic()

                # Rate limit
                if _rate_limited():
                    continue

                # Fetch full transaction
                tx = await _get_transaction(sig)
                if not tx:
                    continue

                # Check if this is a pool initialization
                if not _is_pool_init(tx):
                    continue

                # Extract token info
                token_info = _extract_mint_from_pool_init(tx)
                if not token_info:
                    continue

                mint = token_info["mint"]
                if mint in _seen_mints:
                    continue
                _seen_mints[mint] = time.monotonic()

                _token_timestamps.append(time.monotonic())
                total_detected += 1

                # Process in background
                asyncio.create_task(
                    _process_graduated_token(token_info),
                    name=f"grad_{mint[:8]}",
                )

            # Prune dedup cache
            if len(_seen_mints) > 500:
                now = time.monotonic()
                stale = [k for k, v in _seen_mints.items() if now - v > 600]
                for k in stale:
                    del _seen_mints[k]

        except asyncio.CancelledError:
            logger.info("[listener] cancelled (detected %d graduations)", total_detected)
            return
        except Exception as exc:
            logger.warning("[listener] poll error: %s", exc)

        await asyncio.sleep(_POLL_INTERVAL)


# ── Public API ────────────────────────────────────────────────────────────────

def schedule_pump_fun_listener() -> Optional[asyncio.Task]:
    global _listener_task
    if not _RPC_URL:
        logger.info("[listener] no SOLANA_RPC_ENDPOINT — listener disabled")
        return None
    if _listener_task is not None and not _listener_task.done():
        return _listener_task
    _listener_task = asyncio.create_task(_poll_loop(), name="pump_fun_listener")
    logger.info("[listener] Pump.fun graduation listener started")
    return _listener_task

def cancel_pump_fun_listener() -> None:
    global _listener_task
    if _listener_task is not None and not _listener_task.done():
        _listener_task.cancel()
        logger.info("[listener] cancelled")
    _listener_task = None

def is_listener_active() -> bool:
    return _listener_task is not None and not _listener_task.done()
