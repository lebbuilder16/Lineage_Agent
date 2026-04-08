"""
Lineage Agent — Twitter automation core
Human-in-the-loop via Telegram Bot
"""

import os
import re
import logging
import aiosqlite
import httpx
from datetime import datetime, timezone

from config import (
    TWITTER_API_KEY, TWITTER_API_SECRET,
    TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET,
    TELEGRAM_TOKEN, TELEGRAM_CHAT_ID,
    BIRDEYE_API_KEY,
    twitter_module_enabled,
)

logger = logging.getLogger("lineage.twitter")
DB_PATH = os.getenv("TWITTER_DB_PATH", "data/twitter_agent.db")

# ── Lazy client init ─────────────────────────────────────────────────────────
# Importing this module MUST succeed even when twitter secrets are missing
# (tests, local dev, CI, first boot). Clients are created on first use and
# any call that hits an unconfigured module raises RuntimeError with a clear
# message — consumers in api.py gate on twitter_module_enabled() first.
twitter_client = None  # type: ignore[assignment]
claude = None  # type: ignore[assignment]


def _get_twitter_client():
    global twitter_client
    if twitter_client is not None:
        return twitter_client
    if not twitter_module_enabled():
        raise RuntimeError("twitter module not configured — missing API credentials")
    import tweepy  # noqa: PLC0415
    twitter_client = tweepy.Client(
        consumer_key=TWITTER_API_KEY,
        consumer_secret=TWITTER_API_SECRET,
        access_token=TWITTER_ACCESS_TOKEN,
        access_token_secret=TWITTER_ACCESS_TOKEN_SECRET,
        wait_on_rate_limit=True,
    )
    return twitter_client


def _get_claude():
    global claude
    if claude is not None:
        return claude
    from anthropic import Anthropic  # noqa: PLC0415
    claude = Anthropic()
    return claude

# ============================================================
# DB
# ============================================================

