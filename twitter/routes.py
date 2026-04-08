"""
Lineage Agent — Telegram webhook routes
Handles: draft approval, KOL management commands, text edits
"""

from fastapi import APIRouter, Request, HTTPException
import uuid
from config import TELEGRAM_WEBHOOK_SECRET
from twitter.agent import (
    get_draft, save_draft, delete_draft, get_awaiting_edit_draft,
    post_tweet, send_telegram, send_telegram_approval,
    add_kol, remove_kol, list_kols, log_reply,
)

router = APIRouter(prefix="/twitter")


@router.post("/telegram-webhook")
async def telegram_webhook(request: Request):
    # Webhook auth
    secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
    if secret != TELEGRAM_WEBHOOK_SECRET:
        raise HTTPException(status_code=403)

    data = await request.json()

    # --- Inline button callbacks (Approve / Edit / Reject) ---
    if "callback_query" in data:
        query = data["callback_query"]
        action, draft_id = query["data"].split(":", 1)
        draft = await get_draft(draft_id)

        if not draft:
            return {"ok": True}

        if action == "approve":
            success = await post_tweet(draft["text"], draft.get("reply_to"))
            if success:
                # If this was an engagement reply, log it
                if draft["type"] == "engagement" and draft.get("reply_to"):
                    await log_reply(draft["reply_to"], "unknown")
                await send_telegram(f"✅ Posté : {draft['text'][:80]}...")
            await delete_draft(draft_id)

        elif action == "reject":
            await send_telegram("❌ Rejeté.")
            await delete_draft(draft_id)

        elif action == "edit":
            draft["awaiting_edit"] = True
            await save_draft(draft_id, draft)
            await send_telegram(f"✏️ Envoie le texte corrigé :\n`{draft['text']}`")

    # --- Text messages: commands or edit replies ---
    elif "message" in data:
        msg = data["message"]
        text = msg.get("text", "").strip()

        # ---- Telegram Commands ----
        if text.startswith("/"):
            await handle_command(text)
            return {"ok": True}

        # ---- Edit flow ----
        result = await get_awaiting_edit_draft()
        if result:
            draft_id, draft = result
            draft["text"] = text
            draft["awaiting_edit"] = False
            await save_draft(draft_id, draft)
            await send_telegram(
                f"📝 Mis à jour :\n`{draft['text']}`",
                keyboard={"inline_keyboard": [[
                    {"text": "✅ Poster", "callback_data": f"approve:{draft_id}"},
                    {"text": "❌ Annuler", "callback_data": f"reject:{draft_id}"},
                ]]}
            )

    return {"ok": True}


async def handle_command(text: str):
    """
    Telegram bot commands:
      /addkol @handle      — Add a KOL to monitor
      /removekol @handle   — Remove a KOL
      /listkol             — Show all monitored KOLs
      /stats               — Today's engagement stats
      /scan <address>      — Manually trigger a scan (TODO: wire to Lineage)
    """
    parts = text.split(maxsplit=1)
    cmd = parts[0].lower().split("@")[0]  # strip bot username suffix
    arg = parts[1].strip() if len(parts) > 1 else ""

    if cmd == "/addkol":
        if not arg:
            await send_telegram("Usage: `/addkol @handle`")
            return
        added = await add_kol(arg)
        if added:
            await send_telegram(f"✅ KOL ajouté : `@{arg.lstrip('@').lower()}`")
        else:
            await send_telegram(f"⚠️ `@{arg.lstrip('@').lower()}` est déjà dans la liste.")

    elif cmd == "/removekol":
        if not arg:
            await send_telegram("Usage: `/removekol @handle`")
            return
        removed = await remove_kol(arg)
        if removed:
            await send_telegram(f"🗑 KOL retiré : `@{arg.lstrip('@').lower()}`")
        else:
            await send_telegram(f"⚠️ `@{arg.lstrip('@').lower()}` pas trouvé.")

    elif cmd == "/listkol":
        kols = await list_kols()
        if kols:
            listing = "\n".join(f"• @{h}" for h in kols)
            await send_telegram(f"📋 *KOL monitorés ({len(kols)})* :\n{listing}")
        else:
            await send_telegram("Aucun KOL. Ajoute avec `/addkol @handle`")

    elif cmd == "/stats":
        from twitter.agent import get_today_reply_count, MAX_REPLIES_PER_DAY
        count = await get_today_reply_count()
        await send_telegram(
            f"📊 *Stats du jour*\n"
            f"Réponses envoyées : {count}/{MAX_REPLIES_PER_DAY}"
        )

    elif cmd == "/scan":
        if not arg:
            await send_telegram("Usage: `/scan <token_address>`")
            return
        # TODO: wire to your Lineage scan pipeline
        await send_telegram(f"🔍 Scan manuel lancé pour `{arg[:12]}...`\n_(à connecter à ton pipeline Lineage)_")

    else:
        await send_telegram(
            "🤖 *Commandes :*\n"
            "`/addkol @handle` — Ajouter un KOL\n"
            "`/removekol @handle` — Retirer un KOL\n"
            "`/listkol` — Liste des KOL\n"
            "`/stats` — Stats engagement du jour\n"
            "`/scan <address>` — Scanner un token"
        )
