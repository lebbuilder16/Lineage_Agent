"""
auth_service.py — Phase 1 authentication helpers.

Provides API key generation, user upsert and verification.
No JWT dependency: the API key itself is the bearer token (simpler, stateless).
"""
from __future__ import annotations

import logging
import secrets
import time

logger = logging.getLogger(__name__)

_KEY_PREFIX = "lin_"
_KEY_BYTES = 24  # 48 hex chars → token = "lin_<48 hex>" = 52 chars total


def generate_api_key() -> str:
    """Return a new unforgeable API key: ``lin_<48 hex chars>``."""
    return _KEY_PREFIX + secrets.token_hex(_KEY_BYTES)


async def create_or_get_user(
    cache,  # SQLiteCache instance
    privy_id: str,
    wallet_address: str | None = None,
    email: str | None = None,
) -> dict:
    """
    Upsert a user row keyed on ``privy_id``.

    - If the user already exists → return stored record (+ update wallet/email).
    - If new → generate an API key, insert and return.
    """
    try:
        db = await cache._get_conn()

        # Try to find existing user
        cursor = await db.execute(
            "SELECT id, privy_id, email, wallet_address, plan, api_key, created_at "
            "FROM users WHERE privy_id = ?",
            (privy_id,),
        )
        row = await cursor.fetchone()

        if row:
            user = {
                "id": row[0],
                "privy_id": row[1],
                "email": row[2],
                "wallet_address": row[3],
                "plan": row[4],
                "api_key": row[5],
                "created_at": row[6],
            }
            # Update mutable fields if provided
            updates: list[tuple] = []
            if wallet_address and wallet_address != user["wallet_address"]:
                updates.append(("wallet_address", wallet_address))
            if email and email != user["email"]:
                updates.append(("email", email))
            for field, val in updates:
                await db.execute(
                    f"UPDATE users SET {field} = ? WHERE privy_id = ?",
                    (val, privy_id),
                )
                user[field] = val
            if updates:
                await db.commit()
            return user

        # New user
        api_key = generate_api_key()
        now = time.time()
        await db.execute(
            "INSERT INTO users (privy_id, email, wallet_address, plan, api_key, created_at) "
            "VALUES (?, ?, ?, 'free', ?, ?)",
            (privy_id, email, wallet_address, api_key, now),
        )
        await db.commit()

        cursor = await db.execute(
            "SELECT id FROM users WHERE privy_id = ?", (privy_id,)
        )
        row = await cursor.fetchone()
        return {
            "id": row[0],
            "privy_id": privy_id,
            "email": email,
            "wallet_address": wallet_address,
            "plan": "free",
            "api_key": api_key,
            "created_at": now,
        }

    except Exception:  # pragma: no cover
        logger.error("create_or_get_user failed for privy_id=%s", privy_id, exc_info=True)
        raise


async def regenerate_api_key(cache, user_id: int) -> str | None:
    """Generate a new API key for the user, invalidating the old one. Returns the new key."""
    new_key = generate_api_key()
    try:
        db = await cache._get_conn()
        await db.execute("UPDATE users SET api_key = ? WHERE id = ?", (new_key, user_id))
        await db.commit()
        return new_key
    except Exception:
        logger.warning("regenerate_api_key failed for user_id=%s", user_id, exc_info=True)
        return None


