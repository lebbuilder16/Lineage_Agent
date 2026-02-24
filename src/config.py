"""
Project configuration file for the Meme Lineage Agent.

This module centralises all user-modifiable settings such as API keys,
RPC endpoints, threshold values and other options.  You can edit these
values directly or set environment variables to override them.
"""

import os

# ---------------------------------------------------------------------------
# Telegram
# ---------------------------------------------------------------------------
TELEGRAM_BOT_TOKEN: str = os.getenv(
    "TELEGRAM_BOT_TOKEN", "<your-telegram-bot-token>"
)

# ---------------------------------------------------------------------------
# Solana RPC
# ---------------------------------------------------------------------------
SOLANA_RPC_ENDPOINT: str = os.getenv(
    "SOLANA_RPC_ENDPOINT",
    "https://api.mainnet-beta.solana.com",
)

# ---------------------------------------------------------------------------
# DexScreener
# ---------------------------------------------------------------------------
DEXSCREENER_BASE_URL: str = os.getenv(
    "DEXSCREENER_BASE_URL",
    "https://api.dexscreener.com",
)

# ---------------------------------------------------------------------------
# Similarity thresholds  (0.0 – 1.0)
# ---------------------------------------------------------------------------
IMAGE_SIMILARITY_THRESHOLD: float = float(
    os.getenv("IMAGE_SIMILARITY_THRESHOLD", "0.85")
)
NAME_SIMILARITY_THRESHOLD: float = float(
    os.getenv("NAME_SIMILARITY_THRESHOLD", "0.75")
)
SYMBOL_SIMILARITY_THRESHOLD: float = float(
    os.getenv("SYMBOL_SIMILARITY_THRESHOLD", "0.80")
)

# ---------------------------------------------------------------------------
# Scoring weights  (must sum to 1.0)
# ---------------------------------------------------------------------------
WEIGHT_NAME: float = float(os.getenv("WEIGHT_NAME", "0.25"))
WEIGHT_SYMBOL: float = float(os.getenv("WEIGHT_SYMBOL", "0.15"))
WEIGHT_IMAGE: float = float(os.getenv("WEIGHT_IMAGE", "0.25"))
WEIGHT_DEPLOYER: float = float(os.getenv("WEIGHT_DEPLOYER", "0.20"))
WEIGHT_TEMPORAL: float = float(os.getenv("WEIGHT_TEMPORAL", "0.15"))

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
CACHE_TTL_SECONDS: int = int(os.getenv("CACHE_TTL_SECONDS", "300"))

# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------
MAX_DERIVATIVES: int = int(os.getenv("MAX_DERIVATIVES", "50"))
REQUEST_TIMEOUT: int = int(os.getenv("REQUEST_TIMEOUT", "15"))

# ---------------------------------------------------------------------------
# API server
# ---------------------------------------------------------------------------
API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
API_PORT: int = int(os.getenv("API_PORT", "8000"))
CORS_ORIGINS: list[str] = os.getenv(
    "CORS_ORIGINS", "http://localhost:3000"
).split(",")