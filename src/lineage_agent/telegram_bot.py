"""
Telegram bot interface for the Meme Lineage Agent.

Commands
--------
/start                      – Welcome message
/help                       – Show all commands and usage
/lineage <mint>             – Detect lineage for a token
/search <name>              – Search tokens by name or symbol
/about                      – About Lineage Agent
/links                      – Official links (website, docs, GitHub, Twitter)
/watch deployer <address>   – Subscribe to alerts for a deployer wallet
/watch narrative <name>     – Subscribe to alerts for a narrative category
/unwatch <id>               – Cancel a subscription by ID
/mywatches                  – List all active subscriptions
"""

from __future__ import annotations

import asyncio
import html
import logging
import re

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQueryResultArticle,
    InputTextMessageContent,
    Update,
)
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    InlineQueryHandler,
    MessageHandler,
    filters,
)

from config import TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_URL, TELEGRAM_WEBHOOK_SECRET
from .alert_service import set_bot_app
from .data_sources._clients import list_subscriptions, subscribe_alert, unsubscribe_alert
from .lineage_detector import detect_lineage, search_tokens
from .ai_analyst import analyze_token

# Base58 validation regex (same as in api.py)
_BASE58_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
# Dashboard base URL
_DASHBOARD_BASE = "https://www.lineagefun.xyz"

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# HTML escaping helper
# ------------------------------------------------------------------


def _e(text: str) -> str:
    """Escape special characters for Telegram HTML parse mode."""
    return html.escape(str(text))


# ------------------------------------------------------------------
# Handlers
# ------------------------------------------------------------------


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a welcome message and usage instructions."""
    text = (
        "🧬 <b>Meme Lineage Agent</b>\n\n"
        "I help you identify the <b>root token</b> and its clones in the Solana memecoin ecosystem.\n\n"
        "No more buying imposters. No more broken families. Just pure forensic intelligence.\n\n"
        "<b>Quick start:</b>\n"
        "• Paste a token mint → I'll detect its lineage\n"
        "• Or try /search <code>&lt;name&gt;</code> to find tokens\n\n"
        "<b>Core Commands:</b>\n"
        "• /lineage <code>&lt;mint&gt;</code> — Forensic analysis of a token\n"
        "• /search <code>&lt;name&gt;</code> — Find tokens by name or symbol\n"
        "• /about — Learn what we do\n"
        "• /links — Website, docs, GitHub, X\n\n"
        "<b>Monitoring:</b>\n"
        "• /watch deployer <code>&lt;wallet&gt;</code> — Alert on new tokens from a wallet\n"
        "• /watch narrative <code>&lt;name&gt;</code> — Alert on narrative themes (pepe, ai...)\n"
        "• /mywatches — Your active subscriptions\n\n"
        "Use /help for more details."
    )
    await update.message.reply_text(text, parse_mode="HTML")


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send help / usage instructions."""
    text = (
        "🧬 <b>Meme Lineage Agent — Complete Help</b>\n\n"
        "<b>Account &amp; Info:</b>\n"
        "• /start — Welcome message\n"
        "• /about — What Lineage Agent does\n"
        "• /links — Official website, docs, social media\n"
        "• /help — This message\n\n"
        "<b>Forensic Analysis:</b>\n"
        "• /lineage <code>&lt;mint&gt;</code> — Deep forensic analysis of a token\n"
        "  Returns: root token, clones, risk score, bundle detection, SOL flow trace\n"
        "• /search <code>&lt;name&gt;</code> — Find tokens by name or symbol\n\n"
        "<b>Alerts &amp; Subscriptions:</b>\n"
        "• /watch deployer <code>&lt;address&gt;</code> — Get alerts when this wallet deploys new tokens\n"
        "• /watch narrative <code>&lt;name&gt;</code> — Get alerts for tokens in a theme (pepe, ai, cat...)\n"
        "• /unwatch <code>&lt;id&gt;</code> — Cancel a subscription\n"
        "• /mywatches — See all your active subscriptions\n\n"
        "<b>Examples:</b>\n"
        "• <code>/lineage DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263</code>\n"
        "• <code>/search bonk</code>\n"
        "• <code>/watch deployer Abc123XYZ...</code>\n"
        "• <code>/watch narrative pepe</code>\n\n"
        "<i>Need more help? See /about and /links.</i>"
    )
    await update.message.reply_text(text, parse_mode="HTML")


