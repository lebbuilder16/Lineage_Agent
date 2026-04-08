"""
Lineage Agent — Scheduled jobs

3 jobs:
  1. scan_new_tokens   — every 2h: fetch new tokens from DexScreener + KOL tweets, scan them, tweet high-risk
  2. monitor_kol       — every 2h:  reply to KOL tweets
  3. engage_mentions   — every 20min: reply to mentions (with daily cap + follower filter)

All `tweepy` calls are wrapped in `asyncio.to_thread` because tweepy is built
on the synchronous `requests` library — running it inline would block the
FastAPI event loop for the duration of every X round-trip.
"""

import asyncio
import os
import random
import uuid
import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from twitter.agent import (
    _get_twitter_client,
    # Token sourcing
    fetch_trending_memes_dexscreener, extract_solana_addresses,
    is_token_already_scanned, mark_token_scanned,
    # KOL
    list_kols, get_kol_last_seen, save_kol_state, resolve_kol_user_id,
    # Persistent meta (cursors, last-run, …)
    get_meta, set_meta,
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

# Dust filter — skip tokens below these thresholds before triggering the
# expensive forensic pipeline. Tunable via env without redeploying the code.
MIN_LIQUIDITY_USD = float(os.getenv("TWITTER_MIN_LIQUIDITY_USD", "100000"))
MIN_MARKET_CAP_USD = float(os.getenv("TWITTER_MIN_MARKET_CAP_USD", "800000"))

# Persistent cursor key for the engage_mentions cursor (stored in bot_meta).
META_LAST_MENTION_ID = "last_mention_id"

logger = logging.getLogger("lineage.scheduler")
scheduler = AsyncIOScheduler()


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
        # Uses the cached numeric user_id (set on first /addkol or first
        # successful resolve) to avoid the per-cycle `users/by/username` call.
        kols = await list_kols()
        client = _get_twitter_client()
        for handle in kols:
            try:
                user_id = await resolve_kol_user_id(handle)
                if not user_id:
                    continue
                tweets = await asyncio.to_thread(
                    client.get_users_tweets,
                    id=user_id, max_results=5, exclude=["retweets"],
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
            # ── Dust pre-filter ───────────────────────────────────────────
            # /token-meta is a cheap DAS+DexScreener lookup (~500ms, no AI
            # cost). Skipping dust here saves an estimated 70% of Anthropic
            # spend versus running the full /analyze pipeline on every token.
            try:
                meta_resp = await client.get(
                    f"{LINEAGE_API_BASE}/token-meta/{address}", timeout=15,
                )
                if meta_resp.status_code == 200:
                    meta = meta_resp.json() or {}
                    liq = float(meta.get("liquidity_usd") or 0)
                    mcap = float(meta.get("market_cap_usd") or 0)
                    if liq < MIN_LIQUIDITY_USD or mcap < MIN_MARKET_CAP_USD:
                        logger.info(
                            "[twitter] skip %s — dust (liq=$%.0f<%.0f, mcap=$%.0f<%.0f)",
                            address[:8], liq, MIN_LIQUIDITY_USD, mcap, MIN_MARKET_CAP_USD,
                        )
                        return None
            except Exception as exc:
                # Pre-check failure should never block the scan; fall through
                # to full analysis and let the main pipeline decide.
                logger.warning(
                    "[twitter] token-meta pre-check failed for %s: %s — "
                    "falling through to full /analyze",
                    address[:8], exc,
                )

            # ── Full forensic analysis ─────────────────────────────────────
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

@scheduler.scheduled_job("interval", hours=2, misfire_grace_time=600)
async def monitor_kol_tweets():
    """Poll KOL timelines every 2h.

    The X Free tier caps users/tweets at ~75 calls / 15 min, so we keep this
    job intentionally infrequent. Coupled with cached user_ids (resolve_kol_user_id),
    each cycle costs exactly 1 API call per KOL.
    """
    kols = await list_kols()  # Dynamic — from DB, managed via /addkol /removekol
    if not kols:
        return

    client = _get_twitter_client()
    for handle in kols:
        try:
            user_id = await resolve_kol_user_id(handle)
            if not user_id:
                continue

            tweets = await asyncio.to_thread(
                client.get_users_tweets,
                id=user_id, max_results=5, exclude=["retweets", "replies"],
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
    """Poll mentions of @LineageMemes and queue Telegram-approved replies.

    Reply conditions (all must hold):
      - We have not already replied to this tweet (engagement_log)
      - Daily reply count below MAX_REPLIES_PER_DAY (engagement_daily)
      - Author has >= MIN_FOLLOWER_COUNT followers
      - Claude doesn't return SKIP (troll/irrelevant)

    All replies go through Telegram approval (human-in-the-loop).

    The cursor (`since_id`) is persisted in the `bot_meta` table so a redeploy
    no longer re-scans the last batch of mentions and wastes ~10 API calls.
    """
    try:
        client = _get_twitter_client()
        me = await asyncio.to_thread(client.get_me)
        if not me.data:
            return

        kwargs = {"id": me.data.id, "max_results": 10, "tweet_fields": ["author_id", "conversation_id"]}
        last_mention_id = await get_meta(META_LAST_MENTION_ID)
        if last_mention_id:
            kwargs["since_id"] = last_mention_id

        mentions = await asyncio.to_thread(
            lambda: client.get_users_mentions(**kwargs)
        )
        if not mentions.data:
            return

        # Persist new cursor immediately so a crash mid-loop doesn't replay.
        await set_meta(META_LAST_MENTION_ID, str(mentions.data[0].id))

        for mention in mentions.data:
            tweet_id = str(mention.id)

            # ── Cheap DB checks BEFORE the expensive get_user API call ──
            # Saves 1 X API call per already-processed or quota-exceeded mention.
            from twitter.agent import has_already_replied, get_today_reply_count, MAX_REPLIES_PER_DAY
            if await has_already_replied(tweet_id):
                continue
            if await get_today_reply_count() >= MAX_REPLIES_PER_DAY:
                logger.info("[twitter] daily reply quota reached, skipping remaining mentions")
                break

            # Now we can afford the API call to fetch follower count.
            try:
                author = await asyncio.to_thread(
                    client.get_user,
                    id=mention.author_id, user_fields=["public_metrics"],
                )
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


# ============================================================
# JITTER — spread first execution of all jobs to avoid X burst quota
# ============================================================

def add_jitter(min_offset: int = 10, max_offset: int = 90) -> None:
    """Stagger every job's first run by a random offset.

    APScheduler defaults make all jobs fire at the same instant when the
    scheduler starts — that's a synchronised burst that can blow through
    Twitter's 15-minute window in one second. We move each job's
    `next_run_time` forward by 10–90 seconds so the first executions are
    spread out.
    """
    now = datetime.now()
    for job in scheduler.get_jobs():
        offset = random.randint(min_offset, max_offset)
        job.modify(next_run_time=now + timedelta(seconds=offset))
        logger.info(f"[twitter] jittered job '{job.id}' to +{offset}s")
