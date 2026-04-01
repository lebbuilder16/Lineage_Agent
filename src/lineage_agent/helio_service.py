"""Helio Pay service — USDC subscription payments on Solana."""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time

import httpx

logger = logging.getLogger(__name__)

HELIO_API_KEY = os.getenv("HELIO_API_KEY", "")
HELIO_WEBHOOK_SECRET = os.getenv("HELIO_WEBHOOK_SECRET", "")
HELIO_API_BASE = "https://api.hel.io/v1"
USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

HELIO_PRODUCT_TO_PLAN: dict[str, str] = {
    "lineage_pro_usdc": "pro",
    "lineage_elite_usdc": "elite",
    # Transition: old product IDs map to elite
    "lineage_pro_plus_usdc": "elite",
    "lineage_whale_usdc": "elite",
}

PLAN_PRICES_USDC: dict[str, float] = {
    "pro": 9.99,
    "elite": 34.99,
}


async def create_payment_link(plan: str, user_id: int) -> dict | None:
    """Create a Helio Pay payment link for the given plan.

    Returns {"url": "https://...", "amount_usdc": 4.50} or None on failure.
    """
    amount = PLAN_PRICES_USDC.get(plan)
    if not amount:
        logger.warning("No USDC price for plan: %s", plan)
        return None

    if not HELIO_API_KEY:
        logger.warning("HELIO_API_KEY not set — cannot create payment link")
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{HELIO_API_BASE}/payment-link",
                headers={"Authorization": f"Bearer {HELIO_API_KEY}"},
                json={
                    "name": f"Lineage Agent {plan.replace('_', ' ').title()}",
                    "price": amount,
                    "currency": "USDC",
                    "blockchain": "SOLANA",
                    "metadata": {
                        "user_id": str(user_id),
                        "plan": plan,
                    },
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return {"url": data.get("url", ""), "amount_usdc": amount}
    except Exception as exc:
        logger.warning("Helio create_payment_link failed: %s", exc)
        return None


async def verify_helio_webhook(body: bytes, signature: str | None) -> bool:
    """Verify Helio webhook HMAC-SHA256 signature."""
    if not HELIO_WEBHOOK_SECRET:
        logger.warning("HELIO_WEBHOOK_SECRET not set — accepting all webhooks")
        return True
    if not signature:
        return False
    expected = hmac.new(
        HELIO_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def handle_helio_event(cache, event: dict) -> str | None:
    """Process a Helio webhook event. Returns the updated plan or None."""
    status = event.get("status")
    metadata = event.get("metadata", {})
    user_id_str = metadata.get("user_id")
    plan = metadata.get("plan")
    tx_signature = event.get("transactionSignature")

    if status != "COMPLETED":
        logger.debug("Helio: ignoring status %s", status)
        return None

    if not user_id_str or not plan:
        logger.warning("Helio webhook missing user_id or plan in metadata")
        return None

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        logger.warning("Invalid user_id in Helio metadata: %s", user_id_str)
        return None

    if plan not in HELIO_PRODUCT_TO_PLAN.values():
        logger.warning("Invalid plan in Helio metadata: %s", plan)
        return None

    from .auth_service import upgrade_user_plan

    ok = await upgrade_user_plan(cache, user_id, plan)
    if ok:
        logger.info("Helio: user %s → %s (tx=%s)", user_id, plan, tx_signature or "?")
        # Store tx signature in subscriptions table
        try:
            db = await cache._get_conn()
            now = time.time()
            await db.execute(
                "INSERT OR REPLACE INTO subscriptions "
                "(user_id, plan, payment_method, tx_signature, is_active, updated_at) "
                "VALUES (?, ?, 'helio_usdc', ?, 1, ?)",
                (user_id, plan, tx_signature, now),
            )
            await db.commit()
        except Exception:
            pass  # best-effort
        return plan
    return None
