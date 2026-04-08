"""
Lineage Agent — Scheduled jobs

3 jobs:
  1. scan_new_tokens   — every 2h: fetch new tokens from Birdeye + KOL tweets, scan them, tweet high-risk
  2. monitor_kol       — every 30min: reply to KOL tweets
  3. engage_mentions   — every 20min: reply to mentions (with daily cap + follower filter)
"""

import os
import uuid
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from twitter.agent import (
    _get_twitter_client,
    # Token sourcing
    fetch_trending_memes_dexscreener, extract_solana_addresses,
    is_token_already_scanned, mark_token_scanned,
    # KOL
    list_kols, get_kol_last_seen, save_kol_state,
    # Engagement
    should_engage, log_reply,
    # Generation
    generate_scan_tweet, generate_kol_reply, generate_engagement_reply,
    # Drafts & Telegram
    save_draft, send_telegram_approval, send_telegram,
)

# Internal URL for the Lineage scan endpoint. Override via env for non-local
# deployments (e.g. sidecar / remote worker). Path matches the `/analyze/{mint}`
# endpoint defined in src/lineage_agent/api.py.
LINEAGE_API_BASE = os.getenv("LINEAGE_API_BASE", "http://localhost:8000")

logger = logging.getLogger("lineage.scheduler")
scheduler = AsyncIOScheduler()

# Store last seen mention ID across polls (persisted in memory, acceptable here
# because missing a mention just means we catch it next restart)
last_mention_id: str | None = None


# ============================================================
# JOB 1 — Token discovery + scan + tweet
# ============================================================

@scheduler.scheduled_job("interval", hours=2, misfire_grace_time=600)
async def scan_new_tokens():
    """
    Sources:
      A) Trending memecoins < 48h (DexScreener)
      B) Solana addresses mentioned in KOL tweets
    """
    try:
        tokens_to_scan = []

        # Source A: Trending memes < 48h
        trending = await fetch_trending_memes_dexscreener()
        for t in trending:
            if not await is_token_already_scanned(t["address"]):
                tokens_to_scan.append(t)

        # Source B: Token addresses from KOL tweets
        kols = await list_kols()
        for handle in kols:
            try:
                user = _get_twitter_client().get_user(username=handle)
                if not user.data:
                    continue
                tweets = _get_twitter_client().get_users_tweets(
                    id=user.data.id, max_results=5, exclude=["retweets"]
                )
                if not tweets.data:
                    continue
                for tweet in tweets.data:
                    for addr in extract_solana_addresses(tweet.text):
                        if not await is_token_already_scanned(addr):
                            tokens_to_scan.append({"address": addr, "symbol": "???", "source": f"kol:{handle}"})
            except Exception as e:
                logger.warning(f"KOL token extract @{handle}: {e}")

        if not tokens_to_scan:
            return

        logger.info(f"Scanning {len(tokens_to_scan)} tokens (trending + KOL)")

        for token in tokens_to_scan[:10]:  # Cap to avoid API overload
            await mark_token_scanned(token["address"], token["source"])

            # ---- YOUR LINEAGE SCAN CALL ----
            # Replace this with your actual scan function:
            # scan_result = await lineage_scan(token["address"])
            # For now, placeholder:
            scan_result = await run_lineage_scan(token["address"], token["symbol"])

            if scan_result and scan_result["risk_score"] >= 60:
                draft_text = await generate_scan_tweet(scan_result)
                if not draft_text:
                    continue

                draft_id = str(uuid.uuid4())[:8]
                await save_draft(draft_id, {"text": draft_text, "type": "scan", "reply_to": None})
                await send_telegram_approval(
                    draft=draft_text,
                    context=f"🔍 {scan_result['token_symbol']} — Score {scan_result['risk_score']}/100 — Source: {token['source']}",
                    draft_id=draft_id,
                )

    except Exception as e:
        logger.error(f"scan_new_tokens failed: {e}")
        await send_telegram(f"⚠️ Erreur scan tokens: {str(e)[:100]}")


