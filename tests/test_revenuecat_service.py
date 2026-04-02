"""Tests for lineage_agent.revenuecat_service."""
from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import aiosqlite
import pytest

from lineage_agent.revenuecat_service import (
    RC_PRODUCT_TO_PLAN,
    handle_webhook_event,
    verify_webhook_auth,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def mem_db():
    """In-memory SQLite DB with the users schema."""
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
    """Insert a test user and return the user id."""
    await db.execute(
        "INSERT INTO users (id, privy_id, email, plan, api_key, created_at) "
        "VALUES (?, 'privy_test', 'u@test.com', ?, 'lin_abc123', ?)",
        (user_id, plan, time.time()),
    )
    await db.commit()
    return user_id


# ---------------------------------------------------------------------------
# Product mapping
# ---------------------------------------------------------------------------

class TestProductMapping:
    def test_monthly_pro(self):
        assert RC_PRODUCT_TO_PLAN["lineage_pro_monthly"] == "pro"

    def test_yearly_pro(self):
        assert RC_PRODUCT_TO_PLAN["lineage_pro_yearly"] == "pro"

    def test_elite_monthly(self):
        assert RC_PRODUCT_TO_PLAN["lineage_elite_monthly"] == "elite"

    def test_elite_yearly(self):
        assert RC_PRODUCT_TO_PLAN["lineage_elite_yearly"] == "elite"

    def test_legacy_pro_plus_maps_to_elite(self):
        assert RC_PRODUCT_TO_PLAN["lineage_pro_plus_monthly"] == "elite"

    def test_legacy_whale_maps_to_elite(self):
        assert RC_PRODUCT_TO_PLAN["lineage_whale_yearly"] == "elite"

    def test_unknown_product_not_in_map(self):
        assert "unknown_product" not in RC_PRODUCT_TO_PLAN


# ---------------------------------------------------------------------------
# Webhook auth
# ---------------------------------------------------------------------------

class TestVerifyWebhookAuth:
    @patch("lineage_agent.revenuecat_service.REVENUECAT_WEBHOOK_SECRET", "")
    async def test_no_secret_accepts_all(self):
        assert await verify_webhook_auth(None) is True
        assert await verify_webhook_auth("anything") is True

    @patch("lineage_agent.revenuecat_service.REVENUECAT_WEBHOOK_SECRET", "mysecret")
    async def test_valid_bearer(self):
        assert await verify_webhook_auth("Bearer mysecret") is True

    @patch("lineage_agent.revenuecat_service.REVENUECAT_WEBHOOK_SECRET", "mysecret")
    async def test_invalid_bearer(self):
        assert await verify_webhook_auth("Bearer wrong") is False

    @patch("lineage_agent.revenuecat_service.REVENUECAT_WEBHOOK_SECRET", "mysecret")
    async def test_missing_header(self):
        assert await verify_webhook_auth(None) is False


# ---------------------------------------------------------------------------
# Event handling
# ---------------------------------------------------------------------------

class TestHandleWebhookEvent:
    async def test_initial_purchase_upgrades(self, fake_cache, mem_db):
        uid = await _seed_user(mem_db)
        result = await handle_webhook_event(fake_cache, {
            "type": "INITIAL_PURCHASE",
            "app_user_id": str(uid),
            "product_id": "lineage_pro_monthly",
        })
        assert result == "pro"
        async with mem_db.execute("SELECT plan FROM users WHERE id = ?", (uid,)) as cur:
            row = await cur.fetchone()
        assert row[0] == "pro"

    async def test_renewal_upgrades(self, fake_cache, mem_db):
        uid = await _seed_user(mem_db, plan="pro")
        result = await handle_webhook_event(fake_cache, {
            "type": "RENEWAL",
            "app_user_id": str(uid),
            "product_id": "lineage_elite_yearly",
        })
        assert result == "elite"

    async def test_cancellation_downgrades(self, fake_cache, mem_db):
        uid = await _seed_user(mem_db, plan="pro")
        result = await handle_webhook_event(fake_cache, {
            "type": "CANCELLATION",
            "app_user_id": str(uid),
            "product_id": "",
        })
        assert result == "free"
        async with mem_db.execute("SELECT plan FROM users WHERE id = ?", (uid,)) as cur:
            row = await cur.fetchone()
        assert row[0] == "free"

    async def test_expiration_downgrades(self, fake_cache, mem_db):
        uid = await _seed_user(mem_db, plan="elite")
        result = await handle_webhook_event(fake_cache, {
            "type": "EXPIRATION",
            "app_user_id": str(uid),
            "product_id": "",
        })
        assert result == "free"

    async def test_unknown_event_returns_none(self, fake_cache, mem_db):
        uid = await _seed_user(mem_db)
        result = await handle_webhook_event(fake_cache, {
            "type": "SUBSCRIBER_ALIAS",
            "app_user_id": str(uid),
        })
        assert result is None

    async def test_missing_app_user_id(self, fake_cache):
        result = await handle_webhook_event(fake_cache, {
            "type": "INITIAL_PURCHASE",
            "product_id": "lineage_pro_monthly",
        })
        assert result is None

    async def test_unknown_product_id(self, fake_cache, mem_db):
        uid = await _seed_user(mem_db)
        result = await handle_webhook_event(fake_cache, {
            "type": "INITIAL_PURCHASE",
            "app_user_id": str(uid),
            "product_id": "some_other_product",
        })
        assert result is None

    async def test_non_numeric_user_id(self, fake_cache):
        result = await handle_webhook_event(fake_cache, {
            "type": "INITIAL_PURCHASE",
            "app_user_id": "not-a-number",
            "product_id": "lineage_pro_monthly",
        })
        assert result is None
