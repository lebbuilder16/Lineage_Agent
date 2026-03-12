"""Unit tests for lineage_agent.alert_service — WebSocket/FCM alert paths.

Focuses on:
- register_web_client / unregister_web_client
- schedule_alert_sweep / cancel_alert_sweep lifecycle
- _broadcast_web_alert with mock WebSocket clients
- FCM helpers (_get_fcm_access_token, _send_fcm_push, _push_fcm_to_watchers)
- _sweep_loop cancellation
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from lineage_agent.alert_service import (
    cancel_alert_sweep,
    register_web_client,
    schedule_alert_sweep,
    unregister_web_client,
)


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
        ws = MagicMock()
        # Should not raise even if ws was never registered
        unregister_web_client(ws)


# ---------------------------------------------------------------------------
# _broadcast_web_alert
# ---------------------------------------------------------------------------

class TestBroadcastWebAlert:
    async def test_broadcasts_to_connected_clients(self):
        from lineage_agent.alert_service import _broadcast_web_alert
        ws = AsyncMock()
        import lineage_agent.alert_service as svc
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
# _broadcast_web_alert — with non-None mint exercises ensure_future path
# ---------------------------------------------------------------------------

class TestBroadcastWebAlertWithMint:
    async def test_ensure_future_called_when_mint_present(self):
        from lineage_agent.alert_service import _broadcast_web_alert

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
