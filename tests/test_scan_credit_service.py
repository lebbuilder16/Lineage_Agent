"""Tests for lineage_agent.scan_credit_service — pay-per-scan system."""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import aiosqlite
import pytest

from lineage_agent.scan_credit_service import (
    CREDIT_PACKS,
    add_scan_credits,
    can_scan,
    deduct_scan_credit,
    get_scan_credits,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def mem_db():
    async with aiosqlite.connect(":memory:") as db:
        await db.execute("""
            CREATE TABLE users (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                privy_id       TEXT UNIQUE NOT NULL,
                email          TEXT,
                wallet_address TEXT,
                plan           TEXT NOT NULL DEFAULT 'free',
                api_key        TEXT UNIQUE NOT NULL,
                created_at     REAL NOT NULL,
                scan_credits   INTEGER NOT NULL DEFAULT 0
            )
        """)
        await db.execute("""
            CREATE TABLE usage_counters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                counter_key TEXT NOT NULL,
                date_key TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                updated_at REAL NOT NULL,
                UNIQUE(user_id, counter_key, date_key)
            )
        """)
        await db.commit()
        yield db


@pytest.fixture
def fake_cache(mem_db):
    cache = MagicMock()
    cache._get_conn = AsyncMock(return_value=mem_db)
    return cache


async def _seed_user(db, user_id: int = 1, plan: str = "free", credits: int = 0) -> int:
    await db.execute(
        "INSERT INTO users (id, privy_id, email, plan, api_key, created_at, scan_credits) "
        "VALUES (?, 'privy_test', 'u@test.com', ?, 'lin_abc123', ?, ?)",
        (user_id, plan, time.time(), credits),
    )
    await db.commit()
    return user_id


async def _set_daily_usage(db, user_id: int, count: int) -> None:
    import datetime
    date_key = datetime.date.today().isoformat()
    await db.execute(
        "INSERT OR REPLACE INTO usage_counters (user_id, counter_key, date_key, count, updated_at) "
        "VALUES (?, 'scans', ?, ?, ?)",
        (user_id, date_key, count, time.time()),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Credit pack definitions
# ---------------------------------------------------------------------------

class TestCreditPacks:
    def test_three_packs_defined(self):
        assert len(CREDIT_PACKS) == 3

    def test_single_pack(self):
        assert CREDIT_PACKS["single"]["credits"] == 1
        assert CREDIT_PACKS["single"]["price_usd"] == 0.30

    def test_five_pack(self):
        assert CREDIT_PACKS["five_pack"]["credits"] == 5
        assert CREDIT_PACKS["five_pack"]["price_usd"] == 1.29

    def test_fifteen_pack(self):
        assert CREDIT_PACKS["fifteen_pack"]["credits"] == 15
        assert CREDIT_PACKS["fifteen_pack"]["price_usd"] == 3.49

    def test_volume_discount(self):
        """Per-scan price decreases with larger packs."""
        single_per = CREDIT_PACKS["single"]["price_usd"] / CREDIT_PACKS["single"]["credits"]
        five_per = CREDIT_PACKS["five_pack"]["price_usd"] / CREDIT_PACKS["five_pack"]["credits"]
        fifteen_per = CREDIT_PACKS["fifteen_pack"]["price_usd"] / CREDIT_PACKS["fifteen_pack"]["credits"]
        assert five_per < single_per
        assert fifteen_per < five_per


# ---------------------------------------------------------------------------
# get_scan_credits
# ---------------------------------------------------------------------------

class TestGetScanCredits:
    async def test_returns_zero_for_new_user(self, fake_cache, mem_db):
        await _seed_user(mem_db, credits=0)
        assert await get_scan_credits(fake_cache, 1) == 0

    async def test_returns_existing_credits(self, fake_cache, mem_db):
        await _seed_user(mem_db, credits=15)
        assert await get_scan_credits(fake_cache, 1) == 15

    async def test_returns_zero_for_nonexistent_user(self, fake_cache, mem_db):
        assert await get_scan_credits(fake_cache, 999) == 0


# ---------------------------------------------------------------------------
# add_scan_credits
# ---------------------------------------------------------------------------

class TestAddScanCredits:
    async def test_adds_credits(self, fake_cache, mem_db):
        await _seed_user(mem_db, credits=0)
        new_balance = await add_scan_credits(fake_cache, 1, 5)
        assert new_balance == 5

    async def test_adds_to_existing(self, fake_cache, mem_db):
        await _seed_user(mem_db, credits=10)
        new_balance = await add_scan_credits(fake_cache, 1, 5)
        assert new_balance == 15

    async def test_zero_amount_no_change(self, fake_cache, mem_db):
        await _seed_user(mem_db, credits=10)
        new_balance = await add_scan_credits(fake_cache, 1, 0)
        assert new_balance == 10

    async def test_negative_amount_no_change(self, fake_cache, mem_db):
        await _seed_user(mem_db, credits=10)
        new_balance = await add_scan_credits(fake_cache, 1, -5)
        assert new_balance == 10


# ---------------------------------------------------------------------------
# deduct_scan_credit
# ---------------------------------------------------------------------------

class TestDeductScanCredit:
    async def test_deducts_one(self, fake_cache, mem_db):
        await _seed_user(mem_db, credits=5)
        assert await deduct_scan_credit(fake_cache, 1) is True
        assert await get_scan_credits(fake_cache, 1) == 4

    async def test_deducts_to_zero(self, fake_cache, mem_db):
        await _seed_user(mem_db, credits=1)
        assert await deduct_scan_credit(fake_cache, 1) is True
        assert await get_scan_credits(fake_cache, 1) == 0

    async def test_fails_at_zero(self, fake_cache, mem_db):
        await _seed_user(mem_db, credits=0)
        assert await deduct_scan_credit(fake_cache, 1) is False
        assert await get_scan_credits(fake_cache, 1) == 0

    async def test_atomic_no_negative(self, fake_cache, mem_db):
        """Credits should never go negative."""
        await _seed_user(mem_db, credits=0)
        assert await deduct_scan_credit(fake_cache, 1) is False


# ---------------------------------------------------------------------------
# can_scan
# ---------------------------------------------------------------------------

class TestCanScan:
    async def test_free_under_daily_limit(self, fake_cache, mem_db):
        await _seed_user(mem_db, plan="free", credits=0)
        await _set_daily_usage(mem_db, 1, 5)  # under 10
        allowed, source = await can_scan(fake_cache, 1, "free")
        assert allowed is True
        assert source == "daily_quota"

    async def test_free_over_limit_with_credits(self, fake_cache, mem_db):
        await _seed_user(mem_db, plan="free", credits=3)
        await _set_daily_usage(mem_db, 1, 10)  # at limit
        allowed, source = await can_scan(fake_cache, 1, "free")
        assert allowed is True
        assert source == "credit"

    async def test_free_over_limit_no_credits(self, fake_cache, mem_db):
        await _seed_user(mem_db, plan="free", credits=0)
        await _set_daily_usage(mem_db, 1, 10)  # at limit
        allowed, source = await can_scan(fake_cache, 1, "free")
        assert allowed is False
        assert source == "no_credits"

    async def test_pro_under_limit(self, fake_cache, mem_db):
        await _seed_user(mem_db, plan="pro", credits=0)
        await _set_daily_usage(mem_db, 1, 20)  # under 50
        allowed, source = await can_scan(fake_cache, 1, "pro")
        assert allowed is True
        assert source == "daily_quota"

    async def test_pro_over_limit(self, fake_cache, mem_db):
        await _seed_user(mem_db, plan="pro", credits=5)
        await _set_daily_usage(mem_db, 1, 50)  # at limit
        allowed, source = await can_scan(fake_cache, 1, "pro")
        assert allowed is False
        assert source == "daily_limit"  # no credit fallback for paid plans

    async def test_elite_under_limit(self, fake_cache, mem_db):
        await _seed_user(mem_db, plan="elite", credits=0)
        await _set_daily_usage(mem_db, 1, 99)  # under 100
        allowed, source = await can_scan(fake_cache, 1, "elite")
        assert allowed is True
        assert source == "daily_quota"

    async def test_no_usage_yet(self, fake_cache, mem_db):
        """No usage counter row yet → 0 usage → allowed."""
        await _seed_user(mem_db, plan="free", credits=0)
        allowed, source = await can_scan(fake_cache, 1, "free")
        assert allowed is True
        assert source == "daily_quota"
