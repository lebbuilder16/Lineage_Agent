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
import re

from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, MessageHandler, filters

from config import TELEGRAM_BOT_TOKEN
from .lineage_detector import detect_lineage, search_tokens

# Base58 validation regex (same as in api.py)
_BASE58_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")

# Configure logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Markdown escaping helper
# ------------------------------------------------------------------

_MD_V2_SPECIAL = set(r"_*[]()~`>#+-=|{}.!")


def _esc(text: str) -> str:
    """Escape special characters for Telegram MarkdownV2."""
    return "".join(f"\\{c}" if c in _MD_V2_SPECIAL else c for c in text)


# ------------------------------------------------------------------
# Handlers
# ------------------------------------------------------------------


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a welcome message and usage instructions."""
    text = (
        "🧬 *Meme Lineage Agent*\n\n"
        "I help you identify the *root token* and its clones "
        "in the Solana memecoin ecosystem\\.\n\n"
        "*Commands:*\n"
        "• /lineage `<mint>` \\– Detect the lineage of a token\n"
        "• /search `<name>` \\– Search tokens by name or symbol\n"
        "• /help \\– Show this help message\n"
    )
    await update.message.reply_text(text, parse_mode="MarkdownV2")


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send help / usage instructions."""
    text = (
        "🧬 *Meme Lineage Agent \\– Help*\n\n"
        "*Commands:*\n"
        "• /lineage `<mint>` \\– Detect the lineage of a Solana token\n"
        "• /search `<name>` \\– Search tokens by name or symbol\n"
        "• /help \\– Show this message\n\n"
        "*Examples:*\n"
        "• `/lineage DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`\n"
        "• `/search bonk`\n\n"
        "Paste a Solana mint address or type a token name to get started\\."
    )
    await update.message.reply_text(text, parse_mode="MarkdownV2")


async def unknown_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Respond to unrecognised messages/commands."""
    await update.message.reply_text(
        "❓ I don't understand that command\\.\n"
        "Use /help to see available commands\\.",
        parse_mode="MarkdownV2",
    )


async def lineage_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /lineage command."""
    if not context.args:
        await update.message.reply_text("Usage: /lineage <mint\\-address>", parse_mode="MarkdownV2")
        return

    mint = context.args[0]

    if not _BASE58_RE.match(mint):
        await update.message.reply_text(
            "❌ Invalid Solana mint address\\. Expected 32\\-44 base58 characters\\.",
            parse_mode="MarkdownV2",
        )
        return

    logger.info("Received lineage request for %s", mint)
    await update.message.reply_text("🔍 Analyzing lineage… please wait\\.", parse_mode="MarkdownV2")

    try:
        result = await detect_lineage(mint)
    except Exception:
        logger.exception("Lineage detection error for %s", mint)
        await update.message.reply_text(
            "❌ Something went wrong while analyzing this token\\. Please try again later\\.",
            parse_mode="MarkdownV2",
        )
        return

    root = result.root
    root_name = _esc(root.name) if root and root.name else "Unknown"
    root_mint = root.mint if root else mint

    # Build a rich lineage card
    conf_pct = f"{result.confidence:.0%}"
    lines = [
        f"🧬 *Lineage Card*\n",
        f"📌 *Queried mint:* `{mint}`",
        f"👑 *Root:* {root_name} \\(`{root_mint[:8]}…`\\)",
        f"🎯 *Confidence:* {_esc(conf_pct)}",
        f"👨‍👧‍👦 *Family size:* {result.family_size}",
    ]

    if result.derivatives:
        lines.append("\n📋 *Top derivatives / clones:*")
        for i, d in enumerate(result.derivatives[:5], 1):
            score = d.evidence.composite_score
            liq = f"${d.liquidity_usd:,.0f}" if d.liquidity_usd else "n/a"
            dname = _esc(d.name or d.symbol or d.mint[:8])
            lines.append(
                f"  {i}\\. {dname} "
                f"\\– score {_esc(f'{score:.2f}')}, liq {_esc(liq)}"
            )
        if len(result.derivatives) > 5:
            lines.append(f"  _…and {len(result.derivatives) - 5} more_")
    else:
        lines.append("\n✅ No derivatives/clones found\\.")

    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


async def search_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /search command."""
    if not context.args:
        await update.message.reply_text("Usage: /search <token\\-name>", parse_mode="MarkdownV2")
        return

    query = " ".join(context.args)
    logger.info("Search request: %s", query)

    try:
        results = await search_tokens(query)
    except Exception:
        logger.exception("Search error for '%s'", query)
        await update.message.reply_text(
            "❌ Something went wrong while searching\\. Please try again later\\.",
            parse_mode="MarkdownV2",
        )
        return

    if not results:
        await update.message.reply_text(
            f"No tokens found for *{_esc(query)}*\\.",
            parse_mode="MarkdownV2",
        )
        return

    lines = [f"🔎 *Search results for '{_esc(query)}':*\n"]
    for i, t in enumerate(results[:10], 1):
        mcap = f"${t.market_cap_usd:,.0f}" if t.market_cap_usd else "n/a"
        lines.append(
            f"{i}\\. *{_esc(t.name)}* \\({_esc(t.symbol)}\\) \\– mcap {_esc(mcap)}\n"
            f"   `{t.mint}`"
        )

    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


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
    application.add_handler(CommandHandler("help", help_cmd))
    application.add_handler(CommandHandler("lineage", lineage_cmd))
    application.add_handler(CommandHandler("search", search_cmd))
    # Catch-all for unknown commands / messages
    application.add_handler(
        MessageHandler(filters.COMMAND, unknown_cmd)
    )
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, unknown_cmd)
    )

    logger.info("Starting bot…")
    application.run_polling()


if __name__ == "__main__":
    main()