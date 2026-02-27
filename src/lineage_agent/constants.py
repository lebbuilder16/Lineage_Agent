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
    # DEX / AMM programs
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",    # Raydium AMM V4
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",    # Raydium Authority
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",     # Orca Whirlpool
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",     # Jupiter V6
    "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX",      # Serum DEX
    # Launchpad programs
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm",    # PumpFun Program
    "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM",     # PumpFun Authority
    # MEV / Infrastructure
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",    # Jito Tip Account
    # Meteora
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",    # Meteora DLMM
    "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EkAW7vAo",   # Meteora Pools
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
    "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS",  # OKX (alias — may overlap with Coinbase Hot 2)
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
EXTRACTION_RATE: float = 0.15  # 15% of rugged mcap

# SOL conversion
LAMPORTS_PER_SOL: int = 1_000_000_000

# Minimum SOL transfer in lamports (for flow tracing)
# Configurable via env var MIN_TRANSFER_LAMPORTS (default 0.1 SOL)
import os as _os
MIN_TRANSFER_LAMPORTS: int = int(
    _os.getenv("MIN_TRANSFER_LAMPORTS", str(100_000_000))
)
