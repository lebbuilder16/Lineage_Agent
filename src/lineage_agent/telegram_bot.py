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
import logging
import re

from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, MessageHandler, filters

from config import TELEGRAM_BOT_TOKEN
from .alert_service import set_bot_app
from .data_sources._clients import list_subscriptions, subscribe_alert, unsubscribe_alert
from .lineage_detector import detect_lineage, search_tokens
from .ai_analyst import analyze_token

# Base58 validation regex (same as in api.py)
_BASE58_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")

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
        "I help you identify the *root token* and its clones in the Solana memecoin ecosystem\\.\n\n"
        "No more buying imposters\. No more broken families\. Just pure forensic intelligence\\.\n\n"
        "*Quick start:*\n"
        "• Paste a token mint → I'll detect its lineage\n"
        "• Or try /search `<name>` to find tokens\n\n"
        "*Core Commands:*\n"
        "• /lineage `<mint>` \\– Forensic analysis of a token\n"
        "• /search `<name>` \\– Find tokens by name or symbol\n"
        "• /about \\– Learn what we do\n"
        "• /links \\– Website, docs, GitHub, Twitter\n\n"
        "*Monitoring:*\n"
        "• /watch deployer `<wallet>` \\– Alert on new tokens from a wallet\n"
        "• /watch narrative `<name>` \\– Alert on narrative themes (pepe, ai, etc)\n"
        "• /mywatches \\– Your active subscriptions\n\n"
        "Use /help for more details\\.\n"
    )
    await update.message.reply_text(text, parse_mode="MarkdownV2")


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send help / usage instructions."""
    text = (
        "🧬 *Meme Lineage Agent \\– Complete Help*\n\n"
        "*Account & Info:*\n"
        "• /start \\– Welcome message\n"
        "• /about \\– What Lineage Agent does\n"
        "• /links \\– Official website, docs, social media\n"
        "• /help \\– This message\n\n"
        "*Forensic Analysis:*\n"
        "• /lineage `<mint>` \\– Deep forensic analysis of a token\n"
        "  Returns: root token, clones, risk score, bundle detection, SOL flow trace\n"
        "• /search `<name>` \\– Find tokens by name or symbol\n\n"
        "*Alerts \\& Subscriptions:*\n"
        "• /watch deployer `<address>` \\– Get alerts when this wallet deploys new tokens\n"
        "• /watch narrative `<name>` \\– Get alerts for tokens in a theme (pepe, ai, cat, etc)\n"
        "• /unwatch `<id>` \\– Cancel a subscription\n"
        "• /mywatches \\– See all your active subscriptions\n\n"
        "*Examples:*\n"
        "• `/lineage DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`\n"
        "• `/search bonk`\n"
        "• `/watch deployer Abc123XYZ...`\n"
        "• `/watch narrative pepe`\n\n"
        "_Need more help? See /about and /links\\._ "
    )
    await update.message.reply_text(text, parse_mode="MarkdownV2")


async def about_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send information about Lineage Agent."""
    text = (
        "🧬 *About Lineage Agent*\n\n"
        "Lineage Agent is an agentic forensic intelligence platform for the Solana memecoin ecosystem\\.\n\n"
        "*The Problem:*\n"
        "The Solana blockchain sees 1M\\+ token launches per month\. Operators systematically deploy clones of popular tokens, extract capital via rug pulls, then re\\-launch near\\-identical tokens targeting the same audience\\.\n\n"
        "*Our Solution:*\n"
        "We combine 13 independent on\\-chain forensic signals:"
        "\n• Metadata DNA fingerprinting \\( cross\\-wallet operator identity \\)"
        "\n• Family tree reconstruction \\( root \\+ derivatives \\)"
        "\n• Bundle detection \\( Jito coordinated buys \\)"
        "\n• SOL flow trace \\( post\\-rug capital routing \\)"
        "\n• Death Clock \\( rug timing forecast \\)"
        "\n• Zombie detection \\( recycled tokens \\)"
        "\n• AI analysis \\( Claude LLM with conviction chains \\)"
        "\nand more\\.\n\n"
        "*Result:* Full forensic lineage reports in under 60 seconds\."
    )
    await update.message.reply_text(text, parse_mode="MarkdownV2")


