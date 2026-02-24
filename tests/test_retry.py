"""Tests for the shared async retry utility (_retry.py)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from lineage_agent.data_sources._retry import async_http_get, async_http_post_json


def _mock_response(status_code: int = 200, json_data=None, headers=None):
    """Build a mock httpx.Response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    resp.headers = headers or {}
    if status_code >= 400:
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            f"HTTP {status_code}",
            request=MagicMock(),
            response=resp,
        )
    else:
        resp.raise_for_status = MagicMock()
    return resp


class TestAsyncHttpGet:

    @pytest.mark.asyncio
    async def test_success(self):
        client = AsyncMock()
        client.get = AsyncMock(return_value=_mock_response(200, {"ok": True}))

        result = await async_http_get(client, "https://example.com/api")
        assert result == {"ok": True}
        client.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_429_retries(self):
        resp_429 = _mock_response(429)
        resp_429.raise_for_status = MagicMock()  # 429 is checked before raise_for_status
        resp_ok = _mock_response(200, {"ok": True})
        client = AsyncMock()
        client.get = AsyncMock(side_effect=[resp_429, resp_ok])

        with patch("lineage_agent.data_sources._retry.asyncio.sleep", new_callable=AsyncMock):
            result = await async_http_get(
                client, "https://example.com", max_retries=3, backoff_base=0.01
            )
        assert result == {"ok": True}
        assert client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_403_returns_none(self):
        resp_403 = _mock_response(403)
        resp_403.raise_for_status = MagicMock()  # 403 is checked before raise
        client = AsyncMock()
        client.get = AsyncMock(return_value=resp_403)

        result = await async_http_get(client, "https://example.com")
        assert result is None
        assert client.get.call_count == 1  # no retry

    @pytest.mark.asyncio
    async def test_request_error_retries_then_none(self):
        client = AsyncMock()
        client.get = AsyncMock(side_effect=httpx.RequestError("fail"))

        with patch("lineage_agent.data_sources._retry.asyncio.sleep", new_callable=AsyncMock):
            result = await async_http_get(
                client, "https://example.com", max_retries=2, backoff_base=0.01
            )
        assert result is None
        assert client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_http_status_error_retries(self):
        resp_500 = _mock_response(500)
        resp_ok = _mock_response(200, {"data": 1})
        client = AsyncMock()
        client.get = AsyncMock(side_effect=[resp_500, resp_ok])

        with patch("lineage_agent.data_sources._retry.asyncio.sleep", new_callable=AsyncMock):
            result = await async_http_get(
                client, "https://example.com", max_retries=3, backoff_base=0.01
            )
        assert result == {"data": 1}


class TestAsyncHttpPostJson:

    @pytest.mark.asyncio
    async def test_success_with_result(self):
        resp = _mock_response(200, {"jsonrpc": "2.0", "result": "ok"})
        client = AsyncMock()
        client.post = AsyncMock(return_value=resp)

        result = await async_http_post_json(
            client, "https://rpc.example.com", json_payload={"method": "test"}
        )
        assert result == "ok"

    @pytest.mark.asyncio
    async def test_rpc_error_returns_none(self):
        resp = _mock_response(200, {"jsonrpc": "2.0", "error": {"code": -1, "message": "bad"}})
        client = AsyncMock()
        client.post = AsyncMock(return_value=resp)

        result = await async_http_post_json(
            client, "https://rpc.example.com", json_payload={}
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_403_returns_none_immediately(self):
        resp_403 = _mock_response(403)
        resp_403.raise_for_status = MagicMock()
        client = AsyncMock()
        client.post = AsyncMock(return_value=resp_403)

        result = await async_http_post_json(
            client, "https://rpc.example.com", json_payload={}
        )
        assert result is None
        assert client.post.call_count == 1

    @pytest.mark.asyncio
    async def test_429_retries(self):
        resp_429 = _mock_response(429)
        resp_429.raise_for_status = MagicMock()
        resp_ok = _mock_response(200, {"result": "done"})
        client = AsyncMock()
        client.post = AsyncMock(side_effect=[resp_429, resp_ok])

        with patch("lineage_agent.data_sources._retry.asyncio.sleep", new_callable=AsyncMock):
            result = await async_http_post_json(
                client, "https://rpc.example.com", json_payload={},
                max_retries=3, backoff_base=0.01,
            )
        assert result == "done"
        assert client.post.call_count == 2