async def about_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send information about Lineage Agent."""
    text = (
        "🧬 <b>About Lineage Agent</b>\n\n"
        "Lineage Agent is an agentic forensic intelligence platform for the Solana memecoin ecosystem.\n\n"
        "<b>The Problem:</b>\n"
        "The Solana blockchain sees 1M+ token launches per month. Operators systematically deploy "
        "clones of popular tokens, extract capital via rug pulls, then re-launch near-identical "
        "tokens targeting the same audience.\n\n"
        "<b>Our Solution:</b>\n"
        "We combine 13 independent on-chain forensic signals:\n"
        "• Metadata DNA fingerprinting (cross-wallet operator identity)\n"
        "• Family tree reconstruction (root + derivatives)\n"
        "• Bundle detection (Jito coordinated buys)\n"
        "• SOL flow trace (post-rug capital routing)\n"
        "• Death Clock (rug timing forecast)\n"
        "• Zombie detection (recycled tokens)\n"
        "• AI analysis (Claude LLM with conviction chains)\n"
        "and more.\n\n"
        "<b>Result:</b> Full forensic lineage reports in under 60 seconds."
    )
    await update.message.reply_text(text, parse_mode="HTML")


async def links_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send official links and social media."""
    text = (
        "🔗 <b>Lineage Agent — Official Links</b>\n\n"
        "🌐 <b>Website:</b> <a href=\"https://www.lineagefun.xyz\">lineagefun.xyz</a>\n"
        "📚 <b>Docs &amp; Whitepaper:</b> <a href=\"https://lineage-4.gitbook.io/lineage-docs/\">GitBook</a>\n"
        "💻 <b>Open Source:</b> <a href=\"https://github.com/lebbuilder16/Lineage_Agent\">GitHub</a>\n"
        "𝕏 <b>X / Twitter:</b> <a href=\"https://x.com/LineageMemes\">@LineageMemes</a>\n\n"
        "<b>Resources:</b>\n"
        "• <a href=\"https://lineage-4.gitbook.io/lineage-docs/getting-started\">Getting Started</a>\n"
        "• <a href=\"https://lineage-4.gitbook.io/lineage-docs/features\">All 13 Signals Explained</a>\n"
        "• <a href=\"https://lineage-4.gitbook.io/lineage-docs/api-reference\">REST API Reference</a>\n"
    )
    await update.message.reply_text(text, parse_mode="HTML")


