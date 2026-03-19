"""Tests for the daily usage counter service."""

import datetime
from unittest.mock import patch

import pytest
import pytest_asyncio

from lineage_agent.usage_service import check_limit, get_usage, increment_usage


class MockCache:
    def __init__(self):
        self._db = None

    async def _get_conn(self):
        if self._db is None:
            import aiosqlite

            self._db = await aiosqlite.connect(":memory:")
            await self._db.execute(
                """CREATE TABLE usage_counters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    counter_key TEXT NOT NULL,
                    date_key TEXT NOT NULL,
                    count INTEGER NOT NULL DEFAULT 0,
                    updated_at REAL NOT NULL,
                    UNIQUE(user_id, counter_key, date_key))"""
            )
            await self._db.commit()
        return self._db


@pytest_asyncio.fixture
async def cache():
    c = MockCache()
    yield c
    if c._db is not None:
        await c._db.close()


@pytest.mark.asyncio
async def test_increment_creates_counter(cache):
    result = await increment_usage(cache, user_id=1, counter_key="scans")
    assert result == 1


@pytest.mark.asyncio
async def test_increment_increments_existing(cache):
    await increment_usage(cache, user_id=1, counter_key="scans")
    await increment_usage(cache, user_id=1, counter_key="scans")
    result = await increment_usage(cache, user_id=1, counter_key="scans")
    assert result == 3


@pytest.mark.asyncio
async def test_get_usage_returns_zero_for_missing(cache):
    result = await get_usage(cache, user_id=999, counter_key="nonexistent")
    assert result == 0


@pytest.mark.asyncio
async def test_check_limit_under_limit(cache):
    await increment_usage(cache, user_id=1, counter_key="scans")
    result = await check_limit(cache, user_id=1, counter_key="scans", limit=5)
    assert result is True


@pytest.mark.asyncio
async def test_check_limit_at_limit(cache):
    for _ in range(5):
        await increment_usage(cache, user_id=1, counter_key="scans")
    result = await check_limit(cache, user_id=1, counter_key="scans", limit=5)
    assert result is False


@pytest.mark.asyncio
async def test_check_limit_unlimited(cache):
    for _ in range(100):
        await increment_usage(cache, user_id=1, counter_key="scans")
    result = await check_limit(cache, user_id=1, counter_key="scans", limit=-1)
    assert result is True


@pytest.mark.asyncio
async def test_date_rollover(cache):
    # Increment under today's date
    await increment_usage(cache, user_id=1, counter_key="scans")
    await increment_usage(cache, user_id=1, counter_key="scans")

    # Patch date.today to simulate next day
    fake_tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    with patch("lineage_agent.usage_service.datetime") as mock_dt:
        mock_dt.date.today.return_value = fake_tomorrow
        fake_tomorrow_iso = fake_tomorrow.isoformat()
        mock_dt.date.today.return_value.isoformat.return_value = fake_tomorrow_iso

        # New day starts at 0
        result = await get_usage(cache, user_id=1, counter_key="scans")
        assert result == 0

        # Incrementing on new day starts fresh
        result = await increment_usage(cache, user_id=1, counter_key="scans")
        assert result == 1