async def run_lineage_scan(address: str, symbol: str) -> dict | None:
    """Call the main Lineage `/analyze/{mint}` endpoint and flatten the result.

    The forensic pipeline returns a 3-layer structure (token / ai_analysis /
    forensic). This helper collapses it into the shape the tweet generator
    expects:

        {
            "token_address": "...",
            "token_symbol": "...",
            "risk_score": 0-100,
            "flags": ["..."],
            "bundle_suspicious": bool,
        }
    """
    import httpx  # noqa: PLC0415
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.get(f"{LINEAGE_API_BASE}/analyze/{address}")
            if resp.status_code != 200:
                logger.warning(
                    "Lineage /analyze returned %s for %s: %s",
                    resp.status_code, address[:8], resp.text[:200],
                )
                return None
            payload = resp.json()
    except Exception as e:
        logger.error(f"Lineage scan failed for {address}: {e}")
        return None

    ai = payload.get("ai_analysis") or {}
    forensic = payload.get("forensic") or {}
    bundle = forensic.get("bundle") or {}
    sol_flow = forensic.get("sol_flow") or {}
    token = payload.get("token") or {}

    risk_score = ai.get("risk_score")
    if risk_score is None:
        return None

    # Flatten key findings / verdicts into a flag list the tweet template
    # can summarise. Keep short, lowercase, snake_case-ish tokens.
    flags: list[str] = []
    rug_pattern = ai.get("rug_pattern")
    if rug_pattern:
        flags.append(str(rug_pattern))
    bundle_verdict = bundle.get("verdict")
    if bundle_verdict and bundle_verdict not in ("clean", "no_bundle"):
        flags.append(f"bundle:{bundle_verdict}")
    if bundle.get("coordinated_sell_detected"):
        flags.append("coordinated_sell")
    if sol_flow.get("known_cex_detected"):
        flags.append("cex_exit")
    if sol_flow.get("cross_chain_exits_count", 0) > 0:
        flags.append("cross_chain_exit")
    # Top 2 findings as free-text tags (truncated)
    for finding in (ai.get("key_findings") or [])[:2]:
        if isinstance(finding, str) and finding:
            flags.append(finding[:60])

    return {
        "token_address": address,
        "token_symbol": token.get("symbol") or symbol or "???",
        "risk_score": int(round(float(risk_score))),
        "flags": flags,
        "bundle_suspicious": bool(bundle_verdict and bundle_verdict not in ("clean", "no_bundle")),
    }


# ============================================================
# JOB 2 — KOL monitoring (dynamic list)
# ============================================================

@scheduler.scheduled_job("interval", minutes=30, misfire_grace_time=300)
async def monitor_kol_tweets():
    kols = await list_kols()  # Dynamic — from DB, managed via /addkol /removekol
    if not kols:
        return

    for handle in kols:
        try:
            user = twitter_client.get_user(username=handle)
            if not user.data:
                continue

            tweets = twitter_client.get_users_tweets(
                id=user.data.id, max_results=5, exclude=["retweets", "replies"]
            )
            if not tweets.data:
                continue

            latest = tweets.data[0]
            last_seen = await get_kol_last_seen(handle)
            if last_seen == str(latest.id):
                continue

            await save_kol_state(handle, str(latest.id))

            reply_draft = await generate_kol_reply(latest.text, handle)
            if not reply_draft:
                continue

            draft_id = str(uuid.uuid4())[:8]
            await save_draft(draft_id, {"text": reply_draft, "type": "kol_reply", "reply_to": str(latest.id)})
            await send_telegram_approval(
                draft=reply_draft,
                context=f"Reply @{handle}: \"{latest.text[:80]}...\"",
                draft_id=draft_id,
            )
        except Exception as e:
            logger.error(f"KOL monitor @{handle}: {e}")


# ============================================================
# JOB 3 — Engagement (mentions & replies to our tweets)
# ============================================================

@scheduler.scheduled_job("interval", minutes=20, misfire_grace_time=300)
async def engage_mentions():
    """
    Poll mentions of @LineageAgent.
    Conditions to reply:
      - Author has >= 50 followers
      - Haven't replied to this tweet already
      - Daily reply count < 20
      - Claude doesn't return SKIP (troll/irrelevant)
    
    All replies go through Telegram approval (human-in-the-loop).
    """
    global last_mention_id

    try:
        # Get our own user ID
        client = _get_twitter_client()
        me = client.get_me()
        if not me.data:
            return

        kwargs = {"id": me.data.id, "max_results": 10, "tweet_fields": ["author_id", "conversation_id"]}
        if last_mention_id:
            kwargs["since_id"] = last_mention_id

        mentions = client.get_users_mentions(**kwargs)
        if not mentions.data:
            return

        # Update last seen
        last_mention_id = str(mentions.data[0].id)

        for mention in mentions.data:
            tweet_id = str(mention.id)

            # Get author info for follower check
            try:
                author = client.get_user(id=mention.author_id, user_fields=["public_metrics"])
                if not author.data:
                    continue
                followers = author.data.public_metrics.get("followers_count", 0)
                author_handle = author.data.username
            except Exception:
                continue

            ok, reason = await should_engage(tweet_id, followers)
            if not ok:
                logger.debug(f"Skip mention {tweet_id}: {reason}")
                continue

            reply_draft = await generate_engagement_reply(mention.text, author_handle)
            if not reply_draft:
                continue

            draft_id = str(uuid.uuid4())[:8]
            await save_draft(draft_id, {"text": reply_draft, "type": "engagement", "reply_to": tweet_id})
            await send_telegram_approval(
                draft=reply_draft,
                context=f"💬 Mention de @{author_handle} ({followers} followers): \"{mention.text[:80]}...\"",
                draft_id=draft_id,
            )

    except Exception as e:
        logger.error(f"engage_mentions failed: {e}")
