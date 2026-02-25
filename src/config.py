"""
Project configuration file for the Meme Lineage Agent.

This module centralises all user-modifiable settings such as API keys,
RPC endpoints, threshold values and other options.  You can edit these
values directly or set environment variables to override them.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _parse_float(name: str, default: str, *, low: float = 0.0, high: float = 1.0) -> float:
    """Parse an env var as a float and validate it within [low, high]."""
    raw = os.getenv(name, default)
    try:
        value = float(raw)
    except (TypeError, ValueError):
        logger.error("Invalid value for %s: %r – using default %s", name, raw, default)
        value = float(default)
    if not (low <= value <= high):
        logger.warning("%s=%.4f is outside [%.1f, %.1f] – clamped", name, value, low, high)
        value = max(low, min(value, high))
    return value


def _parse_int(name: str, default: str, *, minimum: int = 1) -> int:
    """Parse an env var as an int and enforce a minimum."""
    raw = os.getenv(name, default)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        logger.error("Invalid value for %s: %r – using default %s", name, raw, default)
        value = int(default)
    if value < minimum:
        logger.warning("%s=%d is below minimum %d – clamped", name, value, minimum)
        value = minimum
    return value


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
IMAGE_SIMILARITY_THRESHOLD: float = _parse_float("IMAGE_SIMILARITY_THRESHOLD", "0.85")
NAME_SIMILARITY_THRESHOLD: float = _parse_float("NAME_SIMILARITY_THRESHOLD", "0.75")
SYMBOL_SIMILARITY_THRESHOLD: float = _parse_float("SYMBOL_SIMILARITY_THRESHOLD", "0.80")

# ---------------------------------------------------------------------------
# Scoring weights  (must sum to 1.0)
# ---------------------------------------------------------------------------
WEIGHT_NAME: float = _parse_float("WEIGHT_NAME", "0.25")
WEIGHT_SYMBOL: float = _parse_float("WEIGHT_SYMBOL", "0.15")
WEIGHT_IMAGE: float = _parse_float("WEIGHT_IMAGE", "0.25")
WEIGHT_DEPLOYER: float = _parse_float("WEIGHT_DEPLOYER", "0.20")
WEIGHT_TEMPORAL: float = _parse_float("WEIGHT_TEMPORAL", "0.15")

# Validate scoring weights sum to ~1.0
_weight_sum = WEIGHT_NAME + WEIGHT_SYMBOL + WEIGHT_IMAGE + WEIGHT_DEPLOYER + WEIGHT_TEMPORAL
if abs(_weight_sum - 1.0) > 0.01:
    logger.warning(
        "Scoring weights sum to %.4f (expected 1.0). Results may be skewed.",
        _weight_sum,
    )

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
CACHE_TTL_SECONDS: int = _parse_int("CACHE_TTL_SECONDS", "300", minimum=1)
CACHE_TTL_LINEAGE_SECONDS: int = _parse_int(
    "CACHE_TTL_LINEAGE_SECONDS", "180", minimum=1
)
CACHE_BACKEND: str = os.getenv("CACHE_BACKEND", "sqlite")  # "memory" or "sqlite"
CACHE_SQLITE_PATH: str = os.getenv("CACHE_SQLITE_PATH", "data/cache.db")

# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------
MAX_DERIVATIVES: int = _parse_int("MAX_DERIVATIVES", "50", minimum=1)
MAX_CONCURRENT_RPC: int = _parse_int("MAX_CONCURRENT_RPC", "5", minimum=1)
REQUEST_TIMEOUT: int = _parse_int("REQUEST_TIMEOUT", "15", minimum=1)
ANALYSIS_TIMEOUT_SECONDS: int = _parse_int("ANALYSIS_TIMEOUT_SECONDS", "50", minimum=5)

# ---------------------------------------------------------------------------
# Rate limiting (slowapi format, e.g. "10/minute")
# ---------------------------------------------------------------------------
RATE_LIMIT_LINEAGE: str = os.getenv("RATE_LIMIT_LINEAGE", "10/minute")
RATE_LIMIT_SEARCH: str = os.getenv("RATE_LIMIT_SEARCH", "30/minute")

# ---------------------------------------------------------------------------
# Sentry (error tracking)
# ---------------------------------------------------------------------------
SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")
SENTRY_ENVIRONMENT: str = os.getenv("SENTRY_ENVIRONMENT", "production")
SENTRY_TRACES_SAMPLE_RATE: float = _parse_float(
    "SENTRY_TRACES_SAMPLE_RATE", "0.1", low=0.0, high=1.0
)

# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------
CB_FAILURE_THRESHOLD: int = _parse_int("CB_FAILURE_THRESHOLD", "8", minimum=1)
CB_RECOVERY_TIMEOUT: float = float(os.getenv("CB_RECOVERY_TIMEOUT", "60"))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FORMAT: str = os.getenv("LOG_FORMAT", "text")  # "text" or "json"

# ---------------------------------------------------------------------------
# API server
# ---------------------------------------------------------------------------
API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
API_PORT: int = _parse_int("API_PORT", "8000", minimum=1)
CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]