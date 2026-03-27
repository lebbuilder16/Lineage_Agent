"""Tests for lineage_agent.helio_service."""
from __future__ import annotations

import hashlib
import hmac as hmac_mod
import time
from unittest.mock import AsyncMock, MagicMock, patch

import aiosqlite
import httpx
import pytest

from lineage_agent.helio_service import (
    HELIO_PRODUCT_TO_PLAN,
    PLAN_PRICES_USDC,
    create_payment_link,
    handle_helio_event,
    verify_helio_webhook,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def mem_db():
    """In-memory SQLite DB with users + subscriptions schema."""
    async with aiosqlite.connect(":memory:") as db:
        await db.execute("""
            CREATE TABLE users (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                privy_id         TEXT UNIQUE NOT NULL,
                email            TEXT,
                wallet_address   TEXT,
                plan             TEXT NOT NULL DEFAULT 'free',
                api_key          TEXT UNIQUE NOT NULL,
                created_at       REAL NOT NULL,
                fcm_token        TEXT,
                notification_prefs TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE subscriptions (
                user_id        INTEGER PRIMARY KEY,
                plan           TEXT NOT NULL,
                payment_method TEXT NOT NULL,
                tx_signature   TEXT,
                is_active      INTEGER NOT NULL DEFAULT 1,
                updated_at     REAL NOT NULL
            )
        """)
        await db.commit()
        yield db


@pytest.fixture
def fake_cache(mem_db):
    """Minimal SQLiteCache stub backed by the in-memory DB."""
    cache = MagicMock()

    async def _get_conn():
        return mem_db

    cache._get_conn = _get_conn
    return cache


async def _seed_user(db, user_id: int = 1, plan: str = "free") -> int:
    await db.execute(
        "INSERT INTO users (id, privy_id, email, plan, api_key, created_at) "
        "VALUES (?, 'privy_test', 'u@test.com', ?, 'lin_abc123', ?)",
        (user_id, plan, time.time()),
    )
    await db.commit()
    return user_id


# ---------------------------------------------------------------------------
# HMAC verification
# ---------------------------------------------------------------------------

class TestVerifyHelioWebhook:
    @patch("lineage_agent.helio_service.HELIO_WEBHOOK_SECRET", "")
    async def test_no_secret_accepts_all(self):
        assert await verify_helio_webhook(b"body", None) is True

    @patch("lineage_agent.helio_service.HELIO_WEBHOOK_SECRET", "s3cret")
    async def test_valid_signature(self):
        body = b'{"status":"COMPLETED"}'
        sig = hmac_mod.new(b"s3cret", body, hashlib.sha256).hexdigest()
        assert await verify_helio_webhook(body, sig) is True

    @patch("lineage_agent.helio_service.HELIO_WEBHOOK_SECRET", "s3cret")
    async def test_invalid_signature(self):
        assert await verify_helio_webhook(b"body", "badsig") is False

    @patch("lineage_agent.helio_service.HELIO_WEBHOOK_SECRET", "s3cret")
    async def test_missing_signature(self):
        assert await verify_helio_webhook(b"body", None) is False


# ---------------------------------------------------------------------------
# Payment link creation
# ---------------------------------------------------------------------------

class TestCreatePaymentLink:
    @patch("lineage_agent.helio_service.HELIO_API_KEY", "")
    async def test_no_api_key_returns_none(self):
        result = await create_payment_link("pro", user_id=1)
        assert result is None

    async def test_unknown_plan_returns_none(self):
        result = await create_payment_link("nonexistent", user_id=1)
        assert result is None

    @patch("lineage_agent.helio_service.HELIO_API_KEY", "test-key")
    async def test_successful_link(self, respx_mock=None):
        """Mock httpx to return a payment URL."""
        mock_response = httpx.Response(
            200,
            json={"url": "https://pay.hel.io/abc123"},
            request=httpx.Request("POST", "https://api.hel.io/v1/pay"),
        )

        with patch("lineage_agent.helio_service.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = await create_payment_link("pro", user_id=42)
            assert result is not None
            assert result["url"] == "https://pay.hel.io/abc123"
            assert result["amount_usdc"] == 4.50

    @patch("lineage_agent.helio_service.HELIO_API_KEY", "test-key")
    async def test_api_error_returns_none(self):
        """API failure returns None gracefully."""
        with patch("lineage_agent.helio_service.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post.side_effect = httpx.HTTPStatusError(
                "500", request=MagicMock(), response=MagicMock()
            )
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = await create_payment_link("pro", user_id=1)
            assert result is None


# ---------------------------------------------------------------------------
# Event handling
# ---------------------------------------------------------------------------

class TestHandleHelioEvent:
    async def test_completed_upgrades_user(self, fake_cache, mem_db):
        uid = await _seed_user(mem_db)
        result = await handle_helio_event(fake_cache, {
            "status": "COMPLETED",
            "metadata": {"user_id": str(uid), "plan": "pro"},
            "transactionSignature": "5abc123",
        })
        assert result == "pro"
        async with mem_db.execute("SELECT plan FROM users WHERE id = ?", (uid,)) as cur:
            row = await cur.fetchone()
        assert row[0] == "pro"

    async def test_completed_stores_subscription(self, fake_cache, mem_db):
        uid = await _seed_user(mem_db)
        await handle_helio_event(fake_cache, {
            "status": "COMPLETED",
            "metadata": {"user_id": str(uid), "plan": "whale"},
            "transactionSignature": "txSIG",
        })
        async with mem_db.execute(
            "SELECT plan, payment_method, tx_signature FROM subscriptions WHERE user_id = ?",
            (uid,),
        ) as cur:
            row = await cur.fetchone()
        assert row is not None
        assert row[0] == "whale"
        assert row[1] == "helio_usdc"
        assert row[2] == "txSIG"

    async def test_non_completed_ignored(self, fake_cache, mem_db):
        uid = await _seed_user(mem_db)
        result = await handle_helio_event(fake_cache, {
            "status": "PENDING",
            "metadata": {"user_id": str(uid), "plan": "pro"},
        })
        assert result is None

    async def test_missing_metadata_user_id(self, fake_cache):
        result = await handle_helio_event(fake_cache, {
            "status": "COMPLETED",
            "metadata": {"plan": "pro"},
        })
        assert result is None

    async def test_missing_metadata_plan(self, fake_cache):
        result = await handle_helio_event(fake_cache, {
            "status": "COMPLETED",
            "metadata": {"user_id": "1"},
        })
        assert result is None

    async def test_invalid_plan_rejected(self, fake_cache, mem_db):
        uid = await _seed_user(mem_db)
        result = await handle_helio_event(fake_cache, {
            "status": "COMPLETED",
            "metadata": {"user_id": str(uid), "plan": "ultimate_vip"},
        })
        assert result is None

    async def test_non_numeric_user_id(self, fake_cache):
        result = await handle_helio_event(fake_cache, {
            "status": "COMPLETED",
            "metadata": {"user_id": "abc", "plan": "pro"},
        })
        assert result is None
