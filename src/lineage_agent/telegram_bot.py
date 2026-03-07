"""
Telegram bot interface for the Meme Lineage Agent.

Commands
--------
/start                      – Welcome + help
/scan <mint>                – Forensic analysis of a token
/search <name>              – Search tokens by name or symbol
/watch deployer <address>   – Subscribe to alerts for a deployer wallet
/watch narrative <name>     – Subscribe to alerts for a narrative category
/unwatch <id>               – Cancel a subscription by ID
/watches                    – List all active subscriptions

Smart text handler: paste a mint → auto-scan, type a name → auto-search
"""

from __future__ import annotations

import asyncio
import html
import logging
import os
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

from config import TELEGRAM_BOT_TOKEN
from .alert_service import set_bot_app
from .data_sources._clients import list_subscriptions, subscribe_alert, unsubscribe_alert
from .lineage_detector import detect_lineage, search_tokens
from .ai_analyst import analyze_token
from .bundle_tracker_service import get_cached_bundle_report
from .sol_flow_service import get_sol_flow_report

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
    """Welcome message with all usage info and links."""
    text = (
        "🧬 <b>Meme Lineage Agent</b>\n"
        "Forensic intelligence for Solana memecoins.\n\n"
        "<b>Just paste a mint address</b> — I'll scan it automatically.\n\n"
        "<b>Commands:</b>\n"
        "• /scan <code>&lt;mint&gt;</code> — Forensic analysis\n"
        "• /search <code>&lt;name&gt;</code> — Find tokens\n"
        "• /watch deployer <code>&lt;wallet&gt;</code> — Alert on new deploys\n"
        "• /watch narrative <code>&lt;theme&gt;</code> — Alert by narrative (pepe, ai…)\n"
        "• /unwatch <code>&lt;id&gt;</code> · /watches — Manage alerts"
    )
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("🌐 Website", url="https://www.lineagefun.xyz"),
        InlineKeyboardButton("📚 Docs", url="https://lineage-4.gitbook.io/lineage-docs/"),
    ], [
        InlineKeyboardButton("💻 GitHub", url="https://github.com/lebbuilder16/Lineage_Agent"),
        InlineKeyboardButton("𝕏 Twitter", url="https://x.com/LineageMemes"),
    ]])
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=keyboard)


async def smart_text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Auto-route plain text: mint address → scan, anything else → search."""
    if not update.message or not update.message.text:
        return
    text = update.message.text.strip()
    if _BASE58_RE.match(text):
        # Looks like a mint address — run scan
        context.args = [text]
        await scan_cmd(update, context)
    else:
        # Treat as a search query
        context.args = text.split()
        await search_cmd(update, context)


def _inline_keyboard(mint: str, deployer: str | None = None) -> InlineKeyboardMarkup:
    """Build the inline action buttons shown under a lineage result."""
    url = f"{_DASHBOARD_BASE}/lineage/{mint}"
    rows = [
        [
            InlineKeyboardButton("📊 Full Report", url=url),
            InlineKeyboardButton("📦 Bundle", url=f"{url}#bundle"),
        ],
        [
            InlineKeyboardButton("💸 SOL Flow", url=f"{url}#money-flow"),
            InlineKeyboardButton("🤖 AI Analysis", url=f"{url}#overview"),
        ],
    ]
    # Watch deployer button — callback_data ≤ 64 bytes
    if deployer and _BASE58_RE.match(deployer):
        rows.append([
            InlineKeyboardButton(
                "🔔 Watch deployer",
                callback_data=f"watch:deployer:{deployer}",
            ),
            InlineKeyboardButton("🔗 Share", switch_inline_query=mint),
        ])
    else:
        rows.append([
            InlineKeyboardButton("🔗 Share", switch_inline_query=mint),
        ])
    return InlineKeyboardMarkup(rows)


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

    # Fetch bundle + SOL flow concurrently (fast DB reads) — same data the web
    # path uses, so both paths share the same Claude inputs and cached result.
    bundle_result, sol_flow_result = await asyncio.gather(
        get_cached_bundle_report(mint),
        get_sol_flow_report(mint),
        return_exceptions=True,
    )
    if isinstance(bundle_result, Exception):
        bundle_result = None
    if isinstance(sol_flow_result, Exception):
        sol_flow_result = None

    # Step 2 — AI (pass cache so result is shared with the web endpoint)
    try:
        from .data_sources._clients import cache as _cache  # noqa: PLC0415
    except Exception:
        _cache = None

    try:
        ai_result = await asyncio.wait_for(
            analyze_token(
                mint,
                lineage_result=lineage_result,
                bundle_report=bundle_result,
                sol_flow_report=sol_flow_result,
                cache=_cache,
            ),
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        logger.warning("AI analysis timed out for %s", mint)
        ai_result = None
    except Exception:
        logger.exception("AI analysis failed for %s", mint)
        ai_result = None

    return lineage_result, ai_result


async def scan_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /scan command with full forensic + AI analysis."""
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

    logger.info("Received scan request for %s", mint)
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
    root_deployer = root.deployer if root and root.deployer else None
    keyboard = _inline_keyboard(mint, deployer=root_deployer)

    await status_msg.edit_text(
        "\n".join(lines),
        parse_mode="HTML",
        reply_markup=keyboard,
    )