async def verify_api_key(cache, api_key: str) -> dict | None:
    """
    Look up a user by API key. Returns the user dict or None if invalid.
    Also records api_usage for rate-limit tracking (fire-and-forget).
    """
    if not api_key or not api_key.startswith(_KEY_PREFIX):
        return None
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "SELECT id, privy_id, email, wallet_address, plan, api_key, created_at "
            "FROM users WHERE api_key = ?",
            (api_key,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return {
            "id": row[0],
            "privy_id": row[1],
            "email": row[2],
            "wallet_address": row[3],
            "plan": row[4],
            "api_key": row[5],
            "created_at": row[6],
        }
    except Exception:
        logger.warning("verify_api_key failed", exc_info=True)
        return None


async def register_fcm_token(cache, user_id: int, fcm_token: str) -> bool:
    """
    Persist a Firebase Cloud Messaging device token for a user.

    Safe to call multiple times — idempotent UPDATE.
    Returns True on success, False on error.
    """
    if not fcm_token or len(fcm_token) < 10:
        return False
    try:
        db = await cache._get_conn()
        await db.execute(
            "UPDATE users SET fcm_token = ? WHERE id = ?",
            (fcm_token, user_id),
        )
        await db.commit()
        return True
    except Exception:
        logger.warning("register_fcm_token failed for user_id=%s", user_id, exc_info=True)
        return False


async def upgrade_user_plan(cache, user_id: int, plan: str) -> bool:
    """
    Update the ``plan`` column for a user.

    Accepted values: ``'free'``, ``'pro'``.
    Called by the RevenueCat webhook and the manual restore flow.
    Returns True on success.
    """
    if plan not in ("free", "pro", "pro_plus", "whale"):
        logger.warning("upgrade_user_plan: invalid plan %r for user_id=%s", plan, user_id)
        return False
    try:
        db = await cache._get_conn()
        await db.execute(
            "UPDATE users SET plan = ? WHERE id = ?",
            (plan, user_id),
        )
        await db.commit()
        logger.info("upgrade_user_plan: user_id=%s → %s", user_id, plan)
        return True
    except Exception:
        logger.warning("upgrade_user_plan failed for user_id=%s", user_id, exc_info=True)
        return False


async def update_notification_prefs(cache, user_id: int, prefs: dict) -> bool:
    """
    Persist notification preferences as a JSON blob in the users table.
    Accepted keys: ``rug``, ``bundle``, ``insider``, ``zombie`` (all booleans).
    Returns True on success.
    """
    import json as _json

    allowed_keys = {"rug", "bundle", "insider", "zombie"}
    sanitized = {k: bool(v) for k, v in prefs.items() if k in allowed_keys}
    try:
        db = await cache._get_conn()
        await db.execute(
            "UPDATE users SET notification_prefs = ? WHERE id = ?",
            (_json.dumps(sanitized), user_id),
        )
        await db.commit()
        return True
    except Exception:
        logger.warning("update_notification_prefs failed for user_id=%s", user_id, exc_info=True)
        return False


async def get_notification_prefs(cache, user_id: int) -> dict:
    """Return stored notification preferences or sensible defaults."""
    import json as _json

    defaults = {"rug": True, "bundle": True, "insider": True, "zombie": False}
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "SELECT notification_prefs FROM users WHERE id = ?", (user_id,)
        )
        row = await cursor.fetchone()
        if row and row[0]:
            stored = _json.loads(row[0])
            return {**defaults, **stored}
        return defaults
    except Exception:
        logger.warning("get_notification_prefs failed for user_id=%s", user_id, exc_info=True)
        return defaults


async def get_user_watches(cache, user_id: int) -> list[dict]:
    """Return all web watches for a user (sub_type, value, created_at)."""
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "SELECT id, sub_type, value, created_at FROM user_watches WHERE user_id = ? "
            "ORDER BY created_at DESC",
            (user_id,),
        )
        rows = await cursor.fetchall()
        return [
            {"id": r[0], "sub_type": r[1], "value": r[2], "created_at": r[3]}
            for r in rows
        ]
    except Exception:
        logger.warning("get_user_watches failed", exc_info=True)
        return []


async def add_user_watch(
    cache, user_id: int, sub_type: str, value: str
) -> dict | None:
    """Insert a watch for a user. Returns the watch dict or None if duplicate."""
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "INSERT OR IGNORE INTO user_watches (user_id, sub_type, value, created_at) "
            "VALUES (?, ?, ?, ?)",
            (user_id, sub_type, value, time.time()),
        )
        await db.commit()
        if cursor.rowcount == 0:
            return None  # duplicate
        cursor2 = await db.execute(
            "SELECT id, sub_type, value, created_at FROM user_watches "
            "WHERE user_id = ? AND sub_type = ? AND value = ?",
            (user_id, sub_type, value),
        )
        row = await cursor2.fetchone()
        return {"id": row[0], "sub_type": row[1], "value": row[2], "created_at": row[3]}
    except Exception:
        logger.warning("add_user_watch failed", exc_info=True)
        return None


async def remove_user_watch(cache, user_id: int, watch_id: int) -> bool:
    """Delete a watch by id (scoped to user). Returns True if deleted."""
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "DELETE FROM user_watches WHERE id = ? AND user_id = ?",
            (watch_id, user_id),
        )
        await db.commit()
        return cursor.rowcount == 1
    except Exception:
        logger.warning("remove_user_watch failed", exc_info=True)
        return False
