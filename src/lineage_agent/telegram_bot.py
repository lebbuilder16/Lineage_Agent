"""
Telegram bot interface for the Meme Lineage Agent.

Commands
--------
/start          – Welcome message
/lineage <mint> – Detect lineage for a token
/search <name>  – Search tokens by name or symbol
"""

from __future__ import annotations

import logging
import sys
import os

# Ensure ``src/`` is on the path so ``config`` can be found
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

from config import TELEGRAM_BOT_TOKEN
from .lineage_detector import detect_lineage, search_tokens

# Configure logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Handlers
# ------------------------------------------------------------------


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a welcome message and usage instructions."""
    text = (
        "🧬 *Meme Lineage Agent*\n\n"
        "I help you identify the *root token* and its clones "
        "in the Solana memecoin ecosystem.\n\n"
        "*Commands:*\n"
        "• /lineage `<mint>` – Detect the lineage of a token\n"
        "• /search `<name>` – Search tokens by name or symbol\n"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


async def lineage_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /lineage command."""
    if not context.args:
        await update.message.reply_text("Usage: /lineage <mint-address>")
        return

    mint = context.args[0]
    logger.info("Received lineage request for %s", mint)
    await update.message.reply_text("🔍 Analyzing lineage… please wait.")

    try:
        result = await detect_lineage(mint)
    except Exception as exc:
        logger.exception("Lineage detection error")
        await update.message.reply_text(f"❌ Error: {exc}")
        return

    root = result.root
    root_name = root.name if root else "Unknown"
    root_mint = root.mint if root else mint

    # Build a rich lineage card
    lines = [
        f"🧬 *Lineage Card*\n",
        f"📌 *Queried mint:* `{mint}`",
        f"👑 *Root:* {root_name} (`{root_mint[:8]}…`)",
        f"🎯 *Confidence:* {result.confidence:.0%}",
        f"👨‍👧‍👦 *Family size:* {result.family_size}",
    ]

    if result.derivatives:
        lines.append("\n📋 *Top derivatives / clones:*")
        for i, d in enumerate(result.derivatives[:5], 1):
            score = d.evidence.composite_score
            liq = f"${d.liquidity_usd:,.0f}" if d.liquidity_usd else "n/a"
            lines.append(
                f"  {i}. {d.name or d.symbol or d.mint[:8]} "
                f"– score {score:.2f}, liq {liq}"
            )
        if len(result.derivatives) > 5:
            lines.append(f"  _…and {len(result.derivatives) - 5} more_")
    else:
        lines.append("\n✅ No derivatives/clones found.")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def search_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /search command."""
    if not context.args:
        await update.message.reply_text("Usage: /search <token-name>")
        return

    query = " ".join(context.args)
    logger.info("Search request: %s", query)

    try:
        results = await search_tokens(query)
    except Exception as exc:
        logger.exception("Search error")
        await update.message.reply_text(f"❌ Error: {exc}")
        return

    if not results:
        await update.message.reply_text(f"No tokens found for *{query}*.", parse_mode="Markdown")
        return

    lines = [f"🔎 *Search results for '{query}':*\n"]
    for i, t in enumerate(results[:10], 1):
        mcap = f"${t.market_cap_usd:,.0f}" if t.market_cap_usd else "n/a"
        lines.append(
            f"{i}. *{t.name}* ({t.symbol}) – mcap {mcap}\n"
            f"   `{t.mint}`"
        )

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------


def main() -> None:
    """Start the Telegram bot and run it until interrupted."""
    if TELEGRAM_BOT_TOKEN.startswith("<"):
        raise RuntimeError(
            "Please set your TELEGRAM_BOT_TOKEN in config.py or as an environment variable"
        )

    application = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("lineage", lineage_cmd))
    application.add_handler(CommandHandler("search", search_cmd))

    logger.info("Starting bot…")
    application.run_polling()


if __name__ == "__main__":
    main()