async def callback_query_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle inline keyboard button taps."""
    query = update.callback_query
    if not query:
        return
    data = query.data or ""

    if data.startswith("watch:deployer:"):
        deployer = data[len("watch:deployer:"):]
        chat_id = update.effective_chat.id
        try:
            inserted = await subscribe_alert(chat_id, "deployer", deployer)
            if inserted:
                await query.answer("✅ Now watching this deployer!", show_alert=False)
            else:
                await query.answer("ℹ️ Already watching this deployer", show_alert=False)
        except Exception:
            logger.exception("watch callback failed for chat %s", chat_id)
            await query.answer("❌ DB error — try /watch command instead", show_alert=True)
    else:
        await query.answer()


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
            "/watch narrative <code>&lt;theme&gt;</code> (pepe, ai, cat…)",
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
    try:
        inserted = await subscribe_alert(chat_id, sub_type, value)
    except Exception:
        logger.exception("subscribe_alert failed for chat %s", chat_id)
        await update.message.reply_text(
            "❌ Could not save subscription (DB error). Please try again later.",
            parse_mode="HTML",
        )
        return

    if inserted:
        await update.message.reply_text(
            f"✅ Watching <b>{_e(sub_type)}</b>: <code>{_e(value)}</code>\n"
            "You'll be notified when matching tokens appear.",
            parse_mode="HTML",
        )
    else:
        await update.message.reply_text(
            f"ℹ️ Already watching <b>{_e(sub_type)}</b>: <code>{_e(value)}</code>.",
            parse_mode="HTML",
        )


async def unwatch_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /unwatch <id>."""
    if not context.args:
        await update.message.reply_text(
            "Usage: /unwatch <code>&lt;id&gt;</code> — use /watches to see your subscription IDs.",
            parse_mode="HTML",
        )
        return

    try:
        sub_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("❌ ID must be a number.", parse_mode="HTML")
        return

    chat_id = update.effective_chat.id
    try:
        removed = await unsubscribe_alert(chat_id, sub_id)
    except Exception:
        logger.exception("unsubscribe_alert failed for chat %s", chat_id)
        await update.message.reply_text(
            "❌ Could not remove subscription (DB error). Please try again later.",
            parse_mode="HTML",
        )
        return
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


async def watches_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /watches — list all active subscriptions for this chat."""
    chat_id = update.effective_chat.id
    try:
        subs = await list_subscriptions(chat_id)
    except Exception:
        logger.exception("list_subscriptions failed for chat %s", chat_id)
        await update.message.reply_text(
            "❌ Could not load subscriptions (DB error). Please try again later.",
            parse_mode="HTML",
        )
        return

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
    lines.append("\n<i>/unwatch &lt;id&gt; to cancel.</i>")
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
    app.add_handler(CommandHandler("scan", scan_cmd))
    app.add_handler(CommandHandler("search", search_cmd))
    app.add_handler(CommandHandler("watch", watch_cmd))
    app.add_handler(CommandHandler("unwatch", unwatch_cmd))
    app.add_handler(CommandHandler("watches", watches_cmd))
    app.add_handler(CallbackQueryHandler(callback_query_handler))
    app.add_handler(InlineQueryHandler(inline_query_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, smart_text_handler))

    set_bot_app(app)
    return app


async def main() -> None:
    """
    WEBHOOK : set_webhook() chez Telegram, FastAPI reçoit les updates.
              PAS de run_webhook() — évite le conflit de port avec FastAPI.
    POLLING : fallback si TELEGRAM_WEBHOOK_URL absent.
    """
    import signal as _signal

    global _application
    _application = build_application()

    _webhook_url    = os.getenv("TELEGRAM_WEBHOOK_URL", "").strip()
    _webhook_secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()

    if _webhook_url and _webhook_url.startswith("https://"):
        logger.info("Bot starting in WEBHOOK mode: %s", _webhook_url)
        try:
            await _application.initialize()
            await _application.bot.set_webhook(
                url=_webhook_url,
                secret_token=_webhook_secret or None,
                allowed_updates=["message", "callback_query", "inline_query"],
            )
            await _application.start()
            logger.info("Webhook registered — FastAPI handles incoming updates")

            stop_event = asyncio.Event()
            loop = asyncio.get_running_loop()
            for sig in (_signal.SIGINT, _signal.SIGTERM):
                try:
                    loop.add_signal_handler(sig, stop_event.set)
                except NotImplementedError:
                    pass
            await stop_event.wait()

        except Exception as exc:
            logger.error("Webhook setup failed (%s) — falling back to polling", exc)
            try:
                await _application.stop()
                await _application.shutdown()
            except Exception:
                pass
            _application = build_application()
            await _application.run_polling(drop_pending_updates=True)
            return
        finally:
            try:
                await _application.stop()
                await _application.shutdown()
            except Exception:
                pass
    else:
        logger.info("Bot starting in POLLING mode (no TELEGRAM_WEBHOOK_URL)")
        await _application.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    asyncio.run(main())