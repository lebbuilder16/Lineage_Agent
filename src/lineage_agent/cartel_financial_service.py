"""
Cartel Financial Graph — "Follow the Money"

Adds 3 financial coordination signals to the cartel detection system:

  6. funding_link   — Pre-deploy SOL funding between deployers (72 h window)
  7. shared_lp      — Same wallet bootstrapped liquidity for tokens from
                       different deployers
  8. sniper_ring    — Same wallets appear among the first buyers across tokens
                       from different deployers

Data is collected incrementally during the cartel sweep and cached in
intelligence_events.extra_json to avoid redundant RPC calls on subsequent runs.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from .data_sources._clients import (
    cartel_edge_upsert,
    event_query,
    event_update,
    get_rpc_client,
)

logger = logging.getLogger(__name__)

# ── Tunables ──────────────────────────────────────────────────────────────────
_FUNDING_WINDOW_HOURS = 72           # look-back for SOL funding before deploy
_MIN_FUNDING_SOL = 0.05              # 0.05 SOL minimum to register as funding
_EARLY_TX_LIMIT = 25                 # first N transactions to scan per token
_SIG_WALK_MAX_PAGES = 5              # max 1000-sig pages to walk per token
_MIN_SNIPER_OVERLAP = 2              # min shared early-buyers to create edge
_SEM_CONCURRENCY = 3                 # concurrent getTransaction calls
_SIGNAL_TIMEOUT = 45.0               # per-signal timeout (seconds)

# ── Infrastructure addresses to skip ─────────────────────────────────────────
_SKIP_ADDRESSES: frozenset[str] = frozenset({
    "11111111111111111111111111111111",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bv",
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM",
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm",
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX",
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    "So11111111111111111111111111111111111111112",
    "Vote111111111111111111111111111111111111111",
    "Stake11111111111111111111111111111111111111",
    "SysvarC1ock11111111111111111111111111111111",
    "SysvarRent111111111111111111111111111111111",
    "ComputeBudget111111111111111111111111111111",
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
})

# DEX / AMM programs whose presence signals LP activity
_LP_PROGRAMS: frozenset[str] = frozenset({
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",  # Raydium AMM v4
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",  # Raydium authority
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",  # Raydium CLMM
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",  # Orca Whirlpool
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",  # Meteora DLMM
    "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",  # Meteora Pools
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm",  # PumpFun
})


# ═══════════════════════════════════════════════════════════════════════════════
#  Low-level helpers
# ═══════════════════════════════════════════════════════════════════════════════

async def _get_earliest_signatures(
    rpc: Any,
    address: str,
    count: int = _EARLY_TX_LIMIT,
    max_pages: int = _SIG_WALK_MAX_PAGES,
) -> list[dict]:
    """Walk backwards through signature pages and return the *earliest* ``count`` sigs.

    Standard ``getSignaturesForAddress`` returns newest-first.  We paginate
    until we reach the final (oldest) page, then return the tail reversed
    into chronological order.
    """
    before: Optional[str] = None
    last_batch: list[dict] = []

    for _ in range(max_pages):
        params: list[Any] = [
            address,
            {"limit": 1000, "commitment": "finalized"},
        ]
        if before:
            params[1]["before"] = before  # type: ignore[index]
        result = await rpc._call(
            "getSignaturesForAddress", params, circuit_protect=False,
        )
        if not result or not isinstance(result, list) or len(result) == 0:
            break
        last_batch = result
        before = result[-1].get("signature")
        if len(result) < 1000:
            break  # final page reached

    if not last_batch:
        return []

    # The tail of the last batch holds the oldest signatures.
    earliest = last_batch[-count:] if len(last_batch) >= count else last_batch
    earliest.reverse()  # → chronological (oldest first)
    return earliest


async def _parse_transaction(
    rpc: Any,
    signature: str,
    target_mint: str = "",
) -> dict[str, Any]:
    """Parse a single transaction for financial participants.

    Returns
    -------
    dict with keys:
        fee_payer          – wallet that paid the tx fee
        signers            – all non-program signers
        sol_transfers      – [{from, to, amount_lamports}]
        token_recipients   – wallet addresses that *received* ``target_mint`` tokens
        involves_lp_program – True if a DEX/LP program was invoked
        block_time         – Unix epoch or None
    """
    tx = await rpc._call(
        "getTransaction",
        [signature, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}],
        circuit_protect=False,
    )
    if not tx or not isinstance(tx, dict):
        return {}

    out: dict[str, Any] = {
        "fee_payer": "",
        "signers": [],
        "sol_transfers": [],
        "token_recipients": [],
        "involves_lp_program": False,
        "block_time": tx.get("blockTime"),
    }

    try:
        message = tx.get("transaction", {}).get("message", {})
        account_keys = message.get("accountKeys", [])
        meta = tx.get("meta", {})

        # ── Signers & fee payer ───────────────────────────────────────────
        program_ids: set[str] = set()
        for key in account_keys:
            if isinstance(key, dict):
                addr = key.get("pubkey", "")
                program_ids.add(addr)
                if key.get("signer") and addr not in _SKIP_ADDRESSES:
                    out["signers"].append(addr)
                    if not out["fee_payer"]:
                        out["fee_payer"] = addr
            elif isinstance(key, str):
                program_ids.add(key)

        out["involves_lp_program"] = bool(program_ids & _LP_PROGRAMS)

        # ── System-program SOL transfers (parsed instructions) ────────────
        all_ix: list[dict] = list(message.get("instructions", []))
        for inner in meta.get("innerInstructions") or []:
            all_ix.extend(inner.get("instructions", []))

        for ix in all_ix:
            parsed = ix.get("parsed")
            if not parsed or not isinstance(parsed, dict):
                continue
            ix_type = parsed.get("type", "")
            info = parsed.get("info", {})

            if ix_type == "transfer" and ix.get("program") == "system":
                src = info.get("source", "")
                dst = info.get("destination", "")
                lam = info.get("lamports", 0)
                if src and dst and lam > 0:
                    out["sol_transfers"].append(
                        {"from": src, "to": dst, "amount_lamports": lam}
                    )

        # ── Token recipients via postTokenBalances ────────────────────────
        if target_mint:
            pre_bals: dict[int, int] = {}
            for b in meta.get("preTokenBalances") or []:
                if b.get("mint") == target_mint:
                    idx = b.get("accountIndex", -1)
                    amt = int(b.get("uiTokenAmount", {}).get("amount", "0"))
                    pre_bals[idx] = amt

            for b in meta.get("postTokenBalances") or []:
                if b.get("mint") != target_mint:
                    continue
                owner = b.get("owner", "")
                if not owner or owner in _SKIP_ADDRESSES:
                    continue
                idx = b.get("accountIndex", -1)
                post_amt = int(b.get("uiTokenAmount", {}).get("amount", "0"))
                pre_amt = pre_bals.get(idx, 0)
                if post_amt > pre_amt:  # received tokens
                    out["token_recipients"].append(owner)
    except Exception:
        logger.debug("Failed to parse tx %s", signature, exc_info=True)

    return out


async def _collect_token_financial_data(
    rpc: Any,
    mint: str,
    deployer: str,
) -> dict[str, Any]:
    """Collect LP providers and early buyers for a single token.

    Result shape::

        {
            "lp_providers": [str, …],    # up to 10
            "early_buyers": [str, …],    # up to 20
            "collected_at": "2025-…",
        }

    The data is persisted in ``intelligence_events.extra_json`` so
    subsequent cartel sweeps skip the RPC calls entirely.
    """
    sigs = await _get_earliest_signatures(rpc, mint)
    if not sigs:
        return {
            "lp_providers": [],
            "early_buyers": [],
            "collected_at": datetime.now(timezone.utc).isoformat(),
        }

    lp_providers: list[str] = []
    early_buyers: list[str] = []
    seen_lp: set[str] = set()
    seen_buyers: set[str] = set()

    sem = asyncio.Semaphore(_SEM_CONCURRENCY)

    async def _process(sig_info: dict) -> Optional[dict]:
        sig = sig_info.get("signature", "")
        if not sig or sig_info.get("err"):
            return None
        async with sem:
            return await _parse_transaction(rpc, sig, target_mint=mint)

    tasks = [_process(s) for s in sigs[:_EARLY_TX_LIMIT]]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for tx_data in results:
        if not isinstance(tx_data, dict) or not tx_data:
            continue

        fee_payer = tx_data.get("fee_payer", "")

        # LP provider: fee payer of a tx involving a DEX program, excluding
        # the deployer themselves (who naturally adds initial liquidity).
        if (
            tx_data.get("involves_lp_program")
            and fee_payer
            and fee_payer != deployer
            and fee_payer not in _SKIP_ADDRESSES
            and fee_payer not in seen_lp
        ):
            seen_lp.add(fee_payer)
            lp_providers.append(fee_payer)

        # Early buyers: wallets that received the target token, excluding
        # the deployer and LP-program interactions.
        for recipient in tx_data.get("token_recipients", []):
            if (
                recipient != deployer
                and recipient not in _SKIP_ADDRESSES
                and recipient not in seen_buyers
            ):
                seen_buyers.add(recipient)
                early_buyers.append(recipient)

    return {
        "lp_providers": lp_providers[:10],
        "early_buyers": early_buyers[:20],
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }


async def _ensure_financial_data(
    rpc: Any,
    mint: str,
    deployer: str,
    existing_extra_json: str | None,
) -> tuple[dict, dict]:
    """Return ``(extra_json_dict, financial_data)`` — cached or freshly collected.

    If financial data is not yet cached in ``extra_json``, runs
    ``_collect_token_financial_data`` and updates the event row.
    """
    ej: dict = {}
    try:
        ej = json.loads(existing_extra_json or "{}")
        if isinstance(ej, str):
            ej = json.loads(ej)
    except Exception:
        ej = {}

    if ej.get("lp_providers") is not None:
        # Already collected — return cached
        return ej, {
            "lp_providers": ej.get("lp_providers", []),
            "early_buyers": ej.get("early_buyers", []),
        }

    # Collect via RPC and persist
    fin_data = await _collect_token_financial_data(rpc, mint, deployer)
    ej["lp_providers"] = fin_data["lp_providers"]
    ej["early_buyers"] = fin_data["early_buyers"]
    ej["financial_collected_at"] = fin_data["collected_at"]

    try:
        await event_update(
            "event_type = 'token_created' AND mint = ? AND deployer = ?",
            params=(mint, deployer),
            extra_json=json.dumps(ej, default=str),
        )
    except Exception:
        logger.debug("Failed to cache financial data for %s", mint, exc_info=True)

    return ej, fin_data


# ═══════════════════════════════════════════════════════════════════════════════
#  Signal 6 — Pre-deploy Funding Links
# ═══════════════════════════════════════════════════════════════════════════════

async def signal_funding_link(deployer: str) -> int:
    """Detect SOL transfers from known deployers to this deployer within
    a 72 h window before its first token launch.

    This is a *refined* version of the existing ``sol_transfer`` signal,
    focused on *pre-deploy* funding that is far more suspicious than generic
    SOL transfers at any time.  The signal strength is weighted by both the
    SOL amount and the temporal proximity to the launch.
    """
    count = 0
    try:
        # ── Earliest deployment timestamp ─────────────────────────────────
        my_events = await event_query(
            "event_type = 'token_created' AND deployer = ?",
            params=(deployer,),
            columns="mint, created_at",
            order_by="created_at ASC",
            limit=1,
        )
        if not my_events:
            return 0

        ts_raw = my_events[0].get("created_at")
        if not ts_raw:
            return 0
        try:
            earliest_deploy = datetime.fromisoformat(
                str(ts_raw).replace("Z", "+00:00")
            )
            if earliest_deploy.tzinfo is None:
                earliest_deploy = earliest_deploy.replace(tzinfo=timezone.utc)
        except Exception:
            return 0

        window_start = earliest_deploy - timedelta(hours=_FUNDING_WINDOW_HOURS)

        # ── Known deployer set ────────────────────────────────────────────
        deployer_rows = await event_query(
            "event_type = 'token_created'",
            columns="deployer",
            limit=10_000,
        )
        known_deployers = {
            r["deployer"] for r in deployer_rows if r.get("deployer")
        }
        known_deployers.discard(deployer)
        if not known_deployers:
            return 0

        # ── Scan deployer's recent signatures ─────────────────────────────
        rpc = get_rpc_client()
        sigs = await rpc._call(
            "getSignaturesForAddress",
            [deployer, {"limit": 200, "commitment": "finalized"}],
            circuit_protect=False,
        )
        if not sigs or not isinstance(sigs, list):
            return 0

        sem = asyncio.Semaphore(_SEM_CONCURRENCY)
        seen: set[str] = set()  # dedup (from_addr, to_addr) pairs

        for sig_info in sigs:
            bt = sig_info.get("blockTime")
            if not bt:
                continue
            sig_ts = datetime.fromtimestamp(bt, tz=timezone.utc)

            # Chronological filter: sigs arrive newest-first
            if sig_ts > earliest_deploy:
                continue
            if sig_ts < window_start:
                break  # past the funding window — stop

            sig = sig_info.get("signature", "")
            if not sig or sig_info.get("err"):
                continue

            async with sem:
                tx_data = await _parse_transaction(rpc, sig)
            if not tx_data:
                continue

            for xfer in tx_data.get("sol_transfers", []):
                from_addr = xfer["from"]
                to_addr = xfer["to"]
                amount_sol = xfer["amount_lamports"] / 1_000_000_000.0

                # Incoming SOL from a known deployer
                if (
                    to_addr == deployer
                    and from_addr in known_deployers
                    and amount_sol >= _MIN_FUNDING_SOL
                ):
                    pair_key = f"{from_addr}:{deployer}"
                    if pair_key in seen:
                        continue
                    seen.add(pair_key)

                    hours_before = max(
                        0.0,
                        (earliest_deploy - sig_ts).total_seconds() / 3600,
                    )
                    amount_factor = min(1.0, amount_sol / 5.0)
                    time_factor = max(0.3, 1.0 - hours_before / _FUNDING_WINDOW_HOURS)
                    strength = round(
                        min(1.0, amount_factor * 0.6 + time_factor * 0.4), 4
                    )

                    await cartel_edge_upsert(
                        from_addr,
                        deployer,
                        "funding_link",
                        strength,
                        {
                            "amount_sol": round(amount_sol, 4),
                            "hours_before_deploy": round(hours_before, 1),
                            "signature": sig,
                            "deploy_ts": earliest_deploy.isoformat(),
                        },
                    )
                    count += 1

                # Outgoing SOL to a known deployer (this deployer funded them)
                if (
                    from_addr == deployer
                    and to_addr in known_deployers
                    and amount_sol >= _MIN_FUNDING_SOL
                ):
                    pair_key = f"{deployer}:{to_addr}"
                    if pair_key in seen:
                        continue
                    seen.add(pair_key)

                    hours_before = max(
                        0.0,
                        (earliest_deploy - sig_ts).total_seconds() / 3600,
                    )
                    strength = round(
                        min(1.0, amount_sol / 5.0) * 0.7, 4
                    )

                    await cartel_edge_upsert(
                        deployer,
                        to_addr,
                        "funding_link",
                        strength,
                        {
                            "amount_sol": round(amount_sol, 4),
                            "hours_before_deploy": round(hours_before, 1),
                            "direction": "outgoing",
                            "signature": sig,
                        },
                    )
                    count += 1

    except Exception:
        logger.exception("signal_funding_link failed for %s", deployer)
    return count


# ═══════════════════════════════════════════════════════════════════════════════
#  Signal 7 — Shared LP Provider
# ═══════════════════════════════════════════════════════════════════════════════

async def signal_shared_lp(deployer: str) -> int:
    """Detect when the same non-deployer wallet provided initial liquidity
    for tokens from this deployer AND tokens from other deployers.

    A shared LP provider is a strong coordination signal — it suggests a
    common backer bankrolling multiple operators.
    """
    count = 0
    try:
        my_events = await event_query(
            "event_type = 'token_created' AND deployer = ?",
            params=(deployer,),
            columns="mint, extra_json",
            limit=50,
        )
        if not my_events:
            return 0

        rpc = get_rpc_client()
        my_lp_map: dict[str, set[str]] = {}  # mint → LP provider wallets

        for ev in my_events:
            mint = ev.get("mint", "")
            if not mint:
                continue
            _, fin = await _ensure_financial_data(
                rpc, mint, deployer, ev.get("extra_json"),
            )
            providers = set(fin.get("lp_providers", []))
            if providers:
                my_lp_map[mint] = providers

        # Flatten all my LP providers
        all_my_lps: set[str] = set()
        for ps in my_lp_map.values():
            all_my_lps.update(ps)

        if not all_my_lps:
            return 0

        # Cross-reference against other deployers' cached data
        other_events = await event_query(
            "event_type = 'token_created' AND deployer != ? "
            "AND extra_json IS NOT NULL",
            params=(deployer,),
            columns="mint, deployer, extra_json",
            limit=5000,
        )

        seen_edges: set[str] = set()

        for oev in other_events:
            od = oev.get("deployer", "")
            om = oev.get("mint", "")
            if not od or not om:
                continue
            try:
                oej = json.loads(oev.get("extra_json") or "{}")
                if isinstance(oej, str):
                    oej = json.loads(oej)
            except Exception:
                continue

            other_lps = set(oej.get("lp_providers", []))
            shared = all_my_lps & other_lps
            if not shared:
                continue

            edge_key = f"{deployer}:{od}"
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)

            for lp_wallet in sorted(shared):
                my_mint = next(
                    (m for m, ps in my_lp_map.items() if lp_wallet in ps),
                    "",
                )
                strength = round(min(1.0, 0.65 + 0.1 * len(shared)), 4)
                await cartel_edge_upsert(
                    deployer,
                    od,
                    "shared_lp",
                    strength,
                    {
                        "lp_wallet": lp_wallet,
                        "my_mint": my_mint,
                        "other_mint": om,
                        "shared_count": len(shared),
                    },
                )
                count += 1
    except Exception:
        logger.exception("signal_shared_lp failed for %s", deployer)
    return count


# ═══════════════════════════════════════════════════════════════════════════════
#  Signal 8 — Sniper Ring
# ═══════════════════════════════════════════════════════════════════════════════

async def signal_sniper_ring(deployer: str) -> int:
    """Detect coordinated early buying — the same wallets appear among the
    first buyers of tokens launched by this deployer AND by other deployers.

    Two or more shared early buyers across operators is a strong indicator of
    a coordinated sniper ring (bots or colluding wallets that ape in at launch
    to pump the price for the deployer's benefit).
    """
    count = 0
    try:
        my_events = await event_query(
            "event_type = 'token_created' AND deployer = ?",
            params=(deployer,),
            columns="mint, extra_json",
            limit=50,
        )
        if not my_events:
            return 0

        rpc = get_rpc_client()
        my_buyers: dict[str, set[str]] = {}  # mint → early buyer wallets

        for ev in my_events:
            mint = ev.get("mint", "")
            if not mint:
                continue
            _, fin = await _ensure_financial_data(
                rpc, mint, deployer, ev.get("extra_json"),
            )
            buyers = set(fin.get("early_buyers", []))
            if buyers:
                my_buyers[mint] = buyers

        # Flatten
        all_my_buyers: set[str] = set()
        for bs in my_buyers.values():
            all_my_buyers.update(bs)

        if len(all_my_buyers) < _MIN_SNIPER_OVERLAP:
            return 0

        # Cross-reference against other deployers' cached data (grouped)
        other_events = await event_query(
            "event_type = 'token_created' AND deployer != ? "
            "AND extra_json IS NOT NULL",
            params=(deployer,),
            columns="mint, deployer, extra_json",
            limit=5000,
        )

        deployer_buyers: dict[str, set[str]] = defaultdict(set)
        deployer_mints: dict[str, list[str]] = defaultdict(list)

        for oev in other_events:
            od = oev.get("deployer", "")
            om = oev.get("mint", "")
            if not od or not om:
                continue
            try:
                oej = json.loads(oev.get("extra_json") or "{}")
                if isinstance(oej, str):
                    oej = json.loads(oej)
            except Exception:
                continue
            ob = set(oej.get("early_buyers", []))
            if ob:
                deployer_buyers[od].update(ob)
                deployer_mints[od].append(om)

        for other_deployer, other_buyer_set in deployer_buyers.items():
            shared = all_my_buyers & other_buyer_set
            if len(shared) < _MIN_SNIPER_OVERLAP:
                continue

            # Strength scales with overlap count
            strength = round(min(1.0, 0.3 + 0.15 * len(shared)), 4)
            await cartel_edge_upsert(
                deployer,
                other_deployer,
                "sniper_ring",
                strength,
                {
                    "shared_buyers": sorted(shared)[:10],
                    "shared_count": len(shared),
                    "my_mints": list(my_buyers.keys())[:5],
                    "other_mints": deployer_mints[other_deployer][:5],
                },
            )
            count += 1
    except Exception:
        logger.exception("signal_sniper_ring failed for %s", deployer)
    return count


# ═══════════════════════════════════════════════════════════════════════════════
#  Aggregate runner
# ═══════════════════════════════════════════════════════════════════════════════

async def build_financial_edges(deployer: str) -> int:
    """Run all 3 financial signals for a deployer.  Returns total edge count."""
    signal_names = ("funding_link", "shared_lp", "sniper_ring")
    results = await asyncio.gather(
        asyncio.wait_for(signal_funding_link(deployer), timeout=_SIGNAL_TIMEOUT),
        asyncio.wait_for(signal_shared_lp(deployer), timeout=_SIGNAL_TIMEOUT),
        asyncio.wait_for(signal_sniper_ring(deployer), timeout=_SIGNAL_TIMEOUT),
        return_exceptions=True,
    )
    total = 0
    for i, r in enumerate(results):
        if isinstance(r, int):
            total += r
        elif isinstance(r, Exception):
            logger.warning(
                "Financial signal %s failed for %s: %s",
                signal_names[i],
                deployer,
                r,
            )
    return total
