"""
Centralized constants for the Lineage Agent.

This file contains:
- Solana program addresses (immutable protocol constants)
- Shared business logic thresholds that MUST stay synchronized across modules

Import from this module rather than duplicating values across services.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Solana Program Addresses (immutable — part of the Solana protocol)
# ---------------------------------------------------------------------------

# Core system programs
SYSTEM_PROGRAM = "11111111111111111111111111111111"
TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
TOKEN_2022_PROGRAM = "Token2022rMLqfGMQpwkX83CmP5VWMdM8RX8bH6TfpHn"
ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bv"
BPF_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111"

# Sysvars
SYSVAR_CLOCK = "SysvarC1ock11111111111111111111111111111111"
SYSVAR_RENT = "SysvarRent111111111111111111111111111111111"

# Common programs
VOTE_PROGRAM = "Vote111111111111111111111111111111111111111"
STAKE_PROGRAM = "Stake11111111111111111111111111111111111111"
COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111"
MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"

# Wrapped SOL mint
WSOL_MINT = "So11111111111111111111111111111111111111112"

# Metaplex
METAPLEX_METADATA = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"

# ---------------------------------------------------------------------------
# Sets for filtering (commonly needed in transaction parsing)
# ---------------------------------------------------------------------------

# Addresses to exclude when looking for deployer interactions
SYSTEM_PROGRAMS: frozenset[str] = frozenset({
    SYSTEM_PROGRAM,
    TOKEN_PROGRAM,
    TOKEN_2022_PROGRAM,
    ATA_PROGRAM,
    BPF_LOADER,
    SYSVAR_CLOCK,
    SYSVAR_RENT,
    VOTE_PROGRAM,
    STAKE_PROGRAM,
    COMPUTE_BUDGET,
    MEMO_PROGRAM,
    WSOL_MINT,
    METAPLEX_METADATA,
})

# Addresses to skip when extracting user wallets from transactions
SKIP_ADDRESSES: frozenset[str] = frozenset({
    SYSTEM_PROGRAM,
    TOKEN_PROGRAM,
    WSOL_MINT,
    VOTE_PROGRAM,
    STAKE_PROGRAM,
    SYSVAR_CLOCK,
    SYSVAR_RENT,
    COMPUTE_BUDGET,
})

# ---------------------------------------------------------------------------
# DEX / AMM / Infrastructure programs to skip in flow tracing & bundle detection
# ---------------------------------------------------------------------------

# Unified skip set — previously duplicated across sol_flow_service._SKIP_ADDRESSES
# and bundle_tracker_service._SKIP_PROGRAMS. These are programs and system accounts
# that should be excluded when identifying user wallets in transaction parsing.
SKIP_PROGRAMS: frozenset[str] = frozenset({
    SYSTEM_PROGRAM,
    TOKEN_PROGRAM,
    TOKEN_2022_PROGRAM,
    ATA_PROGRAM,
    BPF_LOADER,
    SYSVAR_CLOCK,
    SYSVAR_RENT,
    VOTE_PROGRAM,
    STAKE_PROGRAM,
    COMPUTE_BUDGET,
    MEMO_PROGRAM,
    WSOL_MINT,
    METAPLEX_METADATA,
    # DEX / AMM programs + routers (must be excluded from LP provider detection
    # to avoid false-positive cartel edges — every token on Raydium would share
    # the Raydium Route address as "LP wallet" otherwise)
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",    # Raydium AMM V4
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",    # Raydium Authority V4
    "routeUGWgWzqBWFcrCfv8tritsYFkRYMGAkxTidQ2DqN",    # Raydium Route (old)
    "roUteHjDohtkatXTb79PJ99bbxkTipgo3GJ4EJZ1YpB",     # Raydium Route (current)
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",    # Raydium CLMM
    "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",    # Raydium CPMM
    "WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh",     # Raydium Launchpad Authority
    "LanMV9sAd7wArD6GNnABFhv4Vf8W4N9xCRbTPgP3czj",    # Raydium Launchpad Program
    "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg",    # PumpFun Migration Authority
    "PSwapMdSai8tjrEXcxFeQth87xC4rRsa4VA5mhGhXkP",     # PumpSwap Program
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",     # Orca Whirlpool
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",     # Jupiter V6
    "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",     # Jupiter V4
    "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX",      # Serum DEX
    # Launchpad programs
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm",    # PumpFun Program
    "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM",     # PumpFun Authority
    "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1",    # PumpFun Fee / Moonshot Fee-Authority
    "MoonCVVNZFSYkqNXP6bxHLPL6QQJiMEfzPWlVMMf9Ly",    # Moonshot Program
    "4wTV81rvZBKW8vFJX9PMwn5n46sYr6HfkWMqJjpPbZ6M",    # LetsBonk Program
    "DEXYosS6oEGvk8uCDayvwEZz4qEyDJRf9nFgYCaqPMTm",    # Believe / Degen Launchpad
    # MEV / Infrastructure
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",    # Jito Tip Account
    # Meteora
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",    # Meteora DLMM
    "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EkAW7vAo",   # Meteora Pools
})

# Canonical launchpad program / authority registry.
LAUNCHPAD_PROGRAMS: dict[str, str] = {
    # PumpFun
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm": "pumpfun",
    "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM": "pumpfun",
    # Moonshot
    "MoonCVVNZFSYkqNXP6bxHLPL6QQJiMEfzPWlVMMf9Ly": "moonshot",
    "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1": "moonshot",
    # LetsBonk
    "4wTV81rvZBKW8vFJX9PMwn5n46sYr6HfkWMqJjpPbZ6M": "letsbonk",
    # Believe / Degen
    "DEXYosS6oEGvk8uCDayvwEZz4qEyDJRf9nFgYCaqPMTm": "believe",
    # Raydium Launchpad (2025)
    "WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh": "raydiumlaunchpad",  # Launchpad authority
    "LanMV9sAd7wArD6GNnABFhv4Vf8W4N9xCRbTPgP3czj": "raydiumlaunchpad",  # Launchpad program
    # Bags.fm (uses Meteora DBC for bonding curve, Meteora DAMM v2 for post-migration AMM)
    "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN": "bagsfm",   # Meteora DBC (token creation + bonding curve)
    "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG": "bagsfm",   # Meteora DAMM v2 (post-migration AMM)
    "FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK": "bagsfm",   # Bags Fee Share V2 (current fee program)
    "BAGSB9TpGrZxQbEsrEznv5jXXdwyP6AXerN8aVRiAmcv": "bagsfm",   # Bags.fm token Update Authority / signer
}

BONDING_CURVE_LAUNCHPAD_PLATFORMS: frozenset[str] = frozenset({
    "pumpfun",
    "moonshot",
    "letsbonk",
    "believe",
    "raydiumlaunchpad",
    "bagsfm",
})

# ---------------------------------------------------------------------------
# CEX hot wallet addresses — unified source of truth
# ---------------------------------------------------------------------------

# Previously duplicated as _CEX_ADDRESSES (5 entries) in sol_flow_service.py
# and KNOWN_LABELS (8+ entries) in wallet_labels.py with divergent address sets.
# This is the canonical list used for programmatic CEX detection across all services.
CEX_ADDRESSES: frozenset[str] = frozenset({
    # Binance
    "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi",    # Binance Hot (from sol_flow_service)
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",   # Binance (from wallet_labels)
    "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE",   # Binance Deposit
    # Coinbase
    "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2",   # Coinbase
    "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS",  # Coinbase Hot 2
    # OKX
    # Bybit
    "2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm",   # Bybit
    # Kraken
    "BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6",  # Kraken
})

# ---------------------------------------------------------------------------
# Shared Business Logic Constants
# ---------------------------------------------------------------------------

# Liquidity threshold below which a token is considered rugged/dead
# Used by: rug_detector.py, zombie_detector.py
DEAD_LIQUIDITY_USD: float = 100.0

# Estimated extraction rate for operator impact calculations
# Used by: operator_impact_service.py, cartel_service.py
EXTRACTION_RATE: float = 0.15  # 15% flat-rate fallback (legacy)


def estimate_extraction_rate(mcap_usd: float | None) -> float:
    """Return an estimated extraction rate for a rugged token based on its mcap.

    The flat 15% heuristic under-estimates micro-caps (easy to drain all
    liquidity) and over-estimates macro-caps.  Tiered rates are still
    heuristics but more realistic across the typical memecoin distribution.

    Tiers (based on empirical on-chain analysis):
    - Micro  (< $5k):    40%  — operator can drain nearly all liquidity
    - Small  ($5k–$50k): 30%  — typical small rug, partial drain
    - Medium ($50k–$500k): 15%  — moderate size, harder to dump cleanly
    - Large  (> $500k):   8%  — established token, visible on-chain
    """
    if mcap_usd is None or mcap_usd <= 0:
        return EXTRACTION_RATE  # conservative fallback
    if mcap_usd < 5_000:
        return 0.40
    if mcap_usd < 50_000:
        return 0.30
    if mcap_usd < 500_000:
        return 0.15
    return 0.08

# SOL conversion
LAMPORTS_PER_SOL: int = 1_000_000_000

# Minimum SOL transfer in lamports (for flow tracing)
# Configurable via env var MIN_TRANSFER_LAMPORTS (default 0.1 SOL)
import os as _os  # noqa: E402
MIN_TRANSFER_LAMPORTS: int = int(
    _os.getenv("MIN_TRANSFER_LAMPORTS", str(100_000_000))
)