async def unknown_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Respond to unrecognised messages/commands."""
    await update.message.reply_text(
        "❓ I don't understand that command.\nUse /help to see available commands.",
        parse_mode="HTML",
    )


def _inline_keyboard(mint: str) -> InlineKeyboardMarkup:
    """Build the inline action buttons shown under a lineage result."""
    url = f"{_DASHBOARD_BASE}/lineage/{mint}"
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("📊 Full Report", url=url),
            InlineKeyboardButton("📦 Bundle", url=f"{url}#bundle"),
        ],
        [
            InlineKeyboardButton("💸 SOL Flow", url=f"{url}#money-flow"),
            InlineKeyboardButton("🤖 AI Analysis", url=f"{url}#overview"),
        ],
        [
            InlineKeyboardButton("🔗 Share", switch_inline_query=mint),
        ],
    ])


async def _run_lineage_analysis(
    mint: str,
    status_msg: object,
) -> tuple | None:
    """
    Run sequential lineage + AI analysis with progressive message edits.
    Returns (lineage_result, ai_result) or None on fatal error.
    """
    from telegram import Message
    msg: Message = status_msg  # type: ignore[assignment]

    # Step 1 — lineage
    await msg.edit_text(
        "🔍 <b>Step 1/2</b> — Fetching on-chain lineage…",
        parse_mode="HTML",
    )
    try:
        lineage_result = await detect_lineage(mint)
    except Exception:
        logger.exception("Lineage detection error for %s", mint)
        await msg.edit_text(
            "❌ Something went wrong while analyzing this token. Please try again later.",
            parse_mode="HTML",
        )
        return None

    fam = getattr(lineage_result, "family_size", 0)
    await msg.edit_text(
        f"🔍 <b>Step 1/2</b> — Lineage ready ✅  ({fam} tokens in family)\n"
        "🤖 <b>Step 2/2</b> — Running AI forensic analysis…",
        parse_mode="HTML",
    )

    # Step 2 — AI
    try:
        ai_result = await asyncio.wait_for(
            analyze_token(mint, lineage_result=lineage_result),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        logger.warning("AI analysis timed out for %s", mint)
        ai_result = None
    except Exception:
        logger.exception("AI analysis failed for %s", mint)
        ai_result = None

    return lineage_result, ai_result


async def lineage_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /lineage command with full forensic + AI analysis."""
    if not context.args:
        await update.message.reply_text(
            "Usage: /lineage <code>&lt;mint-address&gt;</code>",
            parse_mode="HTML",
        )
        return

    mint = context.args[0]

    if not _BASE58_RE.match(mint):
        await update.message.reply_text(
            "❌ Invalid Solana mint address. Expected 32–44 base58 characters.",
            parse_mode="HTML",
        )
        return

    logger.info("Received lineage request for %s", mint)
    status_msg = await update.message.reply_text(
        "⏳ <b>Starting analysis…</b>", parse_mode="HTML"
    )

    result = await _run_lineage_analysis(mint, status_msg)
    if result is None:
        return
    lineage_result, ai_result = result

    # Build hybrid message: lineage + AI analysis
    root = lineage_result.root
    root_name = _e(root.name) if root and root.name else "Unknown"
    root_mint = root.mint if root else mint

    lines = ["🧬 <b>Lineage Card</b>\n"]

    # ── Lineage basics ─────────────────────────────────────────────────
    lines.append(f"📌 <b>Queried:</b> <code>{_e(mint)}</code>")
    lines.append(f"👑 <b>Root:</b> {root_name} (<code>{_e(root_mint[:8])}…</code>)")
    conf_pct = f"{lineage_result.confidence:.0%}" if lineage_result.confidence else "?"
    lines.append(
        f"🎯 <b>Confidence:</b> {_e(conf_pct)} | "
        f"👨‍👧‍👦 <b>Family:</b> {lineage_result.family_size} tokens"
    )

    # ── Bundle verdict ─────────────────────────────────────────────────
    bundle = lineage_result.bundle_report
    if bundle:
        verdict = getattr(bundle, "overall_verdict", "?") or "?"
        verdict_emoji = {
            "confirmed_team_extraction": "🔴",
            "suspected_team_extraction": "🟠",
            "coordinated_dump_unknown_team": "⚠️",
            "early_buyers_no_link_proven": "✅",
        }.get(verdict, "❓")
        lines.append(
            f"\n{verdict_emoji} <b>Bundle Verdict:</b> "
            f"{_e(verdict.replace('_', ' ').title())}"
        )

    # ── AI Analysis ────────────────────────────────────────────────────
    if ai_result:
        risk_score = ai_result.get("risk_score")
        confidence = ai_result.get("confidence", "?")
        rug_pattern = ai_result.get("rug_pattern", "unknown")
        verdict_summary = ai_result.get("verdict_summary", "")
        key_findings = ai_result.get("key_findings", []) or []
        conviction_chain = ai_result.get("conviction_chain")

        if risk_score is not None:
            if risk_score < 31:
                emoji = "🟢"
            elif risk_score < 55:
                emoji = "🟡"
            elif risk_score < 75:
                emoji = "🟠"
            else:
                emoji = "🔴"
            lines.append(
                f"\n{emoji} <b>Risk Score:</b> {risk_score}/100 ({_e(str(confidence))})"
            )

        if rug_pattern and rug_pattern != "unknown":
            lines.append(
                f"🎭 <b>Pattern:</b> {_e(rug_pattern.replace('_', ' ').title())}"
            )

        if verdict_summary:
            lines.append(f"📋 <i>{_e(verdict_summary)}</i>")

        if key_findings:
            lines.append("\n🔍 <b>Key Findings:</b>")
            for finding in key_findings[:2]:
                clean = finding
                if "[" in finding and "]" in finding:
                    clean = finding[finding.index("]") + 1:].strip()
                clean = clean[:80] + ("…" if len(clean) > 80 else "")
                lines.append(f"  • {_e(clean)}")

        if conviction_chain:
            chain_short = conviction_chain[:120] + (
                "…" if len(conviction_chain) > 120 else ""
            )
            lines.append(f"\n💡 <b>Conviction:</b> <i>{_e(chain_short)}</i>")
    else:
        lines.append("\n⚠️ <b>AI Analysis:</b> Not available (check back soon)")

    # ── Derivatives preview ─────────────────────────────────────────────
    if lineage_result.derivatives:
        total = len(lineage_result.derivatives)
        lines.append(f"\n📊 <b>Top clones</b> (1 of {total}):")
        for d in lineage_result.derivatives[:1]:
            dname = _e(d.name or d.symbol or d.mint[:8])
            score = d.evidence.composite_score if d.evidence else 0.0
            liq = f"${d.liquidity_usd:,.0f}" if d.liquidity_usd else "n/a"
            lines.append(f"  {dname} — score {score:.2f}, liq {_e(liq)}")
        if total > 1:
            lines.append(f"  <i>{total - 1} more clones detected</i>")
    else:
        lines.append("\n✅ <b>No clones detected</b>")

    # Inline buttons
    keyboard = _inline_keyboard(mint)

    await status_msg.edit_text(
        "\n".join(lines),
        parse_mode="HTML",
        reply_markup=keyboard,
    )


