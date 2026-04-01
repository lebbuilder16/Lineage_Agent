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
    for _attempt in range(8):
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

        except Exception as exc:
            if "locked" in str(exc).lower() and _attempt < 7:
                import asyncio as _aio
                await _aio.sleep(1.0 * (_attempt + 1))  # 1s, 2s, 3s... up to 7s
                continue
            logger.error(
                "create_or_get_user failed for privy_id=%s: %s",
                privy_id, exc, exc_info=True,
            )
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
    Retries on database locked errors.
    """
    if not api_key or not api_key.startswith(_KEY_PREFIX):
        return None
    for _attempt in range(5):
        try:
            db = await cache._get_conn()
            cursor = await db.execute(
                "SELECT id, privy_id, email, wallet_address, plan, api_key, created_at, "
                "username, display_name, avatar_url "
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
                "username": row[7],
                "display_name": row[8],
                "avatar_url": row[9],
            }
        except Exception as exc:
            if "locked" in str(exc).lower() and _attempt < 4:
                import asyncio as _aio
                await _aio.sleep(0.5 * (_attempt + 1))
                continue
            logger.warning("verify_api_key failed: %s", exc, exc_info=True)
            return None
    return None


import re as _re

_USERNAME_RE = _re.compile(r"^[a-zA-Z0-9_]{3,20}$")


async def update_user_profile(cache, user_id: int, updates: dict) -> dict | None:
    """Update username, display_name, avatar_url for a user. Returns updated user dict."""
    allowed = {}
    if "username" in updates and updates["username"] is not None:
        uname = str(updates["username"]).strip()
        if not _USERNAME_RE.match(uname):
            raise ValueError("username must be 3-20 alphanumeric/underscore characters")
        allowed["username"] = uname
    if "display_name" in updates and updates["display_name"] is not None:
        dname = str(updates["display_name"]).strip()[:50]
        if len(dname) < 1:
            raise ValueError("display_name must be at least 1 character")
        allowed["display_name"] = dname
    if "avatar_url" in updates and updates["avatar_url"] is not None:
        aurl = str(updates["avatar_url"])[:2000]
        allowed["avatar_url"] = aurl

    if not allowed:
        return None

    try:
        db = await cache._get_conn()
        # Username uniqueness check
        if "username" in allowed:
            cursor = await db.execute(
                "SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?",
                (allowed["username"], user_id),
            )
            if await cursor.fetchone():
                raise ValueError("username already taken")

        sets = ", ".join(f"{k} = ?" for k in allowed)
        vals = list(allowed.values()) + [user_id]
        await db.execute(f"UPDATE users SET {sets} WHERE id = ?", vals)
        await db.commit()

        cursor = await db.execute(
            "SELECT id, privy_id, email, wallet_address, plan, api_key, created_at, "
            "username, display_name, avatar_url FROM users WHERE id = ?",
            (user_id,),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return {
            "id": row[0], "privy_id": row[1], "email": row[2],
            "wallet_address": row[3], "plan": row[4], "api_key": row[5],
            "created_at": row[6], "username": row[7],
            "display_name": row[8], "avatar_url": row[9],
        }
    except ValueError:
        raise
    except Exception:
        logger.warning("update_user_profile failed for user_id=%s", user_id, exc_info=True)
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
    if plan not in ("free", "pro", "elite"):
        logger.warning("upgrade_user_plan: invalid plan %r for user_id=%s", plan, user_id)
        return False
    import asyncio
    for attempt in range(5):
        try:
            db = await cache._get_conn()
            await db.execute("PRAGMA busy_timeout = 5000")
            await db.execute(
                "UPDATE users SET plan = ? WHERE id = ?",
                (plan, user_id),
            )
            await db.commit()
            logger.info("upgrade_user_plan: user_id=%s → %s", user_id, plan)
            return True
        except Exception as exc:
            if "locked" in str(exc) and attempt < 4:
                logger.warning("upgrade_user_plan locked, retry %d/4", attempt + 1)
                await asyncio.sleep(1)
                continue
            logger.warning("upgrade_user_plan failed for user_id=%s: %s", user_id, exc, exc_info=True)
            raise


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
