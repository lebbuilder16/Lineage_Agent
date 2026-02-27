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
