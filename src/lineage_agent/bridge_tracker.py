"""
Cross-chain exit tracker.

Detects when SOL flows into a bridge program and looks up the corresponding
cross-chain transfer via the Wormholescan public API.

Supported bridges:
  - Wormhole (Core + Token Bridge)
  - Mayan Finance (Swift)
  - Allbridge Core
  - deBridge

The Wormholescan API is public; no API key is required.
Base URL: https://api.wormholescan.io
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_WORMHOLE_API = "https://api.wormholescan.io/api/v1"

# Wormhole chain-ID → human name
_CHAIN_NAMES: dict[int, str] = {
    1:  "Solana",
    2:  "Ethereum",
    4:  "BSC",
    5:  "Polygon",
    6:  "Avalanche",
    10: "Fantom",
    13: "Klaytn",
    14: "Celo",
    15: "Near",
    16: "Moonbeam",
    23: "Arbitrum",
    24: "Optimism",
    30: "Base",
    34: "Scroll",
}

# Bridge program addresses on Solana → bridge name
_BRIDGE_PROGRAMS: dict[str, str] = {
    "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth": "Wormhole Core",
    "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb": "Wormhole Token Bridge",
    "WnFt12ZrnzZrFZkt2xsNsaNWoQribnuQ5B5FrDbwDhD":  "Wormhole NFT Bridge",
    "FC4eXxkyrMPTjiYUnNE9Cn6YBnKCm9T5XpEWFkUuQj8b": "Mayan Swift",
    "BrdgJPALFgxpQStMyf5MBoHWmZQMvNiRJvs2BpBXFVU":  "Allbridge Core",
    "DEbrdgQsVUG4vNW8fM5bX9kzZNFu2VZPsEBHvMYHovTF": "deBridge",
}


def is_bridge_program(address: str) -> bool:
    """Return True if the address is a known bridge program."""
    return address in _BRIDGE_PROGRAMS


@dataclass
class CrossChainExit:
    """A detected cross-chain capital exit."""
    from_address: str           # Solana wallet that triggered the bridge tx
    bridge_name: str            # Human-readable bridge name
    dest_chain: str             # Destination chain name (e.g. "Ethereum")
    dest_address: str           # Destination wallet address on the target chain
    amount_sol: float           # SOL amount bridged
    tx_signature: str           # Solana transaction signature


# ---------------------------------------------------------------------------
# Internal Wormholescan helpers
# ---------------------------------------------------------------------------

async def _fetch_wormhole_operations(
    client: httpx.AsyncClient,
    wallet: str,
) -> list[dict]:
    """Query Wormholescan for all operations emitted from a Solana wallet."""
    try:
        resp = await client.get(
            f"{_WORMHOLE_API}/operations",
            params={"address": wallet, "limit": "10"},
            timeout=8.0,
        )
        if resp.status_code != 200:
            logger.debug("Wormholescan %s -> HTTP %s", wallet, resp.status_code)
            return []
        data = resp.json()
        return data.get("operations", [])
    except Exception as exc:
        logger.debug("Wormholescan fetch failed for %s: %s", wallet, exc)
        return []


def _parse_operation(op: dict) -> tuple[str, str]:
    """Extract (dest_chain_name, dest_address) from a Wormholescan operation dict."""
    try:
        props = op.get("content", {}).get("standarizedProperties", {})
        target_chain_id: int = int(props.get("toChain", 0))
        dest_addr: str = props.get("toAddress", "") or props.get("recipient", "")

        if not target_chain_id:
            target_chain_id = int(op.get("targetChain", 0))
            dest_addr = op.get("recipientAddress", "")

        chain_name = _CHAIN_NAMES.get(
            target_chain_id,
            f"Chain-{target_chain_id}" if target_chain_id else "Unknown",
        )
        return chain_name, dest_addr
    except Exception:
        return "Unknown", ""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def detect_bridge_exits(flows: list[dict]) -> list[CrossChainExit]:
    """Scan raw SOL flow dicts and detect cross-chain exits.

    For every edge whose ``to_address`` is a known bridge program the
    function looks up the Wormholescan API for the originating wallet
    (``from_address``) to find the corresponding cross-chain operation.

    Args:
        flows: Raw flow dicts from the BFS trace.

    Returns:
        List of CrossChainExit objects (may be empty).
    """
    bridge_edges = [f for f in flows if f.get("to_address") in _BRIDGE_PROGRAMS]
    if not bridge_edges:
        return []

    exits: list[CrossChainExit] = []

    async with httpx.AsyncClient() as client:
        wallets_seen: set[str] = set()
        tasks: list[asyncio.Task] = []
        wallet_to_edge: dict[str, dict] = {}

        for edge in bridge_edges:
            wallet = edge["from_address"]
            if wallet not in wallets_seen:
                wallets_seen.add(wallet)
                wallet_to_edge[wallet] = edge
                tasks.append(
                    asyncio.create_task(_fetch_wormhole_operations(client, wallet))
                )

        if not tasks:
            return []

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for wallet, ops_or_exc in zip(list(wallets_seen), results):
            if isinstance(ops_or_exc, Exception):
                logger.debug("Wormholescan task error: %s", ops_or_exc)
                continue
            ops: list[dict] = ops_or_exc  # type: ignore[assignment]

            edge = wallet_to_edge[wallet]
            bridge_name = _BRIDGE_PROGRAMS[edge["to_address"]]
            amount_sol = round(edge.get("amount_lamports", 0) / 1_000_000_000.0, 6)

            if ops:
                op = ops[0]
                dest_chain, dest_addr = _parse_operation(op)
            else:
                dest_chain, dest_addr = "Pending attestation", ""

            exits.append(CrossChainExit(
                from_address=wallet,
                bridge_name=bridge_name,
                dest_chain=dest_chain,
                dest_address=dest_addr,
                amount_sol=amount_sol,
                tx_signature=edge.get("signature", ""),
            ))

    return exits


logger = logging.getLogger(__name__)

_WORMHOLE_API = "https://api.wormholescan.io/api/v1"

# Wormhole chain-ID → human name
_CHAIN_NAMES: dict[int, str] = {
    1:  "Solana",
    2:  "Ethereum",
    4:  "BSC",
    5:  "Polygon",
    6:  "Avalanche",
    10: "Fantom",
    13: "Klaytn",
    14: "Celo",
    15: "Near",
    16: "Moonbeam",
    23: "Arbitrum",
    24: "Optimism",
    30: "Base",
    34: "Scroll",
}

# Bridge program addresses on Solana → bridge name
_BRIDGE_PROGRAMS: dict[str, str] = {
    "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth": "Wormhole Core",
    "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb": "Wormhole Token Bridge",
    "WnFt12ZrnzZrFZkt2xsNsaNWoQribnuQ5B5FrDbwDhD":  "Wormhole NFT Bridge",
    "FC4eXxkyrMPTjiYUnNE9Cn6YBnKCm9T5XpEWFkUuQj8b": "Mayan Swift",
    "BrdgJPALFgxpQStMyf5MBoHWmZQMvNiRJvs2BpBXFVU":  "Allbridge Core",
    "DEbrdgQsVUG4vNW8fM5bX9kzZNFu2VZPsEBHvMYHovTF": "deBridge",
}


def is_bridge_program(address: str) -> bool:
    """Return True if the address is a known bridge program."""
    return address in _BRIDGE_PROGRAMS


@dataclass
class CrossChainExit:
    """A detected cross-chain capital exit."""
    from_address: str           # Solana wallet that triggered the bridge tx
    bridge_name: str            # Human-readable bridge name
    dest_chain: str             # Destination chain name (e.g. "Ethereum")
    dest_address: str           # Destination wallet address on the target chain
    amount_sol: float           # SOL amount bridged
    tx_signature: str           # Solana transaction signature


# ---------------------------------------------------------------------------
# Internal Wormholescan helpers
# ---------------------------------------------------------------------------

async def _fetch_wormhole_operations(
    session: aiohttp.ClientSession,
    wallet: str,
) -> list[dict]:
    """Query Wormholescan for all operations emitted from a Solana wallet."""
    url = f"{_WORMHOLE_API}/operations"
    params = {"address": wallet, "limit": "10"}
    try:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            if resp.status != 200:
                logger.debug("Wormholescan %s -> HTTP %s", wallet, resp.status)
                return []
            data = await resp.json()
            return data.get("operations", [])
    except Exception as exc:
        logger.debug("Wormholescan fetch failed for %s: %s", wallet, exc)
        return []


def _parse_operation(op: dict) -> tuple[str, str]:
    """Extract (dest_chain_name, dest_address) from a Wormholescan operation dict.

    Returns ("Unknown", "") if the chain/address cannot be determined.
    """
    # Destination chain info lives inside the inner 'content.standarizedProperties' block
    # or the top-level 'targetChain' / 'recipientAddress' depending on API version.
    try:
        props = (
            op.get("content", {})
              .get("standarizedProperties", {})
        )
        target_chain_id: int = int(props.get("toChain", 0))
        dest_addr: str = props.get("toAddress", "") or props.get("recipient", "")

        if not target_chain_id:
            # Fallback: top-level targetChain from older endpoint versions
            target_chain_id = int(op.get("targetChain", 0))
            dest_addr = op.get("recipientAddress", "")

        chain_name = _CHAIN_NAMES.get(target_chain_id, f"Chain-{target_chain_id}" if target_chain_id else "Unknown")
        return chain_name, dest_addr
    except Exception:
        return "Unknown", ""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def detect_bridge_exits(flows: list[dict]) -> list[CrossChainExit]:
    """Scan a list of raw SOL flow dicts and detect cross-chain exits.

    For every edge whose ``to_address`` is a known bridge program the
    function looks up the Wormholescan API for the originating wallet
    (``from_address``) to find the corresponding cross-chain operation.

    Args:
        flows: Raw flow dicts from the BFS trace
                (keys: from_address, to_address, amount_lamports, signature, …).

    Returns:
        List of CrossChainExit objects (may be empty if no bridges detected or
        if the Wormholescan API is unreachable).
    """
    # Collect candidate edges: to_address is a bridge program
    bridge_edges = [f for f in flows if f.get("to_address") in _BRIDGE_PROGRAMS]
    if not bridge_edges:
        return []

    exits: list[CrossChainExit] = []

    async with aiohttp.ClientSession() as session:
        # Group by originating wallet to avoid duplicate API calls
        wallets_seen: set[str] = set()
        tasks: list[asyncio.Task] = []
        wallet_to_edge: dict[str, dict] = {}

        for edge in bridge_edges:
            wallet = edge["from_address"]
            if wallet not in wallets_seen:
                wallets_seen.add(wallet)
                wallet_to_edge[wallet] = edge
                tasks.append(
                    asyncio.create_task(_fetch_wormhole_operations(session, wallet))
                )

        if not tasks:
            return []

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for wallet, ops_or_exc in zip(list(wallets_seen), results):
            if isinstance(ops_or_exc, Exception):
                logger.debug("Wormholescan task error: %s", ops_or_exc)
                continue
            ops: list[dict] = ops_or_exc  # type: ignore[assignment]

            edge = wallet_to_edge[wallet]
            bridge_name = _BRIDGE_PROGRAMS[edge["to_address"]]
            amount_sol = round(edge.get("amount_lamports", 0) / 1_000_000_000.0, 6)

            if ops:
                # Use the first (most recent) operation for this wallet
                op = ops[0]
                dest_chain, dest_addr = _parse_operation(op)
            else:
                # Bridge program interaction confirmed by on-chain flow but no
                # Wormholescan record found yet (message may not be attested).
                dest_chain, dest_addr = "Pending attestation", ""

            exits.append(CrossChainExit(
                from_address=wallet,
                bridge_name=bridge_name,
                dest_chain=dest_chain,
                dest_address=dest_addr,
                amount_sol=amount_sol,
                tx_signature=edge.get("signature", ""),
            ))

    return exits
