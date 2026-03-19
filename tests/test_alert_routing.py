"""Tests for Phase 2 Option B — alert routing and enrichment.

Covers:
- route_alert_to_channels with mocked Telegram/Discord delivery
- enrich_alert with mocked Claude client
- alert_prefs table creation
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import aiosqlite
import pytest

from lineage_agent.alert_service import (
    enrich_alert,
    route_alert_to_channels,
    _send_telegram,
)


# ---------------------------------------------------------------------------
# Helpers — in-memory DB with alert_prefs schema
# ---------------------------------------------------------------------------

async def _make_cache():
    """Create a minimal mock cache with an in-memory aiosqlite DB."""
    db = await aiosqlite.connect(":memory:")
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS alert_prefs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            channel TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            config_json TEXT,
            UNIQUE(user_id, channel)
        )
        """
    )
    await db.commit()

    cache = MagicMock()
    cache._get_conn = AsyncMock(return_value=db)
    return cache, db


# ---------------------------------------------------------------------------
# route_alert_to_channels
# ---------------------------------------------------------------------------

class TestRouteAlertToChannels:
    @pytest.mark.asyncio
    async def test_no_prefs_returns_empty(self):
        cache, db = await _make_cache()
        try:
            result = await route_alert_to_channels(cache, {"title": "Test"}, user_id=1)
            assert result == {"routed": [], "failed": []}
        finally:
            await db.close()

    @pytest.mark.asyncio
    async def test_telegram_routed(self):
        cache, db = await _make_cache()
        try:
            await db.execute(
                "INSERT INTO alert_prefs (user_id, channel, enabled, config_json) VALUES (?, ?, ?, ?)",
                (1, "telegram", 1, json.dumps({"bot_token": "tok", "chat_id": "123"})),
            )
            await db.commit()

            with patch("lineage_agent.alert_service._send_telegram", new_callable=AsyncMock) as mock_tg:
                result = await route_alert_to_channels(cache, {"title": "X", "body": "Y"}, user_id=1)
                assert "telegram" in result["routed"]
                mock_tg.assert_awaited_once()
        finally:
            await db.close()

    @pytest.mark.asyncio
    async def test_discord_routed(self):
        cache, db = await _make_cache()
        try:
            await db.execute(
                "INSERT INTO alert_prefs (user_id, channel, enabled, config_json) VALUES (?, ?, ?, ?)",
                (1, "discord", 1, json.dumps({"webhook_url": "https://discord.com/api/webhooks/x"})),
            )
            await db.commit()

            with patch("lineage_agent.alert_service._send_discord_webhook", new_callable=AsyncMock) as mock_dc:
                result = await route_alert_to_channels(cache, {"title": "A", "body": "B"}, user_id=1)
                assert "discord" in result["routed"]
                mock_dc.assert_awaited_once()
        finally:
            await db.close()

    @pytest.mark.asyncio
    async def test_disabled_pref_skipped(self):
        cache, db = await _make_cache()
        try:
            await db.execute(
                "INSERT INTO alert_prefs (user_id, channel, enabled, config_json) VALUES (?, ?, ?, ?)",
                (1, "telegram", 0, json.dumps({"bot_token": "tok", "chat_id": "123"})),
            )
            await db.commit()

            result = await route_alert_to_channels(cache, {"title": "X"}, user_id=1)
            assert result == {"routed": [], "failed": []}
        finally:
            await db.close()

    @pytest.mark.asyncio
    async def test_push_channel_routed(self):
        cache, db = await _make_cache()
        try:
            await db.execute(
                "INSERT INTO alert_prefs (user_id, channel, enabled, config_json) VALUES (?, ?, ?, ?)",
                (1, "push", 1, None),
            )
            await db.commit()

            result = await route_alert_to_channels(cache, {"title": "P"}, user_id=1)
            assert "push" in result["routed"]
        finally:
            await db.close()

    @pytest.mark.asyncio
    async def test_telegram_not_configured_fails(self):
        cache, db = await _make_cache()
        try:
            await db.execute(
                "INSERT INTO alert_prefs (user_id, channel, enabled, config_json) VALUES (?, ?, ?, ?)",
                (1, "telegram", 1, json.dumps({})),
            )
            await db.commit()

            result = await route_alert_to_channels(cache, {"title": "X"}, user_id=1)
            assert result["routed"] == []
            assert any("telegram" in f for f in result["failed"])
        finally:
            await db.close()


# ---------------------------------------------------------------------------
# enrich_alert
# ---------------------------------------------------------------------------

class TestEnrichAlert:
    @pytest.mark.asyncio
    async def test_enrichment_adds_fields(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text=json.dumps({
            "summary": "Suspicious activity",
            "risk_delta": "+15%",
            "recommended_action": "Monitor closely",
        }))]

        mock_client = MagicMock()
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        with patch("lineage_agent.alert_service._get_client", return_value=mock_client), \
             patch("lineage_agent.alert_service._MODEL", "claude-haiku-4-5-20251001"):
            # Patch the import inside enrich_alert
            import lineage_agent.alert_service as mod
            with patch.object(mod, "enrich_alert", wraps=mod.enrich_alert):
                with patch.dict("sys.modules", {
                    "lineage_agent.ai_analyst": MagicMock(
                        _get_client=MagicMock(return_value=mock_client),
                        _MODEL="claude-haiku-4-5-20251001",
                    )
                }):
                    result = await enrich_alert({"title": "Test", "body": "Details"})
                    assert result.get("summary") == "Suspicious activity"
                    assert result.get("risk_delta") == "+15%"
                    assert result.get("recommended_action") == "Monitor closely"

    @pytest.mark.asyncio
    async def test_enrichment_failure_returns_original(self):
        with patch.dict("sys.modules", {
            "lineage_agent.ai_analyst": None,  # force ImportError
        }):
            alert = {"title": "Test", "body": "Body"}
            result = await enrich_alert(alert)
            assert result == alert


# ---------------------------------------------------------------------------
# _send_telegram
# ---------------------------------------------------------------------------

class TestSendTelegram:
    @pytest.mark.asyncio
    async def test_sends_post_request(self):
        mock_response = MagicMock(status_code=200)
        mock_client_instance = AsyncMock()
        mock_client_instance.post = AsyncMock(return_value=mock_response)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)

        with patch("lineage_agent.alert_service.httpx.AsyncClient", return_value=mock_client_instance):
            await _send_telegram("bot123", "chat456", "Hello")
            mock_client_instance.post.assert_awaited_once()
            call_args = mock_client_instance.post.call_args
            assert "bot123" in call_args[0][0]
            assert call_args[1]["json"]["chat_id"] == "chat456"