async def init_db():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS drafts (
                draft_id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                type TEXT NOT NULL,
                reply_to TEXT,
                awaiting_edit INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS kol_accounts (
                handle TEXT PRIMARY KEY,
                added_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS kol_state (
                handle TEXT PRIMARY KEY,
                last_tweet_id TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS scanned_tokens (
                token_address TEXT PRIMARY KEY,
                source TEXT,
                scanned_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS engagement_log (
                tweet_id TEXT PRIMARY KEY,
                author_handle TEXT,
                replied_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS engagement_daily (
                date TEXT PRIMARY KEY,
                count INTEGER DEFAULT 0
            );
        """)
        await db.commit()

# ============================================================
# DRAFT CRUD
# ============================================================

async def save_draft(draft_id: str, draft: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO drafts (draft_id, text, type, reply_to, awaiting_edit) VALUES (?,?,?,?,?)",
            (draft_id, draft["text"], draft["type"], draft.get("reply_to"), int(draft.get("awaiting_edit", False)))
        )
        await db.commit()

async def get_draft(draft_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM drafts WHERE draft_id = ?", (draft_id,)) as cur:
            row = await cur.fetchone()
            if not row: return None
            return {"text": row["text"], "type": row["type"], "reply_to": row["reply_to"], "awaiting_edit": bool(row["awaiting_edit"])}

async def delete_draft(draft_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM drafts WHERE draft_id = ?", (draft_id,))
        await db.commit()

async def get_awaiting_edit_draft() -> tuple[str, dict] | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM drafts WHERE awaiting_edit = 1 LIMIT 1") as cur:
            row = await cur.fetchone()
            if not row: return None
            return row["draft_id"], {"text": row["text"], "type": row["type"], "reply_to": row["reply_to"], "awaiting_edit": True}

# ============================================================
# KOL MANAGEMENT (dynamic via Telegram commands)
# ============================================================

async def add_kol(handle: str) -> bool:
    handle = handle.lstrip("@").lower()
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute("INSERT INTO kol_accounts (handle) VALUES (?)", (handle,))
            await db.commit()
            return True
        except aiosqlite.IntegrityError:
            return False

async def remove_kol(handle: str) -> bool:
    handle = handle.lstrip("@").lower()
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("DELETE FROM kol_accounts WHERE handle = ?", (handle,))
        await db.commit()
        return cur.rowcount > 0

async def list_kols() -> list[str]:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT handle FROM kol_accounts ORDER BY added_at") as cur:
            return [r[0] for r in await cur.fetchall()]

async def save_kol_state(handle: str, tweet_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO kol_state (handle, last_tweet_id, updated_at) VALUES (?,?,?)",
            (handle, tweet_id, datetime.now(timezone.utc).isoformat())
        )
        await db.commit()

async def get_kol_last_seen(handle: str) -> str | None:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT last_tweet_id FROM kol_state WHERE handle = ?", (handle,)) as cur:
            row = await cur.fetchone()
            return row[0] if row else None

# ============================================================
# TOKEN SOURCING — what tokens get scanned
# ============================================================

async def fetch_new_tokens_birdeye() -> list[dict]:
    """New Solana tokens from Birdeye (min $1k liquidity to filter dust)."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://public-api.birdeye.so/defi/v2/tokens/new_listing",
                headers={"X-API-KEY": BIRDEYE_API_KEY, "x-chain": "solana"},
                params={"limit": 20, "min_liquidity": 1000},
            )
            resp.raise_for_status()
            items = resp.json().get("data", {}).get("items", [])
            return [{"address": t["address"], "symbol": t.get("symbol", "???"), "source": "birdeye"} for t in items]
    except Exception as e:
        logger.error(f"Birdeye fetch failed: {e}")
        return []

async def fetch_trending_memes_dexscreener() -> list[dict]:
    """
    Trending Solana memecoins from DexScreener, filtered to < 48h old.
    DexScreener API is free, no key required.
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Boosted tokens = tokens getting attention/trending on DexScreener
            resp = await client.get("https://api.dexscreener.com/token-boosts/top/v1")
            resp.raise_for_status()
            boosts = resp.json()

            cutoff = datetime.now(timezone.utc).timestamp() - (48 * 3600)
            results = []

            for token in boosts:
                if token.get("chainId") != "solana":
                    continue
                # Get pair details to check creation time
                addr = token.get("tokenAddress", "")
                if not addr:
                    continue

                # Fetch pair info for age check
                pair_resp = await client.get(f"https://api.dexscreener.com/tokens/v1/solana/{addr}")
                if pair_resp.status_code != 200:
                    continue

                pairs = pair_resp.json()
                if not pairs:
                    continue

                pair = pairs[0] if isinstance(pairs, list) else pairs
                created_at = pair.get("pairCreatedAt", 0)
                # pairCreatedAt is in ms
                if created_at and (created_at / 1000) >= cutoff:
                    results.append({
                        "address": addr,
                        "symbol": pair.get("baseToken", {}).get("symbol", "???"),
                        "source": "dexscreener_trending",
                    })

                if len(results) >= 15:
                    break

            return results
    except Exception as e:
        logger.error(f"DexScreener trending fetch failed: {e}")
        return []


def extract_solana_addresses(text: str) -> list[str]:
    """Extract Solana addresses from tweet text (base58, 32-44 chars)."""
    return [c for c in re.findall(r'\b[1-9A-HJ-NP-Za-km-z]{32,44}\b', text) if len(c) >= 32]

async def is_token_already_scanned(address: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT 1 FROM scanned_tokens WHERE token_address = ?", (address,)) as cur:
            return await cur.fetchone() is not None

async def mark_token_scanned(address: str, source: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("INSERT OR IGNORE INTO scanned_tokens (token_address, source) VALUES (?,?)", (address, source))
        await db.commit()

# ============================================================
# ENGAGEMENT — reply to mentions & followers
# ============================================================

MAX_REPLIES_PER_DAY = 20
MIN_FOLLOWER_COUNT = 50

async def get_today_reply_count() -> int:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT count FROM engagement_daily WHERE date = ?", (today,)) as cur:
            row = await cur.fetchone()
            return row[0] if row else 0

async def increment_reply_count():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO engagement_daily (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1",
            (today,),
        )
        await db.commit()

async def has_already_replied(tweet_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT 1 FROM engagement_log WHERE tweet_id = ?", (tweet_id,)) as cur:
            return await cur.fetchone() is not None

async def log_reply(tweet_id: str, author_handle: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("INSERT OR IGNORE INTO engagement_log (tweet_id, author_handle) VALUES (?,?)", (tweet_id, author_handle))
        await db.commit()
    await increment_reply_count()

async def should_engage(tweet_id: str, author_followers: int) -> tuple[bool, str]:
    if await has_already_replied(tweet_id):
        return False, "already_replied"
    if await get_today_reply_count() >= MAX_REPLIES_PER_DAY:
        return False, f"daily_limit_reached ({MAX_REPLIES_PER_DAY})"
    if author_followers < MIN_FOLLOWER_COUNT:
        return False, f"low_followers ({author_followers})"
    return True, "ok"

# ============================================================
# TELEGRAM
# ============================================================

async def send_telegram(text: str, keyboard: dict | None = None):
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "Markdown"}
    if keyboard:
        payload["reply_markup"] = keyboard
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json=payload)
            resp.raise_for_status()
    except httpx.HTTPError as e:
        logger.error(f"Telegram send failed: {e}")

async def send_telegram_approval(draft: str, context: str, draft_id: str):
    text = f"📋 *Draft tweet*\n\n```\n{draft}\n```\n\n📊 {context}\n🆔 `{draft_id}`"
    keyboard = {"inline_keyboard": [[
        {"text": "✅ Approve", "callback_data": f"approve:{draft_id}"},
        {"text": "✏️ Edit", "callback_data": f"edit:{draft_id}"},
        {"text": "❌ Reject", "callback_data": f"reject:{draft_id}"},
    ]]}
    await send_telegram(text, keyboard)

# ============================================================
# CLAUDE GENERATION
# ============================================================

async def generate_scan_tweet(scan_result: dict) -> str | None:
    prompt = f"""Tu es le compte Twitter de Lineage Agent, outil de forensic Solana.
Génère un tweet percutant (max 260 chars) basé sur ce scan :

Token: {scan_result['token_symbol']} ({scan_result['token_address'][:8]}...)
Risk Score: {scan_result['risk_score']}/100
Flags: {', '.join(scan_result['flags'])}
Bundle suspicious: {scan_result.get('bundle_suspicious', False)}

Règles :
- Emoji fort (🚨 >80, ⚠️ 50-80, ✅ <30)
- Score + 1-2 flags clés
- Termine par #Solana #LineageAgent
- Factuel, pas alarmiste — max 260 chars"""
    try:
        r = _get_claude().messages.create(model="claude-haiku-4-5-20251001", max_tokens=300, messages=[{"role": "user", "content": prompt}])
        return r.content[0].text
    except Exception as e:
        logger.error(f"Claude scan tweet failed: {e}")
        return None

async def generate_kol_reply(kol_tweet: str, kol_handle: str) -> str | None:
    prompt = f"""Tu es Lineage Agent, outil forensic Solana anti-rug-pull.
@{kol_handle} vient de tweeter : "{kol_tweet}"

Réponse (max 220 chars) :
- Valeur concrète, pas du spam
- Mentionne Lineage si pertinent
- Conversationnelle, pas publicitaire
Si pas lié à Solana/crypto/DeFi — retourne : SKIP"""
    try:
        r = _get_claude().messages.create(model="claude-haiku-4-5-20251001", max_tokens=250, messages=[{"role": "user", "content": prompt}])
        text = r.content[0].text.strip()
        return None if text == "SKIP" else text
    except Exception as e:
        logger.error(f"Claude KOL reply failed: {e}")
        return None

async def generate_engagement_reply(mention_text: str, author_handle: str) -> str | None:
    prompt = f"""Tu es Lineage Agent, outil forensic Solana anti-rug-pull.
@{author_handle} t'a mentionné : "{mention_text}"

Réponse (max 220 chars) :
- Réponds directement à leur question/commentaire
- Amical et utile
- Si demande de scan → suggère d'essayer Lineage
- Compliment → remercie brièvement
- Troll/hors sujet → SKIP
- JAMAIS de promesses financières"""
    try:
        r = _get_claude().messages.create(model="claude-haiku-4-5-20251001", max_tokens=250, messages=[{"role": "user", "content": prompt}])
        text = r.content[0].text.strip()
        return None if text == "SKIP" else text
    except Exception as e:
        logger.error(f"Claude engagement reply failed: {e}")
        return None

# ============================================================
# POST TO X
# ============================================================

async def post_tweet(text: str, reply_to: str | None = None) -> bool:
    import tweepy  # noqa: PLC0415
    try:
        client = _get_twitter_client()
        if reply_to:
            client.create_tweet(text=text, in_reply_to_tweet_id=reply_to)
        else:
            client.create_tweet(text=text)
        logger.info(f"Tweet posted: {text[:50]}...")
        return True
    except tweepy.TooManyRequests:
        logger.warning("X rate limit hit")
        await send_telegram("⏳ Rate limit X. Tweet reporté.")
        return False
    except tweepy.TweepyException as e:
        logger.error(f"Tweet failed: {e}")
        await send_telegram(f"❌ Erreur post: {str(e)[:100]}")
        return False
