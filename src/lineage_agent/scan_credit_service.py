"""Scan credit service — pay-per-scan for Free tier users.

Free users who exceed their daily scan limit can purchase scan credits
with LINEAGE tokens. Credits are stored on the users table and deducted
atomically on each credit-funded scan.

Credit packs (priced in USD-equivalent, paid in LINEAGE):
  - single:       1 credit   → $0.30
  - five_pack:    5 credits  → $1.29  ($0.26/scan, -14%)
  - fifteen_pack: 15 credits → $3.49  ($0.23/scan, -23%)

At ~34 scans/month the user is better off subscribing to Pro ($9.99).
"""

from __future__ import annotations

import logging
from typing import Any

from .subscription_tiers import get_limits

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Credit pack definitions
# ---------------------------------------------------------------------------

CREDIT_PACKS: dict[str, dict[str, Any]] = {
    "single": {"credits": 1, "price_usd": 0.30, "label": "1 Scan"},
    "five_pack": {"credits": 5, "price_usd": 1.29, "label": "5 Scans"},
    "fifteen_pack": {"credits": 15, "price_usd": 3.49, "label": "15 Scans"},
}


# ---------------------------------------------------------------------------
# Credit operations
# ---------------------------------------------------------------------------

async def get_scan_credits(cache, user_id: int) -> int:
    """Return the current scan credit balance for a user."""
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "SELECT scan_credits FROM users WHERE id = ?", (user_id,)
        )
        row = await cursor.fetchone()
        return row[0] if row else 0
    except Exception:
        logger.warning("get_scan_credits failed for user_id=%s", user_id, exc_info=True)
        return 0


async def add_scan_credits(cache, user_id: int, amount: int) -> int:
    """Add credits to a user's balance. Returns the new balance."""
    if amount <= 0:
        return await get_scan_credits(cache, user_id)
    try:
        db = await cache._get_conn()
        await db.execute(
            "UPDATE users SET scan_credits = scan_credits + ? WHERE id = ?",
            (amount, user_id),
        )
        await db.commit()
        cursor = await db.execute(
            "SELECT scan_credits FROM users WHERE id = ?", (user_id,)
        )
        row = await cursor.fetchone()
        new_balance = row[0] if row else 0
        logger.info("add_scan_credits: user_id=%s +%d → %d", user_id, amount, new_balance)
        return new_balance
    except Exception:
        logger.warning("add_scan_credits failed for user_id=%s", user_id, exc_info=True)
        return 0


async def deduct_scan_credit(cache, user_id: int) -> bool:
    """Atomically deduct 1 credit. Returns True if successful, False if balance is 0."""
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "UPDATE users SET scan_credits = scan_credits - 1 "
            "WHERE id = ? AND scan_credits > 0",
            (user_id,),
        )
        await db.commit()
        return cursor.rowcount == 1
    except Exception:
        logger.warning("deduct_scan_credit failed for user_id=%s", user_id, exc_info=True)
        return False


# ---------------------------------------------------------------------------
# Scan authorization
# ---------------------------------------------------------------------------

async def can_scan(cache, user_id: int, plan: str) -> tuple[bool, str]:
    """Check if a user can perform a scan.

    Returns (allowed, source) where source is one of:
      - "daily_quota"  → under daily limit, no credit needed
      - "credit"       → daily limit exceeded, using a scan credit
      - "no_credits"   → daily limit exceeded, no credits available
      - "daily_limit"  → paid plan daily limit reached (no credit fallback)
    """
    from .usage_service import get_usage

    limits = get_limits(plan)
    daily_used = await get_usage(cache, user_id, "scans")

    if daily_used < limits.scans_per_day:
        return (True, "daily_quota")

    # Over daily limit — only Free users can fall back to credits
    if plan == "free":
        credits = await get_scan_credits(cache, user_id)
        if credits > 0:
            return (True, "credit")
        return (False, "no_credits")

    return (False, "daily_limit")