async def scan_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Alias for /lineage (shorter to type)."""
    await lineage_cmd(update, context)


async def callback_query_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Acknowledge inline keyboard button taps silently."""
    if update.callback_query:
        await update.callback_query.answer()


async def inline_query_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle @lineage_bot <mint> inline queries from any chat."""
    query = update.inline_query
    if not query:
        return
    text = (query.query or "").strip()
    if not _BASE58_RE.match(text):
        await query.answer(
            results=[],
            switch_pm_text="Paste a valid Solana mint address",
            switch_pm_parameter="help",
            cache_time=10,
        )
        return

    mint = text
    url = f"{_DASHBOARD_BASE}/lineage/{mint}"

    # Return a quick preview card without running full analysis (latency budget)
    message_text = (
        f"🧬 <b>Lineage Report</b>\n"
        f"<code>{_e(mint)}</code>\n\n"
        f"Open for full forensic analysis:\n"
        f"<a href=\"{url}\">{url}</a>"
    )
    results = [
        InlineQueryResultArticle(
            id=mint,
            title=f"Lineage: {mint[:12]}…",
            description="Tap to share a forensic report link",
            input_message_content=InputTextMessageContent(
                message_text=message_text,
                parse_mode="HTML",
            ),
            reply_markup=_inline_keyboard(mint),
        )
    ]
    await query.answer(results=results, cache_time=60)


async def search_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /search command."""
    if not context.args:
        await update.message.reply_text(
            "Usage: /search <code>&lt;token-name&gt;</code>",
            parse_mode="HTML",
        )
        return

    query = " ".join(context.args)
    logger.info("Search request: %s", query)

    try:
        results = await search_tokens(query)
    except Exception:
        logger.exception("Search error for '%s'", query)
        await update.message.reply_text(
            "❌ Something went wrong while searching. Please try again later.",
            parse_mode="HTML",
        )
        return

    if not results:
        await update.message.reply_text(
            f"No tokens found for <b>{_e(query)}</b>.",
            parse_mode="HTML",
        )
        return

    lines = [f"🔎 <b>Search results for '{_e(query)}':</b>\n"]
    for i, t in enumerate(results[:10], 1):
        mcap = f"${t.market_cap_usd:,.0f}" if t.market_cap_usd else "n/a"
        lines.append(
            f"{i}. <b>{_e(t.name)}</b> ({_e(t.symbol)}) — mcap {_e(mcap)}\n"
            f"   <code>{t.mint}</code>"
        )

    await update.message.reply_text("\n".join(lines), parse_mode="HTML")


