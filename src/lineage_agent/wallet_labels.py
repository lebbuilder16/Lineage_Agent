"""
Wallet identity resolution for the SOL flow graph.

Provides a human-readable label and entity-type classification for
any Solana address.  Resolution strategy:
  1. Fast O(1) lookup in the static KNOWN_LABELS dictionary (covers
     CEX hot-wallets, DEX programs, bridge programs and system accounts).
  2. Pattern matching for partial-address heuristics (e.g. vanity CEX
     deposit addresses that share a known prefix).
  3. Returns None fields when the address is unknown — callers decide
     how to render unknowns.

Entity types (``entity_type`` field):
  "cex"         – Centralised exchange hot-wallet or deposit router
  "dex"         – DEX / AMM program or authority
  "bridge"      – Cross-chain bridge program or authority
  "system"      – Solana system / runtime program
  "mev"         – MEV / Jito tip / block-engine infrastructure
  "launchpad"   – Token launchpad (PumpFun, Moonshot, …)
  "mixer"       – Known mixing / obfuscation address
  "wallet"      – Generic EOA wallet (used when we know the owner name)
  "contract"    – Other on-chain program
"""

from __future__ import annotations

from typing import Optional


# ---------------------------------------------------------------------------
# Primary label dictionary
# Format: address → (display_label, entity_type)
# ---------------------------------------------------------------------------

KNOWN_LABELS: dict[str, tuple[str, str]] = {
    # ── Solana System Programs ────────────────────────────────────────────
    # All addresses in this section are immutable Solana protocol constants.
    "11111111111111111111111111111111":            ("System Program",          "system"),
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": ("SPL Token Program",      "system"),
    "TokenzQdBNbequZvgc5a8ZoiAMEt4GPGcjGEF58nTTCk": ("Token-2022 Program",    "system"),  # Token Extensions
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s": ("Metaplex Metadata",      "system"),  # RPC: PROGRAM ✓
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr": ("Memo Program",          "system"),  # RPC: PROGRAM ✓
    "Vote111111111111111111111111111111111111111":  ("Vote Program",            "system"),
    "Stake11111111111111111111111111111111111111":  ("Stake Program",           "system"),
    "SysvarC1ock11111111111111111111111111111111":  ("Sysvar Clock",            "system"),
    "SysvarRent111111111111111111111111111111111":  ("Sysvar Rent",             "system"),
    "ComputeBudget111111111111111111111111111111":  ("Compute Budget",          "system"),
    "So11111111111111111111111111111111111111112":  ("Wrapped SOL Mint",        "system"),
    "BPFLoaderUpgradeab1e11111111111111111111111":  ("BPF Loader",             "system"),

    # ── DEX / AMM ─────────────────────────────────────────────────────────
    # Verified via mainnet RPC: PROGRAM ✓
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": ("Raydium AMM V4",        "dex"),
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": ("Raydium Authority",     "dex"),
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK": ("Raydium CLMM",          "dex"),
    "LBUZKhRxPF3XUpBCjp4YzTKgLLjeyegsnkragy77ohVb": ("Meteora DLMM",          "dex"),  # meteora.ag docs
    "Eo7WjKq67rjJQDd1d4Gcd9EjPi4TnVABPuT14i8AK2qP": ("Meteora Dynamic AMM",  "dex"),  # meteora.ag docs
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc":  ("Orca Whirlpool",        "dex"),
    "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": ("Orca V2",              "dex"),
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4":  ("Jupiter V6",           "dex"),
    "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB":   ("Jupiter V4",           "dex"),
    "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX":   ("Serum DEX",            "dex"),
    "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY":   ("Phoenix DEX",          "dex"),
    "opnb2LAfJYbRMAg2CDFLbyEkPnXHeCzHWMFnmCJLFEe":   ("OpenBook V2",          "dex"),  # openbook-dex docs
    "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin":  ("Serum V3",             "dex"),

    # ── Launchpads ────────────────────────────────────────────────────────
    # PumpFun: widely confirmed program ID (every on-chain meme on Solana)
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm":  ("PumpFun Program",      "launchpad"),
    "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM":   ("PumpFun Authority",    "launchpad"),  # RPC: ACCOUNT 0.72 SOL ✓
    "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1":  ("PumpFun Fee",          "launchpad"),  # RPC: ACCOUNT 0.17 SOL ✓
    "DEXYosS6oEGvk8uCDayvwEZz4qEyDJRf9nFgYCaqPMTm":  ("Believe / Degen",     "launchpad"),  # RPC: PROGRAM ✓

    # ── MEV / Jito ────────────────────────────────────────────────────────
    # All 6 tip accounts verified via RPC: owner=T1pyyaTNZ... (Jito Tip Payment Program)
    "T1pyyaTNZsKv2WcRAB8oVnk93mLJw2XzjtVYqCsaHqt":   ("Jito Tip Payment",     "mev"),  # RPC: PROGRAM ✓
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5":  ("Jito Tip Account 1",   "mev"),  # RPC: ACCOUNT ✓
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe":  ("Jito Tip Account 2",   "mev"),  # RPC: ACCOUNT ✓
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY":  ("Jito Tip Account 3",   "mev"),  # RPC: ACCOUNT ✓
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh":  ("Jito Tip Account 4",   "mev"),  # RPC: ACCOUNT ✓
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt":  ("Jito Tip Account 5",   "mev"),  # RPC: ACCOUNT ✓
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL":  ("Jito Tip Account 6",   "mev"),  # RPC: ACCOUNT ✓

    # ── Bridges ───────────────────────────────────────────────────────────
    # Only protocols with confirmed Solana programs are listed here.
    # Celer cBridge, Synapse, and Allbridge have no verified Solana program IDs.
    # Wormhole — verified: RPC PROGRAM ✓
    "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth":   ("Wormhole Core",        "bridge"),
    "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb":   ("Wormhole Token Bridge","bridge"),
    "WnFt12ZrnzZrFZkt2xsNsaNWoQribnuQ5B5FrDbwDhD":   ("Wormhole NFT Bridge",  "bridge"),
    # LayerZero — verified: RPC PROGRAM ✓ (endpoint v2)
    "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6":  ("LayerZero Endpoint",   "bridge"),

    # ── CEX Hot Wallets ───────────────────────────────────────────────────
    # Only addresses verified on-chain with significant SOL balances are listed.
    # Binance — RPC: 14.9M SOL ✓ / 30k SOL ✓
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM":  ("Binance",              "cex"),
    "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE":  ("Binance Deposit",      "cex"),
    # Coinbase — RPC: 426k SOL ✓ / 33k SOL ✓
    "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2":  ("Coinbase",             "cex"),
    "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS":  ("Coinbase Hot 2",       "cex"),
    # Bybit — RPC: 44k SOL ✓
    "2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm":  ("Bybit",                "cex"),
    # Kraken — RPC: 35k SOL ✓
    "BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6":  ("Kraken",               "cex"),
}