async def links_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send official links and social media."""
    text = (
        "🔗 *Lineage Agent — Official Links*\n\n"
        "🌐 *Website:* [lineagefun\\.xyz](https://www\\.lineagefun\\.xyz)\n"
        "📚 *Docs \\& Whitepaper:* [lineage\\-4\\.gitbook\\.io](https://lineage\\-4\\.gitbook\\.io/lineage\\-docs/)\n"
        "💻 *Open Source:* [github\\.com/lebbuilder16/Lineage\\_Agent](https://github\\.com/lebbuilder16/Lineage_Agent)\n"
        "𝕏 *X \\/Twitter:* [@LineageMemes](https://x\\.com/LineageMemes)\n\n"
        "*Resources:*\n"
        "• [Getting Started](https://lineage\\-4\\.gitbook\\.io/lineage\\-docs/getting\\-started)\n"
        "• [All 13 Signals Explained](https://lineage\\-4\\.gitbook\\.io/lineage\\-docs/features)\n"
        "• [REST API Reference](https://lineage\\-4\\.gitbook\\.io/lineage\\-docs/api\\-reference)\n"
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
    """Handle the /lineage command with full forensic + AI analysis."""
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
    status_msg = await update.message.reply_text("🔍 Analyzing… lineage + forensics\\.", parse_mode="MarkdownV2")

    try:
        # Run detect_lineage + analyze_token in parallel
        lineage_result, ai_result = await asyncio.gather(
            detect_lineage(mint),
            None,  # placeholder — filled below
            return_exceptions=True,
        )

        # Check lineage result
        if isinstance(lineage_result, Exception):
            logger.exception("Lineage detection error for %s", mint)
            await status_msg.edit_text(
                "❌ Something went wrong while analyzing this token\\. Please try again later\\.",
                parse_mode="MarkdownV2",
            )
            return

        # Now call AI analysis with lineage result (sequential to avoid timeout)
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

    except Exception:
        logger.exception("Lineage detection error for %s", mint)
        await status_msg.edit_text(
            "❌ Something went wrong while analyzing this token\\. Please try again later\\.",
            parse_mode="MarkdownV2",
        )
        return

    # Build hybrid message: lineage + AI analysis
    root = lineage_result.root
    root_name = _esc(root.name) if root and root.name else "Unknown"
    root_mint = root.mint if root else mint

    lines = ["🧬 *Lineage Card*\n"]
    
    # ── Lineage basics ────────────────────────────────────────────────
    lines.append(f"📌 *Queried:* `{mint}`")
    lines.append(f"👑 *Root:* {root_name} \\(`{root_mint[:8]}…`\\)")
    conf_pct = f"{lineage_result.confidence:.0%}" if lineage_result.confidence else "?"
    lines.append(f"🎯 *Confidence:* {_esc(conf_pct)} | 👨‍👧‍👦 *Family:* {lineage_result.family_size} tokens")

    # ── Bundle verdict (if available) ──────────────────────────────────
    bundle = lineage_result.bundle_report
    if bundle:
        verdict = getattr(bundle, "overall_verdict", "?") or "?"
        verdict_emoji = {
            "confirmed_team_extraction": "🔴",
            "suspected_team_extraction": "🟠",
            "coordinated_dump_unknown_team": "⚠️",
            "early_buyers_no_link_proven": "✅",
        }.get(verdict, "❓")
        lines.append(f"\n{verdict_emoji} *Bundle Verdict:* {_esc(verdict.replace('_', ' ').title())}")

    # ── AI Analysis results ────────────────────────────────────────────
    if ai_result:
        risk_score = ai_result.get("risk_score")
        confidence = ai_result.get("confidence", "?")
        rug_pattern = ai_result.get("rug_pattern", "unknown")
        verdict_summary = ai_result.get("verdict_summary", "")
        key_findings = ai_result.get("key_findings", []) or []
        conviction_chain = ai_result.get("conviction_chain")

        # Risk score with emoji
        risk_emoji = {
            "low": "🟢",   # 0-30
            "medium": "🟡",  # 31-54
            "caution": "🟠",  # 55-74
            "high": "🔴",   # 75-100
        }
        if risk_score is not None:
            if risk_score < 31:
                emoji = "🟢"
            elif risk_score < 55:
                emoji = "🟡"
            elif risk_score < 75:
                emoji = "🟠"
            else:
                emoji = "🔴"
            lines.append(f"\n{emoji} *Risk Score:* {risk_score}/100 \\({confidence}\\)")

        # Rug pattern
        if rug_pattern and rug_pattern != "unknown":
            lines.append(f"🎭 *Pattern:* {_esc(rug_pattern.replace('_', ' ').title())}")

        # Verdict summary
        if verdict_summary:
            lines.append(f"📋 _{_esc(verdict_summary)}_")

        # Top 2 key findings
        if key_findings:
            lines.append("\n🔍 *Key Findings:*")
            for finding in key_findings[:2]:
                # Strip [LABEL] prefix if present and shorten
                clean_finding = finding
                if "[" in finding and "]" in finding:
                    clean_finding = finding[finding.index("]") + 1:].strip()
                clean_finding = clean_finding[:80] + ("…" if len(clean_finding) > 80 else "")
                lines.append(f"  • {_esc(clean_finding)}")

        # Conviction chain (brief summary of confidence)
        if conviction_chain:
            chain_short = conviction_chain[:120] + ("…" if len(conviction_chain) > 120 else "")
            lines.append(f"\n💡 *Conviction:* _{_esc(chain_short)}_")
    else:
        lines.append("\n⚠️ *AI Analysis:* Not available (check back soon)")

    # ── Derivatives preview ───────────────────────────────────────────────
    if lineage_result.derivatives:
        lines.append(f"\n📊 *Top clones* \\(1 of {len(lineage_result.derivatives)}\\):")
        for d in lineage_result.derivatives[:1]:
            dname = _esc(d.name or d.symbol or d.mint[:8])
            score = d.evidence.composite_score if d.evidence else 0.0
            liq = f"${d.liquidity_usd:,.0f}" if d.liquidity_usd else "n/a"
            lines.append(f"  {dname} — score {_esc(f'{score:.2f}')}, liq {_esc(liq)}")
        if len(lineage_result.derivatives) > 1:
            lines.append(f"  _{len(lineage_result.derivatives) - 1} more clones detected_")
    else:
        lines.append("\n✅ *No clones detected*")

    lines.append(f"\n🔗 [View full report](https://www\\.lineagefun\\.xyz/lineage/{mint})")

    await status_msg.edit_text("\n".join(lines), parse_mode="MarkdownV2")


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


async def watch_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /watch deployer <address> and /watch narrative <name>."""
    if not context.args or len(context.args) < 2:
        await update.message.reply_text(
            "Usage:\n"
            "/watch deployer `<wallet\\-address>`\n"
            "/watch narrative `<name>`",
            parse_mode="MarkdownV2",
        )
        return

    sub_type = context.args[0].lower()
    value = " ".join(context.args[1:]).strip()

    if sub_type not in ("deployer", "narrative"):
        await update.message.reply_text(
            "❌ Unknown watch type\\. Use `deployer` or `narrative`\\.",
            parse_mode="MarkdownV2",
        )
        return

    if sub_type == "deployer" and not _BASE58_RE.match(value):
        await update.message.reply_text(
            "❌ Invalid Solana address\\. Expected 32\\-44 base58 characters\\.",
            parse_mode="MarkdownV2",
        )
        return

    chat_id = update.effective_chat.id
    inserted = await subscribe_alert(chat_id, sub_type, value)
    if inserted:
        await update.message.reply_text(
            f"✅ Watching *{sub_type}*: `{_esc(value)}`\n"
            f"You'll be notified when matching tokens appear\\.",
            parse_mode="MarkdownV2",
        )
    else:
        await update.message.reply_text(
            f"ℹ️ You're already watching *{sub_type}*: `{_esc(value)}`\\.",
            parse_mode="MarkdownV2",
        )


