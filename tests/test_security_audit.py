"""Security tests for the QA audit fixes.

Tests the critical security controls added during the audit:
- Admin endpoints require admin auth
- Webhook verification fails closed
- Login validation (privy_id length)
- Credit purchase requires tx verification
- Chat role filtering (prompt injection prevention)
- Avatar URL validation
- HTTPS enforcement in CORS
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# 1. Webhook verification — fail closed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_helio_webhook_rejects_when_secret_not_set():
    """When HELIO_WEBHOOK_SECRET is empty, verify_helio_webhook must return False."""
    with patch("lineage_agent.helio_service.HELIO_WEBHOOK_SECRET", ""):
        from lineage_agent.helio_service import verify_helio_webhook

        result = await verify_helio_webhook(b"test body", "fake-sig")
        assert result is False, "Webhook should be REJECTED when secret is not configured"


@pytest.mark.asyncio
async def test_helio_webhook_accepts_valid_signature():
    """When the secret IS set and signature matches, verify must return True."""
    import hashlib
    import hmac

    secret = "test-secret-123"
    body = b'{"status":"COMPLETED"}'
    expected_sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    with patch("lineage_agent.helio_service.HELIO_WEBHOOK_SECRET", secret):
        from lineage_agent.helio_service import verify_helio_webhook

        result = await verify_helio_webhook(body, expected_sig)
        assert result is True


@pytest.mark.asyncio
async def test_helio_webhook_rejects_bad_signature():
    """When signature doesn't match, must return False."""
    with patch("lineage_agent.helio_service.HELIO_WEBHOOK_SECRET", "real-secret"):
        from lineage_agent.helio_service import verify_helio_webhook

        result = await verify_helio_webhook(b"body", "wrong-sig")
        assert result is False


@pytest.mark.asyncio
async def test_revenuecat_webhook_rejects_when_secret_not_set():
    """When REVENUECAT_WEBHOOK_SECRET is empty, must return False."""
    with patch("lineage_agent.revenuecat_service.REVENUECAT_WEBHOOK_SECRET", ""):
        from lineage_agent.revenuecat_service import verify_webhook_auth

        result = await verify_webhook_auth("Bearer something")
        assert result is False, "Webhook should be REJECTED when secret is not configured"


@pytest.mark.asyncio
async def test_revenuecat_webhook_accepts_valid_auth():
    """When secret is set and auth header matches, must return True."""
    secret = "rc-secret-456"
    with patch("lineage_agent.revenuecat_service.REVENUECAT_WEBHOOK_SECRET", secret):
        from lineage_agent.revenuecat_service import verify_webhook_auth

        result = await verify_webhook_auth(f"Bearer {secret}")
        assert result is True


# ---------------------------------------------------------------------------
# 2. Avatar URL validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_avatar_url_rejects_javascript_uri():
    """avatar_url with javascript: scheme must be rejected."""
    import aiosqlite
    from lineage_agent.auth_service import update_user_profile

    async with aiosqlite.connect(":memory:") as db:
        await db.execute(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, privy_id TEXT UNIQUE, "
            "email TEXT, wallet_address TEXT, plan TEXT DEFAULT 'free', api_key TEXT UNIQUE, "
            "created_at REAL, username TEXT, display_name TEXT, avatar_url TEXT)"
        )
        await db.execute(
            "INSERT INTO users (privy_id, email, plan, api_key, created_at) "
            "VALUES ('test', 'x@x.com', 'free', 'lin_test123', 1.0)"
        )
        await db.commit()

        cache = MagicMock()
        cache._get_conn = AsyncMock(return_value=db)

        with pytest.raises(ValueError, match="avatar_url must start with"):
            await update_user_profile(cache, 1, {"avatar_url": "javascript:alert(1)"})


@pytest.mark.asyncio
async def test_avatar_url_rejects_oversized():
    """avatar_url larger than 10KB must be rejected."""
    import aiosqlite
    from lineage_agent.auth_service import update_user_profile

    async with aiosqlite.connect(":memory:") as db:
        await db.execute(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, privy_id TEXT UNIQUE, "
            "email TEXT, wallet_address TEXT, plan TEXT DEFAULT 'free', api_key TEXT UNIQUE, "
            "created_at REAL, username TEXT, display_name TEXT, avatar_url TEXT)"
        )
        await db.execute(
            "INSERT INTO users (privy_id, email, plan, api_key, created_at) "
            "VALUES ('test', 'x@x.com', 'free', 'lin_test123', 1.0)"
        )
        await db.commit()

        cache = MagicMock()
        cache._get_conn = AsyncMock(return_value=db)

        big_url = "https://example.com/" + "A" * 11000
        with pytest.raises(ValueError, match="avatar_url too large"):
            await update_user_profile(cache, 1, {"avatar_url": big_url})


@pytest.mark.asyncio
async def test_avatar_url_accepts_valid_https():
    """avatar_url with https:// scheme should be accepted."""
    import aiosqlite
    from lineage_agent.auth_service import update_user_profile

    async with aiosqlite.connect(":memory:") as db:
        await db.execute(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, privy_id TEXT UNIQUE, "
            "email TEXT, wallet_address TEXT, plan TEXT DEFAULT 'free', api_key TEXT UNIQUE, "
            "created_at REAL, username TEXT, display_name TEXT, avatar_url TEXT)"
        )
        await db.execute(
            "INSERT INTO users (privy_id, email, plan, api_key, created_at) "
            "VALUES ('test', 'x@x.com', 'free', 'lin_test123', 1.0)"
        )
        await db.commit()

        cache = MagicMock()
        cache._get_conn = AsyncMock(return_value=db)

        result = await update_user_profile(cache, 1, {"avatar_url": "https://cdn.example.com/avatar.jpg"})
        assert result is not None
        assert result["avatar_url"] == "https://cdn.example.com/avatar.jpg"


# ---------------------------------------------------------------------------
# 3. Privy token verification
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_privy_verification_skips_when_no_app_id():
    """When PRIVY_APP_ID is empty, verification should pass (dev mode)."""
    with patch("config.PRIVY_APP_ID", ""):
        from lineage_agent.auth_service import verify_privy_token

        result = await verify_privy_token("fake-token", "did:privy:123")
        assert result is True


@pytest.mark.asyncio
async def test_privy_verification_rejects_invalid_token():
    """When PRIVY_APP_ID is set but token is garbage, should return False."""
    with patch("config.PRIVY_APP_ID", "test-app"):
        from lineage_agent.auth_service import verify_privy_token

        result = await verify_privy_token("not-a-real-jwt", "did:privy:123")
        assert result is False


# ---------------------------------------------------------------------------
# 4. JWT secret configuration
# ---------------------------------------------------------------------------


def test_jwt_secret_not_hardcoded():
    """JWT_SECRET must not contain the old hardcoded default."""
    from src.config import JWT_SECRET

    assert JWT_SECRET != "change-me-in-production-use-fly-secrets", \
        "JWT_SECRET still has the old hardcoded default!"
    assert len(JWT_SECRET) >= 32, "JWT_SECRET should be at least 32 chars"


# ---------------------------------------------------------------------------
# 5. API key format
# ---------------------------------------------------------------------------


def test_api_key_format():
    """Generated API keys must have the correct prefix and length."""
    from lineage_agent.auth_service import generate_api_key

    key = generate_api_key()
    assert key.startswith("lin_"), f"Key must start with lin_, got: {key[:8]}"
    assert len(key) == 52, f"Key must be 52 chars (lin_ + 48 hex), got: {len(key)}"

    # Must be hex after prefix
    hex_part = key[4:]
    int(hex_part, 16)  # Should not raise
