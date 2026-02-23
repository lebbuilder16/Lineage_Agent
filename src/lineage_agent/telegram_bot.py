"""
Telegram bot interface for the Meme Lineage Agent.

This bot listens for commands in Telegram and responds with the
lineage information for a given token mint address.  It uses the
`python-telegram-bot` library to handle updates.  You must supply a
valid Telegram bot token in the `config.py` file or via the
`TELEGRAM_BOT_TOKEN` environment variable.
"""

import logging

from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

from .config import TELEGRAM_BOT_TOKEN
from .lineage_detector import detect_lineage


# Configure logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a welcome message and usage instructions."""
    await update.message.reply_text(
        "Welcome to the Meme Lineage Agent!\n"
        "Use /lineage <mint> to get the lineage of a token."
    )


async def lineage(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /lineage command."""
    if not context.args:
        await update.message.reply_text(
            "Usage: /lineage <mint-address>"
        )
        return

    mint = context.args[0]
    logger.info("Received lineage request for %s", mint)
    result = detect_lineage(mint)
    root = result.get("root")
    confidence = result.get("confidence")
    derivatives = result.get("derivatives")

    deriv_text = ", ".join(derivatives) if derivatives else "None"
    text = (
        f"Lineage of {mint}:\n"
        f"Root: {root}\n"
        f"Confidence: {confidence}\n"
        f"Derivatives: {deriv_text}"
    )
    await update.message.reply_text(text)


def main() -> None:
    """Start the Telegram bot and run it until interrupted."""
    if TELEGRAM_BOT_TOKEN.startswith("<"):
        raise RuntimeError(
            "Please set your TELEGRAM_BOT_TOKEN in config.py or as an environment variable"
        )

    application = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("lineage", lineage))

    logger.info("Starting bot...")
    application.run_polling()


if __name__ == "__main__":
    main()