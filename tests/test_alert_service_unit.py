"""Unit tests for lineage_agent.alert_service — pure functions and light async paths.

Focuses on:
- _esc() — pure MarkdownV2 escaping
- set_bot_app / register_web_client / unregister_web_client
- schedule_alert_sweep / cancel_alert_sweep lifecycle
- _send_alert with a mocked bot
- _run_alert_sweep with fully mocked external dependencies
- _broadcast_web_alert with mock WebSocket clients
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lineage_agent.alert_service import (
    _esc,
    cancel_alert_sweep,
    register_web_client,
    schedule_alert_sweep,
    set_bot_app,
    unregister_web_client,
)


# ---------------------------------------------------------------------------
# _esc — Telegram MarkdownV2 escaping
# ---------------------------------------------------------------------------

class TestEsc:
    def test_plain_text_unchanged(self):
        assert _esc("hello world") == "hello world"

    def test_underscore_escaped(self):
        assert _esc("hello_world") == r"hello\_world"

    def test_asterisk_escaped(self):
        assert _esc("a*b") == r"a\*b"

    def test_backtick_escaped(self):
        assert _esc("`code`") == r"\`code\`"

    def test_parentheses_escaped(self):
        assert _esc("(test)") == r"\(test\)"

    def test_dot_escaped(self):
        assert _esc("v1.2.3") == r"v1\.2\.3"

    def test_exclamation_escaped(self):
        assert _esc("Hello!") == r"Hello\!"

    def test_multiple_special_chars(self):
        result = _esc("_*[]~")
        assert result == r"\_\*\[\]\~"

    def test_empty_string(self):
        assert _esc("") == ""

    def test_all_special_chars(self):
        special = r"_*[]()~`>#+-=|{}.!"
        result = _esc(special)
        assert all(c == "\\" or c in special for c in result)
        # Every special char should be preceded by backslash
        for char in special:
            assert f"\\{char}" in result

    def test_normal_alphanumeric(self):
        assert _esc("ABC123") == "ABC123"


# ---------------------------------------------------------------------------
# set_bot_app / _send_alert
# ---------------------------------------------------------------------------

class TestSetBotApp:
    def test_registers_bot(self):
        import lineage_agent.alert_service as svc
        original = svc._bot_app
        bot = MagicMock()
        set_bot_app(bot)
        assert svc._bot_app is bot
        # Restore
        svc._bot_app = original


class TestSendAlert:
    async def test_send_with_bot(self):
        from lineage_agent.alert_service import _send_alert

        mock_bot = AsyncMock()
        mock_app = MagicMock()
        mock_app.bot = mock_bot

        import lineage_agent.alert_service as svc
        original = svc._bot_app
        svc._bot_app = mock_app
        try:
            await _send_alert(chat_id=123, text="Test alert")
            mock_bot.send_message.assert_called_once()
            call_kwargs = mock_bot.send_message.call_args
            assert call_kwargs.kwargs["chat_id"] == 123
        finally:
            svc._bot_app = original

    async def test_no_bot_app_is_noop(self):
        from lineage_agent.alert_service import _send_alert

        import lineage_agent.alert_service as svc
        original = svc._bot_app
        svc._bot_app = None
        try:
            # Should not raise
            await _send_alert(chat_id=456, text="No bot registered")
        finally:
            svc._bot_app = original

    async def test_send_exception_is_swallowed(self):
        from lineage_agent.alert_service import _send_alert

        mock_bot = AsyncMock(send_message=AsyncMock(side_effect=Exception("network error")))
        mock_app = MagicMock()
        mock_app.bot = mock_bot

        import lineage_agent.alert_service as svc
        original = svc._bot_app
        svc._bot_app = mock_app
        try:
            await _send_alert(chat_id=789, text="Will fail silently")
        finally:
            svc._bot_app = original


# ---------------------------------------------------------------------------
# register_web_client / unregister_web_client
# ---------------------------------------------------------------------------

class TestWebClients:
    def test_register_adds_client(self):
        import lineage_agent.alert_service as svc
        original = set(svc._web_clients)
        ws = MagicMock()
        register_web_client(ws)
        assert ws in svc._web_clients
        svc._web_clients.clear()
        svc._web_clients.update(original)

    def test_unregister_removes_client(self):
        import lineage_agent.alert_service as svc
        ws = MagicMock()
        svc._web_clients.add(ws)
        unregister_web_client(ws)
        assert ws not in svc._web_clients

    def test_unregister_nonexistent_is_noop(self):
        import lineage_agent.alert_service as svc
        ws = MagicMock()
        # Should not raise even if ws was never registered
        unregister_web_client(ws)


# ---------------------------------------------------------------------------
# _broadcast_web_alert
# ---------------------------------------------------------------------------

class TestBroadcastWebAlert:
    async def test_broadcasts_to_connected_clients(self):
        from lineage_agent.alert_service import _broadcast_web_alert

        import lineage_agent.alert_service as svc
        ws = AsyncMock()
        svc._web_clients.add(ws)
        try:
            with patch.object(svc, "asyncio") as mock_asyncio:
                mock_asyncio.ensure_future = MagicMock()
                await _broadcast_web_alert({"event": "alert", "type": "test", "mint": None})
            ws.send_json.assert_called_once()
        finally:
            svc._web_clients.discard(ws)

    async def test_dead_client_removed(self):
        from lineage_agent.alert_service import _broadcast_web_alert

        import lineage_agent.alert_service as svc
        dead_ws = AsyncMock()
        dead_ws.send_json = AsyncMock(side_effect=Exception("disconnected"))
        svc._web_clients.add(dead_ws)
        try:
            await _broadcast_web_alert({"event": "alert", "type": "test", "mint": None})
            assert dead_ws not in svc._web_clients
        finally:
            svc._web_clients.discard(dead_ws)


# ---------------------------------------------------------------------------
# schedule_alert_sweep / cancel_alert_sweep
# ---------------------------------------------------------------------------

class TestScheduleCancel:
    async def test_schedule_creates_task(self, monkeypatch):
        import lineage_agent.alert_service as svc

        async def _fast_sweep():
            await asyncio.sleep(0)

        monkeypatch.setattr(svc, "_sweep_loop", _fast_sweep)
        monkeypatch.setattr(svc, "_sweep_task", None)

        schedule_alert_sweep()
        task = svc._sweep_task
        assert task is not None
        # Clean up
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    async def test_cancel_stops_task(self, monkeypatch):
        import lineage_agent.alert_service as svc

        async def _long_loop():
            await asyncio.sleep(9999)

        monkeypatch.setattr(svc, "_sweep_loop", _long_loop)
        monkeypatch.setattr(svc, "_sweep_task", None)

        schedule_alert_sweep()
        cancel_alert_sweep()
        await asyncio.sleep(0)
        assert svc._sweep_task is None or svc._sweep_task.done() or svc._sweep_task.cancelled()

    async def test_double_schedule_noop(self, monkeypatch):
        """Scheduling twice should not create a second task."""
        import lineage_agent.alert_service as svc

        async def _long_loop():
            await asyncio.sleep(9999)

        monkeypatch.setattr(svc, "_sweep_loop", _long_loop)
        monkeypatch.setattr(svc, "_sweep_task", None)

        schedule_alert_sweep()
        task1 = svc._sweep_task
        schedule_alert_sweep()
        task2 = svc._sweep_task
        assert task1 is task2  # Same task — not replaced
        task1.cancel()
        try:
            await task1
        except (asyncio.CancelledError, Exception):
            pass


# ---------------------------------------------------------------------------
# _run_alert_sweep — mocked external dependencies
# ---------------------------------------------------------------------------

class TestRunAlertSweep:
    async def test_returns_zero_when_no_subscriptions(self):
        from lineage_agent.alert_service import _run_alert_sweep

        with patch("lineage_agent.alert_service.all_subscriptions", new_callable=AsyncMock, return_value=[]):
            count = await _run_alert_sweep()
        assert count == 0

    async def test_dispatches_deployer_alert(self):
        from lineage_agent.alert_service import _run_alert_sweep

        sub = {"sub_type": "deployer", "value": "DeployerXXX", "chat_id": 111}
        row = {"mint": "MINTABC", "name": "RugCoin", "symbol": "RUG", "mcap_usd": 50000}

        with (
            patch("lineage_agent.alert_service.all_subscriptions", new_callable=AsyncMock, return_value=[sub]),
            patch("lineage_agent.alert_service.event_query", new_callable=AsyncMock, return_value=[row]),
            patch("lineage_agent.alert_service._send_alert", new_callable=AsyncMock) as mock_send,
            patch("lineage_agent.alert_service._broadcast_web_alert", new_callable=AsyncMock),
        ):
            count = await _run_alert_sweep()

        assert count > 0
        mock_send.assert_called_once()

    async def test_dispatches_narrative_alert(self):
        from lineage_agent.alert_service import _run_alert_sweep

        sub = {"sub_type": "narrative", "value": "meme", "chat_id": 222}
        row = {"mint": "MINT2", "name": "MemeCoin", "symbol": "MEME", "mcap_usd": None}

        with (
            patch("lineage_agent.alert_service.all_subscriptions", new_callable=AsyncMock, return_value=[sub]),
            patch("lineage_agent.alert_service.event_query", new_callable=AsyncMock, return_value=[row]),
            patch("lineage_agent.alert_service._send_alert", new_callable=AsyncMock) as mock_send,
            patch("lineage_agent.alert_service._broadcast_web_alert", new_callable=AsyncMock),
        ):
            count = await _run_alert_sweep()

        assert count > 0
        mock_send.assert_called_once()

    async def test_skips_sub_with_missing_fields(self):
        from lineage_agent.alert_service import _run_alert_sweep

        # sub missing chat_id
        sub = {"sub_type": "deployer", "value": "D1"}

        with (
            patch("lineage_agent.alert_service.all_subscriptions", new_callable=AsyncMock, return_value=[sub]),
            patch("lineage_agent.alert_service._send_alert", new_callable=AsyncMock) as mock_send,
        ):
            count = await _run_alert_sweep()

        assert count == 0
        mock_send.assert_not_called()

    async def test_empty_rows_no_dispatch(self):
        from lineage_agent.alert_service import _run_alert_sweep

        sub = {"sub_type": "deployer", "value": "D2", "chat_id": 333}

        with (
            patch("lineage_agent.alert_service.all_subscriptions", new_callable=AsyncMock, return_value=[sub]),
            patch("lineage_agent.alert_service.event_query", new_callable=AsyncMock, return_value=[]),
            patch("lineage_agent.alert_service._send_alert", new_callable=AsyncMock) as mock_send,
        ):
            count = await _run_alert_sweep()

        assert count == 0
        mock_send.assert_not_called()


# ---------------------------------------------------------------------------
# _broadcast_web_alert — with non-None mint exercises ensure_future path
# ---------------------------------------------------------------------------

class TestBroadcastWebAlertWithMint:
    async def test_ensure_future_called_when_mint_present(self):
        from lineage_agent.alert_service import _broadcast_web_alert
        import lineage_agent.alert_service as svc

        ensure_future_calls = []

        def _fake_ensure_future(coro):
            # Close the coroutine to avoid RuntimeWarning
            coro.close()
            ensure_future_calls.append(1)

        with patch("lineage_agent.alert_service.asyncio") as mock_asyncio:
            mock_asyncio.ensure_future = _fake_ensure_future
            await _broadcast_web_alert({
                "event": "alert",
                "type": "deployer",
                "title": "Test",
                "body": "body",
                "mint": "MINTABC123456789012345678901234567890",
            })
        # ensure_future should have been called with the _push_fcm_to_watchers coroutine
        assert len(ensure_future_calls) == 1


# ---------------------------------------------------------------------------
# FCM functions — test guard paths (no Firebase configured)
# ---------------------------------------------------------------------------

class TestGetFcmAccessToken:
    async def test_returns_none_when_no_firebase_project_id(self):
        from lineage_agent.alert_service import _get_fcm_access_token
        import lineage_agent.alert_service as svc

        original_project = svc._FIREBASE_PROJECT_ID
        original_path = svc._FIREBASE_SA_JSON_PATH
        try:
            svc._FIREBASE_PROJECT_ID = ""
            svc._FIREBASE_SA_JSON_PATH = ""
            result = await _get_fcm_access_token()
        finally:
            svc._FIREBASE_PROJECT_ID = original_project
            svc._FIREBASE_SA_JSON_PATH = original_path

        assert result is None

    async def test_returns_cached_token_when_valid(self):
        from lineage_agent.alert_service import _get_fcm_access_token
        import lineage_agent.alert_service as svc
        import time

        original_project = svc._FIREBASE_PROJECT_ID
        original_path = svc._FIREBASE_SA_JSON_PATH
        original_token = svc._fcm_access_token
        original_expiry = svc._fcm_token_expiry
        try:
            svc._FIREBASE_PROJECT_ID = "test-project"
            svc._FIREBASE_SA_JSON_PATH = "/fake/path.json"
            svc._fcm_access_token = "cached_token_123"
            svc._fcm_token_expiry = time.monotonic() + 3600  # valid for 1 hour
            result = await _get_fcm_access_token()
        finally:
            svc._FIREBASE_PROJECT_ID = original_project
            svc._FIREBASE_SA_JSON_PATH = original_path
            svc._fcm_access_token = original_token
            svc._fcm_token_expiry = original_expiry

        assert result == "cached_token_123"

    async def test_import_error_returns_none(self):
        from lineage_agent.alert_service import _get_fcm_access_token
        import lineage_agent.alert_service as svc
        import sys

        original_project = svc._FIREBASE_PROJECT_ID
        original_path = svc._FIREBASE_SA_JSON_PATH
        original_token = svc._fcm_access_token
        original_expiry = svc._fcm_token_expiry
        try:
            svc._FIREBASE_PROJECT_ID = "test-project"
            svc._FIREBASE_SA_JSON_PATH = "/fake/path.json"
            svc._fcm_access_token = None
            svc._fcm_token_expiry = 0.0
            # Patch google.auth to raise ImportError
            with patch.dict(sys.modules, {"google.auth": None, "google.oauth2": None,
                                          "google.oauth2.service_account": None,
                                          "google.auth.transport": None,
                                          "google.auth.transport.requests": None}):
                result = await _get_fcm_access_token()
        finally:
            svc._FIREBASE_PROJECT_ID = original_project
            svc._FIREBASE_SA_JSON_PATH = original_path
            svc._fcm_access_token = original_token
            svc._fcm_token_expiry = original_expiry

        assert result is None


class TestSendFcmPush:
    async def test_returns_false_when_no_access_token(self):
        from lineage_agent.alert_service import _send_fcm_push

        with patch("lineage_agent.alert_service._get_fcm_access_token",
                   new_callable=AsyncMock, return_value=None):
            result = await _send_fcm_push("device_token_abc", "Title", "Body", {"type": "alert"})

        assert result is False


class TestPushFcmToWatchers:
    async def test_returns_early_when_no_firebase_project(self):
        from lineage_agent.alert_service import _push_fcm_to_watchers
        import lineage_agent.alert_service as svc

        original = svc._FIREBASE_PROJECT_ID
        try:
            svc._FIREBASE_PROJECT_ID = ""
            # Should return without any DB access
            mock_cache = AsyncMock()
            with patch("lineage_agent.alert_service._send_fcm_push", new_callable=AsyncMock) as mock_push:
                await _push_fcm_to_watchers("MINT123", title="Test", body="body", alert_type="deployer")
            mock_push.assert_not_called()
        finally:
            svc._FIREBASE_PROJECT_ID = original


# ---------------------------------------------------------------------------
# _sweep_loop — test that it runs and handles cancellation
# ---------------------------------------------------------------------------

class TestSweepLoop:
    async def test_sweep_loop_runs_and_cancels(self):
        from lineage_agent.alert_service import _sweep_loop
        import lineage_agent.alert_service as svc

        call_count = {"n": 0}

        async def _fast_run_sweep():
            call_count["n"] += 1
            return 0

        with (
            patch("lineage_agent.alert_service._run_alert_sweep", new=_fast_run_sweep),
            patch("lineage_agent.alert_service._SWEEP_INTERVAL_SECONDS", 0),
        ):
            task = asyncio.create_task(_sweep_loop())
            await asyncio.sleep(0.05)  # let it run at least once
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        assert call_count["n"] >= 1