async def unwatch_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /unwatch <id>."""
    if not context.args:
        await update.message.reply_text(
            "Usage: /unwatch `<id>` — use /mywatches to see your subscription IDs\\.",
            parse_mode="MarkdownV2",
        )
        return

    try:
        sub_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("❌ ID must be a number\\.", parse_mode="MarkdownV2")
        return

    chat_id = update.effective_chat.id
    removed = await unsubscribe_alert(chat_id, sub_id)
    if removed:
        await update.message.reply_text(
            f"✅ Subscription \\#{sub_id} cancelled\\.",
            parse_mode="MarkdownV2",
        )
    else:
        await update.message.reply_text(
            f"❌ Subscription \\#{sub_id} not found or doesn't belong to you\\.",
            parse_mode="MarkdownV2",
        )


async def mywatches_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /mywatches — list all active subscriptions for this chat."""
    chat_id = update.effective_chat.id
    subs = await list_subscriptions(chat_id)

    if not subs:
        await update.message.reply_text(
            "📋 You have no active subscriptions\\.\n"
            "Use /watch to start tracking deployers or narratives\\.",
            parse_mode="MarkdownV2",
        )
        return

    lines = ["📋 *Your active subscriptions:*\n"]
    for s in subs:
        lines.append(
            f"  \\#{s['id']} — *{_esc(s['sub_type'])}*: `{_esc(s['value'])}`"
        )
    lines.append("\n_Use /unwatch `<id>` to cancel any subscription\\._")
    await update.message.reply_text("\n".join(lines), parse_mode="MarkdownV2")


# ------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------


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

    application = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_cmd))
    application.add_handler(CommandHandler("about", about_cmd))
    application.add_handler(CommandHandler("links", links_cmd))
    application.add_handler(CommandHandler("lineage", lineage_cmd))
    application.add_handler(CommandHandler("search", search_cmd))
    application.add_handler(CommandHandler("watch", watch_cmd))
    application.add_handler(CommandHandler("unwatch", unwatch_cmd))
    application.add_handler(CommandHandler("mywatches", mywatches_cmd))
    # Catch-all for unknown commands / messages
    application.add_handler(
        MessageHandler(filters.COMMAND, unknown_cmd)
    )
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, unknown_cmd)
    )

    # Register bot with alert service so it can dispatch notifications
    set_bot_app(application)

    logger.info("Starting bot…")
    application.run_polling()


if __name__ == "__main__":
    main()