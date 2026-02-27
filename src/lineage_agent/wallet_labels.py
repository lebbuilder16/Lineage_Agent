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
    "11111111111111111111111111111111":            ("System Program",          "system"),
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": ("SPL Token Program",      "system"),
    "Token2022rMLqfGMQpwkX83CmP5VWMdM8RX8bH6TfpHn": ("Token-2022 Program",    "system"),
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bv": ("ATA Program",           "system"),
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s": ("Metaplex Metadata",      "system"),
    "Vote111111111111111111111111111111111111111":  ("Vote Program",            "system"),
    "Stake11111111111111111111111111111111111111":  ("Stake Program",           "system"),
    "SysvarC1ock11111111111111111111111111111111":  ("Sysvar Clock",            "system"),
    "SysvarRent111111111111111111111111111111111":  ("Sysvar Rent",             "system"),
    "ComputeBudget111111111111111111111111111111":  ("Compute Budget",          "system"),
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr": ("Memo Program",          "system"),
    "So11111111111111111111111111111111111111112":  ("Wrapped SOL Mint",        "system"),
    "BPFLoaderUpgradeab1e11111111111111111111111":  ("BPF Loader",             "system"),

    # ── DEX / AMM ─────────────────────────────────────────────────────────
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": ("Raydium AMM V4",        "dex"),
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": ("Raydium Authority",     "dex"),
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK": ("Raydium CLMM",          "dex"),
    "LBUZKhRxPF3XUpBCjp4YzTKgLLjeyegsnkragy77ohVb": ("Meteora DLMM",          "dex"),
    "Eo7WjKq67rjJQDd1d4Gcd9EjPi4TnVABPuT14i8AK2qP": ("Meteora Dynamic AMM",  "dex"),
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc":  ("Orca Whirlpool",        "dex"),
    "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": ("Orca V2",              "dex"),
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4":  ("Jupiter V6",           "dex"),
    "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB":   ("Jupiter V4",           "dex"),
    "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX":   ("Serum DEX",            "dex"),
    "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY":   ("Phoenix DEX",          "dex"),
    "opnb2LAfJYbRMAg2CDFLbyEkPnXHeCzHWMFnmCJLFEe":   ("OpenBook V2",          "dex"),
    "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin":  ("Serum V3",             "dex"),

    # ── Launchpads ────────────────────────────────────────────────────────
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm":  ("PumpFun Program",      "launchpad"),
    "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM":   ("PumpFun Authority",    "launchpad"),
    "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1":  ("PumpFun Fee",          "launchpad"),
    "MoonCVVNZFSYkqNXP6bxHLPL6QQJiMEfzPWlVMMf9Ly":   ("Moonshot",             "launchpad"),
    "DEXYosS6oEGvk8uCDayvwEZz4qEyDJRf9nFgYCaqPMTm":  ("Believe / Degen",     "launchpad"),
    "4wTV81rvZBKW8vFJX9PMwn5n46sYr6HfkWMqJjpPbZ6M":  ("LetsBonk",             "launchpad"),

    # ── MEV / Block Engine ────────────────────────────────────────────────
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5":  ("Jito Tip Account",     "mev"),
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe":  ("Jito Tip Account 2",   "mev"),
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY":  ("Jito Tip Account 3",   "mev"),
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt13X5U4e2":  ("Jito Block Engine",    "mev"),

    # ── Bridges ───────────────────────────────────────────────────────────
    # Wormhole
    "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth":   ("Wormhole Core",        "bridge"),
    "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb":   ("Wormhole Token Bridge","bridge"),
    "B6RHG3mfcckmrYN1UhmJzyS1XX3fZKbkeUcpJe9Sy3FE":  ("Wormhole Portal",      "bridge"),
    "WnFt12ZrnzZrFZkt2xsNsaNWoQribnuQ5B5FrDbwDhD":   ("Wormhole NFT Bridge",  "bridge"),
    # Allbridge
    "BrdgJPALFgxpQStMyf5MBoHWmZQMvNiRJvs2BpBXFVU":   ("Allbridge Core",       "bridge"),
    "A7EGCeHDC4RMjmFBYBfNqqDmLGcToMQ7wAchNn5JrWuV":  ("Allbridge Pool",       "bridge"),
    # Mayan Finance
    "FC4eXxkyrMPTjiYUnNE9Cn6YBnKCm9T5XpEWFkUuQj8b":  ("Mayan Swift",          "bridge"),
    "mayanMigrator7fCzTFJqiByEsK1fJuvgmKL6V9A5YHyG":  ("Mayan Migrator",      "bridge"),
    # deBridge
    "DEbrdgQsVUG4vNW8fM5bX9kzZNFu2VZPsEBHvMYHovTF":  ("deBridge",             "bridge"),
    # NOTE: Celer cBridge, Synapse, Stargate are EVM-focused and have no native
    #       Solana programs. Do NOT add placeholder addresses.

    # ── CEX Hot Wallets ───────────────────────────────────────────────────
    # Binance
    "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi":  ("Binance Hot Wallet",   "cex"),
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM":  ("Binance Hot 2",        "cex"),
    "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE":  ("Binance Deposit",      "cex"),
    "Ctk2Yr5RwS5GKhGEWBbNGMBvHGBkHmWVkEiLkMXzShYP":  ("Binance Hot 3",        "cex"),
    # Coinbase
    "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2":  ("Coinbase",             "cex"),
    "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS":  ("Coinbase Hot 2",       "cex"),
    "GbE2G3CGLbQS2trqMPCCkGn6bNgpuY7drwBknzxBVnW1":  ("Coinbase Exchange",    "cex"),
    # OKX
    "FWznbcNXWQuHTawe9RxvQ2LdCENssh12ds3WWqBdvQ43":  ("OKX Hot Wallet",       "cex"),
    "6xMfDZPeMBYFCJFRFzW1F8BnSNWQjkHMJkCwKJEH6FY":  ("OKX Deposit 2",        "cex"),
    # Bybit
    "2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm":  ("Bybit",                "cex"),
    "A77HErqtfN1hLLpvZ9pGtu7uCMxG34VN2PXZqAiCMxDu":  ("Bybit Hot 2",          "cex"),
    # Kraken
    "BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6":  ("Kraken",               "cex"),
    "FAsRP2mEgrDxdFAFb4FXALR7P6d1GbHfcRMPqBnZhAe3":  ("Kraken Hot 2",         "cex"),
    # Gate.io
    "7hMeKiPis2PfaH9VsFHhXagFkpHVSHQGgChBzHT5Lz6s":  ("Gate.io",              "cex"),
    # KuCoin
    "4QzPaPFcWRi2R1LNLdQ9CQ3fNitEYGVCRQwFoUNVYxSK":  ("KuCoin",               "cex"),
    # MEXC
    "BU2yufJtGKKYTU3NVnKGGp9U7mCRyprQRGhySo5JXKXD":  ("MEXC",                 "cex"),
    # Bitget
    "EfGMuFXz1Tm9kWm7XLMXfPCZPvJPLvTJfD5T6PpzSYv9":  ("Bitget",               "cex"),
    # HTX (Huobi)
    "9hicpjmxC8rqGpXgdkMzMkXCVGRvQCEPXDMsHMDqz4Bq":  ("HTX / Huobi",          "cex"),
    # NOTE: Crypto.com hot wallet not verified — do NOT add placeholder.
}


# ---------------------------------------------------------------------------
# Known PREFIX patterns  (address starts-with → label, entity_type)
# Used for cases where a CEX uses many deposit addresses sharing a prefix.
# ---------------------------------------------------------------------------

_PREFIX_LABELS: list[tuple[str, str, str]] = [
    # Binance deposit addresses share this prefix in practice
    ("9WzDXwBbmkg8ZTbNMqUxvQ", "Binance Deposit", "cex"),
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