# ---------------------------------------------------------------------------
# Known PREFIX patterns  (address starts-with → label, entity_type)
# Used for cases where a CEX uses many deposit addresses sharing a prefix.
# ---------------------------------------------------------------------------

_PREFIX_LABELS: list[tuple[str, str, str]] = [
    # Binance: main cold/custody wallet prefix (9WzDXwBbmkg8... confirmed 14.9M SOL on-chain)
    ("9WzDXwBbmkg8ZTbNMqUxvQ", "Binance", "cex"),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class WalletInfo:
    """Resolved identity for a Solana wallet / program address."""

    __slots__ = ("address", "label", "entity_type", "is_known")

    def __init__(
        self,
        address: str,
        label: Optional[str],
        entity_type: Optional[str],
    ) -> None:
        self.address = address
        self.label = label
        self.entity_type = entity_type
        self.is_known = label is not None

    def short(self) -> str:
        """Return label if known, else truncated address."""
        if self.label:
            return self.label
        return f"{self.address[:4]}…{self.address[-4:]}"

    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "entity_type": self.entity_type,
        }


def classify_address(address: str) -> WalletInfo:
    """Resolve a Solana address to a human-readable identity.

    Resolution order:
      1. Exact match in KNOWN_LABELS
      2. Prefix match in _PREFIX_LABELS
      3. Unknown → label=None, entity_type=None

    This is a pure synchronous function — no I/O, no RPC calls.

    Args:
        address: Base-58 Solana address string.

    Returns:
        WalletInfo with label/entity_type populated or None if unknown.
    """
    # 1. Exact match (O(1))
    entry = KNOWN_LABELS.get(address)
    if entry:
        return WalletInfo(address, label=entry[0], entity_type=entry[1])

    # 2. Prefix match (scan is short — list is small)
    for prefix, label, etype in _PREFIX_LABELS:
        if address.startswith(prefix):
            return WalletInfo(address, label=label, entity_type=etype)

    # 3. Unknown
    return WalletInfo(address, label=None, entity_type=None)


def is_bridge_program(address: str) -> bool:
    """Return True if the address is a known cross-chain bridge program."""
    info = classify_address(address)
    return info.entity_type == "bridge"


def label_or_short(address: str) -> str:
    """Convenience: return label if known, else first4…last4."""
    return classify_address(address).short()
