"""Tests for the Solana RPC client (async methods with mocked HTTP)."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from lineage_agent.data_sources.solana_rpc import SolanaRpcClient


@pytest.fixture
def rpc():
    return SolanaRpcClient(endpoint="https://rpc.example.com", timeout=5)


# ------------------------------------------------------------------
# _call: basic success
# ------------------------------------------------------------------


class TestCall:
    """Tests for the internal _call method (retry / backoff)."""

    @pytest.mark.asyncio
    async def test_successful_rpc_call(self, rpc):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {"value": 42},
        }
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client.is_closed = False

        rpc._client = mock_client
        result = await rpc._call("getBalance", ["addr123"])
        assert result == {"value": 42}

    @pytest.mark.asyncio
    async def test_rpc_error_in_body(self, rpc):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "jsonrpc": "2.0",
            "id": 1,
            "error": {"code": -32600, "message": "Invalid Request"},
        }
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client.is_closed = False

        rpc._client = mock_client
        result = await rpc._call("badMethod", [])
        assert result is None

    @pytest.mark.asyncio
    async def test_403_returns_none(self, rpc):
        mock_resp = MagicMock()
        mock_resp.status_code = 403

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client.is_closed = False

        rpc._client = mock_client
        result = await rpc._call("getTransaction", ["sig"])
        assert result is None

    @pytest.mark.asyncio
    async def test_429_retries(self, rpc):
        """Rate-limited requests should retry up to MAX_RETRIES."""
        mock_resp_429 = MagicMock()
        mock_resp_429.status_code = 429

        mock_resp_ok = MagicMock()
        mock_resp_ok.status_code = 200
        mock_resp_ok.json.return_value = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": "ok",
        }
        mock_resp_ok.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(
            side_effect=[mock_resp_429, mock_resp_ok]
        )
        mock_client.is_closed = False

        rpc._client = mock_client
        with patch("lineage_agent.data_sources._retry.asyncio.sleep", new_callable=AsyncMock):
            result = await rpc._call("getBalance", ["x"])
        assert result == "ok"
        assert mock_client.post.call_count == 2

    @pytest.mark.asyncio
    async def test_request_error_retries(self, rpc):
        """Network-level errors should retry then return None."""
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(
            side_effect=httpx.RequestError("Connection refused")
        )
        mock_client.is_closed = False

        rpc._client = mock_client
        with patch("lineage_agent.data_sources._retry.asyncio.sleep", new_callable=AsyncMock):
            result = await rpc._call("getBalance", ["x"])
        assert result is None
        assert mock_client.post.call_count == 3  # MAX_RETRIES


# ------------------------------------------------------------------
# get_oldest_signature
# ------------------------------------------------------------------


class TestGetOldestSignature:

    @pytest.mark.asyncio
    async def test_single_page(self, rpc):
        sigs = [
            {"signature": f"sig{i}", "blockTime": 1000 + i}
            for i in range(5)
        ]
        with patch.object(rpc, "_call", new_callable=AsyncMock, return_value=sigs):
            oldest = await rpc.get_oldest_signature("mintABC")
        assert oldest == sigs[-1]

    @pytest.mark.asyncio
    async def test_empty_result(self, rpc):
        with patch.object(rpc, "_call", new_callable=AsyncMock, return_value=[]):
            oldest = await rpc.get_oldest_signature("mintXYZ")
        assert oldest is None

    @pytest.mark.asyncio
    async def test_none_result(self, rpc):
        with patch.object(rpc, "_call", new_callable=AsyncMock, return_value=None):
            oldest = await rpc.get_oldest_signature("mintXYZ")
        assert oldest is None

    @pytest.mark.asyncio
    async def test_multiple_pages(self, rpc):
        """When 1000 sigs returned, should paginate to next page."""
        page1 = [{"signature": f"sig{i}", "blockTime": 2000 + i} for i in range(1000)]
        page2 = [{"signature": f"old{i}", "blockTime": 1000 + i} for i in range(50)]

        call_count = 0

        async def fake_call(method, params):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return page1
            return page2

        with patch.object(rpc, "_call", side_effect=fake_call):
            oldest = await rpc.get_oldest_signature("mintPAGE")
        assert oldest == page2[-1]
        assert call_count == 2


# ------------------------------------------------------------------
# get_deployer_and_timestamp
# ------------------------------------------------------------------


class TestGetDeployerAndTimestamp:

    @pytest.mark.asyncio
    async def test_no_signatures(self, rpc):
        with patch.object(rpc, "get_oldest_signature", new_callable=AsyncMock, return_value=None):
            deployer, ts = await rpc.get_deployer_and_timestamp("mintNOSIG")
        assert deployer == ""
        assert ts is None

    @pytest.mark.asyncio
    async def test_successful_extraction(self, rpc):
        sig_info = {"signature": "sigABC", "blockTime": 1700000000}
        tx_data = {
            "transaction": {
                "message": {
                    "accountKeys": [
                        {"pubkey": "DeployerPubkey123", "signer": True}
                    ]
                }
            }
        }
        with patch.object(rpc, "get_oldest_signature", new_callable=AsyncMock, return_value=sig_info), \
             patch.object(rpc, "_call", new_callable=AsyncMock, return_value=tx_data):
            deployer, ts = await rpc.get_deployer_and_timestamp("mintOK")
        assert deployer == "DeployerPubkey123"
        assert ts == datetime.fromtimestamp(1700000000, tz=timezone.utc)

    @pytest.mark.asyncio
    async def test_string_account_keys(self, rpc):
        """Account keys as plain strings (not dicts)."""
        sig_info = {"signature": "sigDEF", "blockTime": 1700000000}
        tx_data = {
            "transaction": {
                "message": {
                    "accountKeys": ["StringDeployer999"]
                }
            }
        }
        with patch.object(rpc, "get_oldest_signature", new_callable=AsyncMock, return_value=sig_info), \
             patch.object(rpc, "_call", new_callable=AsyncMock, return_value=tx_data):
            deployer, ts = await rpc.get_deployer_and_timestamp("mintSTR")
        assert deployer == "StringDeployer999"

    @pytest.mark.asyncio
    async def test_no_transaction_data(self, rpc):
        sig_info = {"signature": "sigGHI", "blockTime": 1700000000}
        with patch.object(rpc, "get_oldest_signature", new_callable=AsyncMock, return_value=sig_info), \
             patch.object(rpc, "_call", new_callable=AsyncMock, return_value=None):
            deployer, ts = await rpc.get_deployer_and_timestamp("mintNOTX")
        assert deployer == ""
        assert ts == datetime.fromtimestamp(1700000000, tz=timezone.utc)

    @pytest.mark.asyncio
    async def test_no_block_time(self, rpc):
        sig_info = {"signature": "sigJKL"}
        tx_data = {
            "transaction": {
                "message": {
                    "accountKeys": [{"pubkey": "Deployer"}]
                }
            }
        }
        with patch.object(rpc, "get_oldest_signature", new_callable=AsyncMock, return_value=sig_info), \
             patch.object(rpc, "_call", new_callable=AsyncMock, return_value=tx_data):
            deployer, ts = await rpc.get_deployer_and_timestamp("mintNOBT")
        assert deployer == "Deployer"
        assert ts is None


# ------------------------------------------------------------------
# close
# ------------------------------------------------------------------


class TestClientLifecycle:

    @pytest.mark.asyncio
    async def test_close_when_open(self, rpc):
        mock_client = AsyncMock()
        mock_client.is_closed = False
        rpc._client = mock_client
        await rpc.close()
        mock_client.aclose.assert_called_once()

    @pytest.mark.asyncio
    async def test_close_when_none(self, rpc):
        rpc._client = None
        await rpc.close()  # should not raise

    @pytest.mark.asyncio
    async def test_close_when_already_closed(self, rpc):
        mock_client = AsyncMock()
        mock_client.is_closed = True
        rpc._client = mock_client
        await rpc.close()
        mock_client.aclose.assert_not_called()
