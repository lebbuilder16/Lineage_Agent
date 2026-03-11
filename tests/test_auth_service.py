"""Comprehensive tests for lineage_agent.auth_service.

All tests use an in-memory aiosqlite DB so there are no file-system side effects.
"""

from __future__ import annotations

import time
from unittest.mock import MagicMock

import aiosqlite
import pytest

from lineage_agent.auth_service import (
    add_user_watch,
    create_or_get_user,
    generate_api_key,
    get_notification_prefs,
    get_user_watches,
    register_fcm_token,
    remove_user_watch,
    update_notification_prefs,
    upgrade_user_plan,
    verify_api_key,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def mem_db():
    """In-memory SQLite DB with the users + user_watches schema."""
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
            CREATE TABLE user_watches (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                sub_type   TEXT NOT NULL,
                value      TEXT NOT NULL,
                created_at REAL NOT NULL,
                UNIQUE(user_id, sub_type, value)
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


# ---------------------------------------------------------------------------
# generate_api_key
# ---------------------------------------------------------------------------

class TestGenerateApiKey:
    def test_prefix(self):
        key = generate_api_key()
        assert key.startswith("lin_")

    def test_length(self):
        key = generate_api_key()
        # "lin_" (4) + 48 hex chars = 52 total
        assert len(key) == 52

    def test_uniqueness(self):
        keys = {generate_api_key() for _ in range(100)}
        assert len(keys) == 100

    def test_hex_portion(self):
        key = generate_api_key()
        hex_part = key[4:]
        assert all(c in "0123456789abcdef" for c in hex_part)


# ---------------------------------------------------------------------------
# create_or_get_user
# ---------------------------------------------------------------------------

class TestCreateOrGetUser:
    async def test_creates_new_user(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="p1", email="a@b.com")
        assert user["privy_id"] == "p1"
        assert user["email"] == "a@b.com"
        assert user["plan"] == "free"
        assert user["api_key"].startswith("lin_")
        assert user["id"] is not None

    async def test_idempotent_second_call(self, fake_cache):
        u1 = await create_or_get_user(fake_cache, privy_id="p2")
        u2 = await create_or_get_user(fake_cache, privy_id="p2")
        assert u1["id"] == u2["id"]
        assert u1["api_key"] == u2["api_key"]

    async def test_updates_wallet_on_second_call(self, fake_cache):
        await create_or_get_user(fake_cache, privy_id="p3")
        user = await create_or_get_user(
            fake_cache, privy_id="p3", wallet_address="WalletABC"
        )
        assert user["wallet_address"] == "WalletABC"

    async def test_updates_email_on_second_call(self, fake_cache):
        await create_or_get_user(fake_cache, privy_id="p4", email="old@x.com")
        user = await create_or_get_user(fake_cache, privy_id="p4", email="new@x.com")
        assert user["email"] == "new@x.com"

    async def test_no_update_when_same_wallet(self, fake_cache):
        await create_or_get_user(fake_cache, privy_id="p5", wallet_address="SAME")
        user = await create_or_get_user(fake_cache, privy_id="p5", wallet_address="SAME")
        assert user["wallet_address"] == "SAME"

    async def test_wallet_address_stored(self, fake_cache):
        user = await create_or_get_user(
            fake_cache, privy_id="p6", wallet_address="MyWallet"
        )
        assert user["wallet_address"] == "MyWallet"


# ---------------------------------------------------------------------------
# verify_api_key
# ---------------------------------------------------------------------------

class TestVerifyApiKey:
    async def test_valid_key_returns_user(self, fake_cache):
        created = await create_or_get_user(fake_cache, privy_id="vkey1")
        found = await verify_api_key(fake_cache, created["api_key"])
        assert found is not None
        assert found["privy_id"] == "vkey1"

    async def test_invalid_key_returns_none(self, fake_cache):
        result = await verify_api_key(fake_cache, "lin_notarealkey000000000000000000000000000000000000")
        assert result is None

    async def test_wrong_prefix_returns_none(self, fake_cache):
        result = await verify_api_key(fake_cache, "bad_prefix_key")
        assert result is None

    async def test_empty_key_returns_none(self, fake_cache):
        assert await verify_api_key(fake_cache, "") is None

    async def test_none_key_returns_none(self, fake_cache):
        assert await verify_api_key(fake_cache, None) is None  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# register_fcm_token
# ---------------------------------------------------------------------------

class TestRegisterFcmToken:
    async def test_register_token(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="fcm1")
        result = await register_fcm_token(fake_cache, user["id"], "fcm_token_abc123456789")
        assert result is True

    async def test_short_token_rejected(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="fcm2")
        result = await register_fcm_token(fake_cache, user["id"], "short")
        assert result is False

    async def test_empty_token_rejected(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="fcm3")
        result = await register_fcm_token(fake_cache, user["id"], "")
        assert result is False


# ---------------------------------------------------------------------------
# upgrade_user_plan
# ---------------------------------------------------------------------------

class TestUpgradeUserPlan:
    async def test_upgrade_to_pro(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="plan1")
        result = await upgrade_user_plan(fake_cache, user["id"], "pro")
        assert result is True

    async def test_downgrade_to_free(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="plan2")
        await upgrade_user_plan(fake_cache, user["id"], "pro")
        result = await upgrade_user_plan(fake_cache, user["id"], "free")
        assert result is True

    async def test_invalid_plan_rejected(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="plan3")
        result = await upgrade_user_plan(fake_cache, user["id"], "enterprise")
        assert result is False


# ---------------------------------------------------------------------------
# update_notification_prefs / get_notification_prefs
# ---------------------------------------------------------------------------

class TestNotificationPrefs:
    async def test_defaults_returned_for_new_user(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="np1")
        prefs = await get_notification_prefs(fake_cache, user["id"])
        assert isinstance(prefs, dict)
        assert "rug" in prefs
        assert "bundle" in prefs

    async def test_update_and_retrieve(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="np2")
        await update_notification_prefs(fake_cache, user["id"], {"rug": False, "zombie": True})
        prefs = await get_notification_prefs(fake_cache, user["id"])
        assert prefs["rug"] is False
        assert prefs["zombie"] is True

    async def test_unknown_keys_filtered(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="np3")
        result = await update_notification_prefs(
            fake_cache, user["id"], {"rug": True, "hacker_mode": True}
        )
        assert result is True
        prefs = await get_notification_prefs(fake_cache, user["id"])
        assert "hacker_mode" not in prefs

    async def test_returns_true_on_success(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="np4")
        result = await update_notification_prefs(fake_cache, user["id"], {"bundle": False})
        assert result is True


# ---------------------------------------------------------------------------
# get_user_watches / add_user_watch / remove_user_watch
# ---------------------------------------------------------------------------

class TestUserWatches:
    async def test_empty_watches_for_new_user(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="w1")
        watches = await get_user_watches(fake_cache, user["id"])
        assert watches == []

    async def test_add_watch(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="w2")
        watch = await add_user_watch(fake_cache, user["id"], "deployer", "DeployerABC")
        assert watch is not None
        assert watch["sub_type"] == "deployer"
        assert watch["value"] == "DeployerABC"

    async def test_add_duplicate_returns_none(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="w3")
        await add_user_watch(fake_cache, user["id"], "token", "MINT1")
        result = await add_user_watch(fake_cache, user["id"], "token", "MINT1")
        assert result is None

    async def test_get_watches_returns_all(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="w4")
        await add_user_watch(fake_cache, user["id"], "deployer", "D1")
        await add_user_watch(fake_cache, user["id"], "narrative", "meme")
        watches = await get_user_watches(fake_cache, user["id"])
        assert len(watches) == 2

    async def test_remove_watch(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="w5")
        watch = await add_user_watch(fake_cache, user["id"], "token", "MINTREM")
        assert watch is not None
        deleted = await remove_user_watch(fake_cache, user["id"], watch["id"])
        assert deleted is True
        watches = await get_user_watches(fake_cache, user["id"])
        assert watches == []

    async def test_remove_nonexistent_watch(self, fake_cache):
        user = await create_or_get_user(fake_cache, privy_id="w6")
        deleted = await remove_user_watch(fake_cache, user["id"], 99999)
        assert deleted is False

    async def test_watches_scoped_per_user(self, fake_cache):
        u1 = await create_or_get_user(fake_cache, privy_id="w7")
        u2 = await create_or_get_user(fake_cache, privy_id="w8")
        await add_user_watch(fake_cache, u1["id"], "deployer", "D1")
        watches_u2 = await get_user_watches(fake_cache, u2["id"])
        assert watches_u2 == []