async def watch_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /watch deployer <address> and /watch narrative <name>."""
    if not context.args or len(context.args) < 2:
        await update.message.reply_text(
            "Usage:\n"
            "/watch deployer <code>&lt;wallet-address&gt;</code>\n"
            "/watch narrative <code>&lt;name&gt;</code>",
            parse_mode="HTML",
        )
        return

    sub_type = context.args[0].lower()
    value = " ".join(context.args[1:]).strip()

    if sub_type not in ("deployer", "narrative"):
        await update.message.reply_text(
            "❌ Unknown watch type. Use <code>deployer</code> or <code>narrative</code>.",
            parse_mode="HTML",
        )
        return

    if sub_type == "deployer" and not _BASE58_RE.match(value):
        await update.message.reply_text(
            "❌ Invalid Solana address. Expected 32–44 base58 characters.",
            parse_mode="HTML",
        )
        return

    chat_id = update.effective_chat.id
    inserted = await subscribe_alert(chat_id, sub_type, value)
    if inserted:
        await update.message.reply_text(
            f"✅ Watching <b>{_e(sub_type)}</b>: <code>{_e(value)}</code>\n"
            "You'll be notified when matching tokens appear.",
            parse_mode="HTML",
        )
    else:
        await update.message.reply_text(
            f"ℹ️ You're already watching <b>{_e(sub_type)}</b>: <code>{_e(value)}</code>.",
            parse_mode="HTML",
        )


async def unwatch_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /unwatch <id>."""
    if not context.args:
        await update.message.reply_text(
            "Usage: /unwatch <code>&lt;id&gt;</code> — use /mywatches to see your subscription IDs.",
            parse_mode="HTML",
        )
        return

    try:
        sub_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("❌ ID must be a number.", parse_mode="HTML")
        return

    chat_id = update.effective_chat.id
    removed = await unsubscribe_alert(chat_id, sub_id)
    if removed:
        await update.message.reply_text(
            f"✅ Subscription #{sub_id} cancelled.",
            parse_mode="HTML",
        )
    else:
        await update.message.reply_text(
            f"❌ Subscription #{sub_id} not found or doesn't belong to you.",
            parse_mode="HTML",
        )


async def mywatches_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /mywatches — list all active subscriptions for this chat."""
    chat_id = update.effective_chat.id
    subs = await list_subscriptions(chat_id)

    if not subs:
        await update.message.reply_text(
            "📋 You have no active subscriptions.\n"
            "Use /watch to start tracking deployers or narratives.",
            parse_mode="HTML",
        )
        return

    lines = ["📋 <b>Your active subscriptions:</b>\n"]
    for s in subs:
        lines.append(
            f"  #{s['id']} — <b>{_e(s['sub_type'])}</b>: <code>{_e(s['value'])}</code>"
        )
    lines.append("\n<i>Use /unwatch &lt;id&gt; to cancel any subscription.</i>")
    await update.message.reply_text("\n".join(lines), parse_mode="HTML")


# ------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------


# Module-level application instance (set by build_application / main)
_application = None


def build_application():
    """Build and configure the PTB Application with all handlers.

    Returns the Application instance. Does NOT start polling or the event loop.
    Useful for webhook mode where the app is integrated into FastAPI.
    """
    from telegram.ext import Application  # type: ignore[attr-defined]

    app: Application = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("about", about_cmd))
    app.add_handler(CommandHandler("links", links_cmd))
    app.add_handler(CommandHandler("lineage", lineage_cmd))
    app.add_handler(CommandHandler("scan", scan_cmd))  # alias
    app.add_handler(CommandHandler("search", search_cmd))
    app.add_handler(CommandHandler("watch", watch_cmd))
    app.add_handler(CommandHandler("unwatch", unwatch_cmd))
    app.add_handler(CommandHandler("mywatches", mywatches_cmd))
    app.add_handler(CallbackQueryHandler(callback_query_handler))
    app.add_handler(InlineQueryHandler(inline_query_handler))
    app.add_handler(MessageHandler(filters.COMMAND, unknown_cmd))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, unknown_cmd))

    set_bot_app(app)
    return app


def main() -> None:
    """Start the Telegram bot and run it until interrupted."""
    logging.basicConfig(
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        level=logging.INFO,
    )

    if TELEGRAM_BOT_TOKEN.startswith("<"):
        raise RuntimeError(
            "Please set your TELEGRAM_BOT_TOKEN in config.py or as an environment variable"
        )

    application = build_application()

    logger.info("Starting bot…")
    if TELEGRAM_WEBHOOK_URL:
        logger.info("Webhook mode: %s", TELEGRAM_WEBHOOK_URL)
        application.run_webhook(
            listen="0.0.0.0",
            port=8080,
            url_path="/telegram/webhook",
            webhook_url=TELEGRAM_WEBHOOK_URL,
            secret_token=TELEGRAM_WEBHOOK_SECRET or None,
        )
    else:
        logger.info("Polling mode (no TELEGRAM_WEBHOOK_URL set)")
        application.run_polling()


if __name__ == "__main__":
    main()