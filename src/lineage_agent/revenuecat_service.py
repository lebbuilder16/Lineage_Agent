"""RevenueCat webhook handler for subscription lifecycle events."""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

REVENUECAT_WEBHOOK_SECRET = os.getenv("REVENUECAT_WEBHOOK_SECRET", "")

RC_PRODUCT_TO_PLAN: dict[str, str] = {
    "lineage_pro_monthly": "pro",
    "lineage_pro_yearly": "pro",
    "lineage_elite_monthly": "elite",
    "lineage_elite_yearly": "elite",
    # Transition: old product IDs map to elite until all subscriptions renew
    "lineage_pro_plus_monthly": "elite",
    "lineage_pro_plus_yearly": "elite",
    "lineage_whale_monthly": "elite",
    "lineage_whale_yearly": "elite",
}


async def verify_webhook_auth(auth_header: str | None) -> bool:
    """Verify RevenueCat webhook authorization header."""
    if not REVENUECAT_WEBHOOK_SECRET:
        logger.warning("REVENUECAT_WEBHOOK_SECRET not set — rejecting all webhooks")
        return False
    return auth_header == f"Bearer {REVENUECAT_WEBHOOK_SECRET}"


async def handle_webhook_event(cache, event: dict) -> str | None:
    """Process a RevenueCat webhook event. Returns the updated plan or None."""
    event_type = event.get("type")
    app_user_id = event.get("app_user_id")
    product_id = event.get("product_id", "")

    if not app_user_id:
        logger.warning("RevenueCat webhook missing app_user_id")
        return None

    from .auth_service import upgrade_user_plan

    if event_type in ("INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE"):
        plan = RC_PRODUCT_TO_PLAN.get(product_id)
        if not plan:
            logger.warning("Unknown product_id: %s", product_id)
            return None
        # app_user_id is the Lineage user ID (set when configuring RC SDK)
        try:
            user_id = int(app_user_id)
        except (ValueError, TypeError):
            logger.warning("Invalid app_user_id: %s", app_user_id)
            return None
        ok = await upgrade_user_plan(cache, user_id, plan)
        if ok:
            logger.info("RevenueCat: user %s → %s (product=%s)", user_id, plan, product_id)
            return plan
        return None

    elif event_type in ("CANCELLATION", "EXPIRATION"):
        try:
            user_id = int(app_user_id)
        except (ValueError, TypeError):
            return None
        ok = await upgrade_user_plan(cache, user_id, "free")
        if ok:
            logger.info("RevenueCat: user %s → free (event=%s)", user_id, event_type)
            return "free"
        return None

    else:
        logger.debug("RevenueCat: ignoring event type %s", event_type)
        return None
