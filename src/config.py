"""
Project configuration file for the Meme Lineage Agent.

This module centralises all user-modifiable settings such as API keys,
RPC endpoints, threshold values and other options.  You can edit these
values directly or set environment variables to override them.  To
provide your Telegram bot token, set the `TELEGRAM_BOT_TOKEN` environment
variable or edit it below.
"""

import os

# Telegram bot token.  Replace with your actual token or set the
# TELEGRAM_BOT_TOKEN environment variable before running the bot.
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "<your-telegram-bot-token>")

# Example: RPC endpoint for Solana (optional, can be overridden via env)
SOLANA_RPC_ENDPOINT: str = os.getenv(
    "SOLANA_RPC_ENDPOINT",
    "https://api.mainnet-beta.solana.com",
)

# Placeholder for other configuration values.  For example:
#   METAPLEX_API_ENDPOINT: str = os.getenv("METAPLEX_API_ENDPOINT", "https://api.metaplex.com")
#   DEX_SCREENER_API: str = os.getenv("DEX_SCREENER_API", "https://api.dexscreener.com")

# Thresholds for similarity scores (tune these as the model evolves)
IMAGE_SIMILARITY_THRESHOLD: float = 0.9
NAME_SIMILARITY_THRESHOLD: float = 0.8

# Note: Add any additional configuration parameters you need here.