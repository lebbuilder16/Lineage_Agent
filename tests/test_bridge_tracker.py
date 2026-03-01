"""Tests for bridge_tracker module."""

from __future__ import annotations

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from lineage_agent.bridge_tracker import (
    CrossChainExit,
    _parse_operation,
    detect_bridge_exits,
    is_bridge_program,
)


# ---------------------------------------------------------------------------
# is_bridge_program
# ---------------------------------------------------------------------------

class TestIsBridgeProgram:
    def test_known_wormhole_core(self):
        assert is_bridge_program("worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth") is True

    def test_known_wormhole_token_bridge(self):
        assert is_bridge_program("wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb") is True

    def test_known_mayan_swift(self):
        assert is_bridge_program("FC4eXxkyrMPTjiYUnNE9Cn6YBnKCm9T5XpEWFkUuQj8b") is True

    def test_known_allbridge(self):
        assert is_bridge_program("BrdgJPALFgxpQStMyf5MBoHWmZQMvNiRJvs2BpBXFVU") is True

    def test_known_debridge(self):
        assert is_bridge_program("DEbrdgQsVUG4vNW8fM5bX9kzZNFu2VZPsEBHvMYHovTF") is True

    def test_unknown_address(self):
        assert is_bridge_program("11111111111111111111111111111111") is False

    def test_empty_string(self):
        assert is_bridge_program("") is False

    def test_random_address(self):
        assert is_bridge_program("So11111111111111111111111111111111111111112") is False


# ---------------------------------------------------------------------------
# _parse_operation
# ---------------------------------------------------------------------------

class TestParseOperation:
    def test_ethereum_destination(self):
        op = {
            "content": {
                "standarizedProperties": {
                    "toChain": 2,
                    "toAddress": "0xDeadBeef1234567890abcdef1234567890abcdef",
                }
            }
        }
        chain, addr = _parse_operation(op)
        assert chain == "Ethereum"
        assert addr == "0xDeadBeef1234567890abcdef1234567890abcdef"

    def test_bsc_destination(self):
        op = {
            "content": {
                "standarizedProperties": {
                    "toChain": 4,
                    "toAddress": "0xabc",
                }
            }
        }
        chain, addr = _parse_operation(op)
        assert chain == "BSC"

    def test_base_destination(self):
        op = {
            "content": {
                "standarizedProperties": {
                    "toChain": 30,
                    "toAddress": "0x123",
                }
            }
        }
        chain, addr = _parse_operation(op)
        assert chain == "Base"

    def test_unknown_chain_id_fallback(self):
        op = {
            "content": {
                "standarizedProperties": {
                    "toChain": 999,
                    "toAddress": "0xXYZ",
                }
            }
        }
        chain, addr = _parse_operation(op)
        assert chain == "Chain-999"

    def test_fallback_to_top_level_fields(self):
        op = {
            "content": {"standarizedProperties": {}},
            "targetChain": "2",
            "recipientAddress": "0xFallback",
        }
        chain, addr = _parse_operation(op)
        assert chain == "Ethereum"
        assert addr == "0xFallback"

    def test_empty_operation_returns_unknown(self):
        chain, addr = _parse_operation({})
        assert chain == "Unknown"
        assert addr == ""

    def test_malformed_operation_returns_unknown(self):
        chain, addr = _parse_operation({"content": None})
        assert chain == "Unknown"
        assert addr == ""


# ---------------------------------------------------------------------------
# detect_bridge_exits
# ---------------------------------------------------------------------------

class TestDetectBridgeExits:
    @pytest.mark.asyncio
    async def test_empty_flows_returns_empty(self):
        result = await detect_bridge_exits([])
        assert result == []

    @pytest.mark.asyncio
    async def test_no_bridge_flows_returns_empty(self):
        flows = [
            {
                "from_address": "WalletA",
                "to_address": "11111111111111111111111111111111",
                "amount_lamports": 1_000_000_000,
                "signature": "sig1",
            }
        ]
        result = await detect_bridge_exits(flows)
        assert result == []

    @pytest.mark.asyncio
    async def test_bridge_flow_no_wormhole_ops(self):
        """Bridge edge present but Wormholescan returns no operations."""
        flows = [
            {
                "from_address": "SenderWalletXYZ",
                "to_address": "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth",
                "amount_lamports": 2_000_000_000,
                "signature": "txsig_abc",
            }
        ]

        with patch(
            "lineage_agent.bridge_tracker._fetch_wormhole_operations",
            new=AsyncMock(return_value=[]),
        ):
            result = await detect_bridge_exits(flows)

        assert len(result) == 1
        exit_ = result[0]
        assert isinstance(exit_, CrossChainExit)
        assert exit_.from_address == "SenderWalletXYZ"
        assert exit_.bridge_name == "Wormhole Core"
        assert exit_.dest_chain == "Pending attestation"
        assert exit_.amount_sol == pytest.approx(2.0)
        assert exit_.tx_signature == "txsig_abc"

    @pytest.mark.asyncio
    async def test_bridge_flow_with_wormhole_ops(self):
        """Bridge edge present and Wormholescan returns a real operation."""
        flows = [
            {
                "from_address": "SenderWalletABC",
                "to_address": "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth",
                "amount_lamports": 500_000_000,
                "signature": "txsig_xyz",
            }
        ]
        fake_op = {
            "content": {
                "standarizedProperties": {
                    "toChain": 2,
                    "toAddress": "0xEthRecipient",
                }
            }
        }

        with patch(
            "lineage_agent.bridge_tracker._fetch_wormhole_operations",
            new=AsyncMock(return_value=[fake_op]),
        ):
            result = await detect_bridge_exits(flows)

        assert len(result) == 1
        exit_ = result[0]
        assert exit_.dest_chain == "Ethereum"
        assert exit_.dest_address == "0xEthRecipient"
        assert exit_.amount_sol == pytest.approx(0.5)

    @pytest.mark.asyncio
    async def test_deduplicates_same_wallet_multiple_bridge_edges(self):
        """If the same wallet sent to two bridge programs, only one Wormholescan call."""
        flows = [
            {
                "from_address": "SharedWallet",
                "to_address": "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth",
                "amount_lamports": 1_000_000_000,
                "signature": "sig1",
            },
            {
                "from_address": "SharedWallet",
                "to_address": "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb",
                "amount_lamports": 500_000_000,
                "signature": "sig2",
            },
        ]

        mock_fetch = AsyncMock(return_value=[])
        with patch(
            "lineage_agent.bridge_tracker._fetch_wormhole_operations",
            new=mock_fetch,
        ):
            await detect_bridge_exits(flows)

        # Should only call once per unique wallet
        assert mock_fetch.call_count == 1
