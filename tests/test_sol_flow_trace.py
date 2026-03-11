"""Unit tests for lineage_agent.sol_flow_service — SOL flow parsing.

Covers _parse_sol_flows (innerInstructions primary + balance-delta fallback)
and _parse_inner_instructions without touching the network.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

from lineage_agent.sol_flow_service import (
    _parse_sol_flows,
    _parse_inner_instructions,
    _MIN_TRANSFER_LAMPORTS,
)


# ===================================================================
# Constants
# ===================================================================

_SYSTEM_PROGRAM = "11111111111111111111111111111111"
_MINT = "TokenMint111"
_SOURCE = "SourceWallet111"
_DEST_A = "DestA111"
_DEST_B = "DestB222"
_SIGNATURE = "sig_test_abc"
_LAMPORTS_1SOL = 1_000_000_000


# ===================================================================
# Helpers — mock transaction builders
# ===================================================================

def _make_inner_transfer(src: str, dst: str, lamports: int) -> dict:
    """Build a single innerInstruction transfer entry."""
    return {
        "programId": _SYSTEM_PROGRAM,
        "parsed": {
            "type": "transfer",
            "info": {
                "source": src,
                "destination": dst,
                "lamports": lamports,
            },
        },
    }


def _make_tx_with_inner(
    source: str,
    transfers: list[dict],
    *,
    account_keys: list[str] | None = None,
    pre_balances: list[int] | None = None,
    post_balances: list[int] | None = None,
) -> dict:
    """Build a mock transaction with innerInstructions."""
    keys = account_keys or [source]
    return {
        "transaction": {
            "message": {
                "accountKeys": [{"pubkey": k, "signer": i == 0} for i, k in enumerate(keys)],
            },
        },
        "meta": {
            "innerInstructions": [{"instructions": transfers}],
            "preBalances": pre_balances or [0] * len(keys),
            "postBalances": post_balances or [0] * len(keys),
        },
        "blockTime": 1700000000,
        "slot": 12345,
    }


def _make_tx_balance_delta(
    account_keys: list[str],
    pre_balances: list[int],
    post_balances: list[int],
) -> dict:
    """Build a mock transaction with ONLY balance delta (no innerInstructions)."""
    return {
        "transaction": {
            "message": {
                "accountKeys": [{"pubkey": k, "signer": i == 0} for i, k in enumerate(account_keys)],
            },
        },
        "meta": {
            "innerInstructions": [],
            "preBalances": pre_balances,
            "postBalances": post_balances,
        },
        "blockTime": 1700000000,
        "slot": 12345,
    }


# ===================================================================
# _parse_inner_instructions
# ===================================================================

class TestParseInnerInstructions:
    """Test the innerInstructions parser."""

    def test_system_program_transfer(self):
        transfers = [_make_inner_transfer(_SOURCE, _DEST_A, _LAMPORTS_1SOL)]
        meta = {"innerInstructions": [{"instructions": transfers}]}
        flows = _parse_inner_instructions(meta, _SOURCE, _MINT, 0, _SIGNATURE, None, None)
        assert len(flows) == 1
        assert flows[0]["from_address"] == _SOURCE
        assert flows[0]["to_address"] == _DEST_A
        assert flows[0]["amount_lamports"] == _LAMPORTS_1SOL

    def test_non_system_program_ignored(self):
        transfers = [{
            "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            "parsed": {"type": "transfer", "info": {"source": _SOURCE, "destination": _DEST_A, "lamports": _LAMPORTS_1SOL}},
        }]
        meta = {"innerInstructions": [{"instructions": transfers}]}
        flows = _parse_inner_instructions(meta, _SOURCE, _MINT, 0, _SIGNATURE, None, None)
        assert flows == []

    def test_below_min_threshold_ignored(self):
        transfers = [_make_inner_transfer(_SOURCE, _DEST_A, _MIN_TRANSFER_LAMPORTS - 1)]
        meta = {"innerInstructions": [{"instructions": transfers}]}
        flows = _parse_inner_instructions(meta, _SOURCE, _MINT, 0, _SIGNATURE, None, None)
        assert flows == []

    def test_other_source_wallet_ignored(self):
        """Only outflows from source_wallet are captured."""
        transfers = [_make_inner_transfer("OtherWallet", _DEST_A, _LAMPORTS_1SOL)]
        meta = {"innerInstructions": [{"instructions": transfers}]}
        flows = _parse_inner_instructions(meta, _SOURCE, _MINT, 0, _SIGNATURE, None, None)
        assert flows == []

    def test_skip_address_excluded(self):
        """Destinations in SKIP_PROGRAMS are excluded."""
        transfers = [_make_inner_transfer(_SOURCE, _SYSTEM_PROGRAM, _LAMPORTS_1SOL)]
        meta = {"innerInstructions": [{"instructions": transfers}]}
        flows = _parse_inner_instructions(meta, _SOURCE, _MINT, 0, _SIGNATURE, None, None)
        assert flows == []

    def test_multiple_transfers(self):
        transfers = [
            _make_inner_transfer(_SOURCE, _DEST_A, _LAMPORTS_1SOL),
            _make_inner_transfer(_SOURCE, _DEST_B, 2 * _LAMPORTS_1SOL),
        ]
        meta = {"innerInstructions": [{"instructions": transfers}]}
        flows = _parse_inner_instructions(meta, _SOURCE, _MINT, 0, _SIGNATURE, None, None)
        assert len(flows) == 2
        assert flows[0]["to_address"] == _DEST_A
        assert flows[1]["to_address"] == _DEST_B

    def test_empty_inner_instructions(self):
        meta = {"innerInstructions": []}
        flows = _parse_inner_instructions(meta, _SOURCE, _MINT, 0, _SIGNATURE, None, None)
        assert flows == []

    def test_no_inner_instructions_key(self):
        flows = _parse_inner_instructions({}, _SOURCE, _MINT, 0, _SIGNATURE, None, None)
        assert flows == []

    def test_non_transfer_type_ignored(self):
        transfers = [{
            "programId": _SYSTEM_PROGRAM,
            "parsed": {"type": "createAccount", "info": {"source": _SOURCE, "destination": _DEST_A, "lamports": _LAMPORTS_1SOL}},
        }]
        meta = {"innerInstructions": [{"instructions": transfers}]}
        flows = _parse_inner_instructions(meta, _SOURCE, _MINT, 0, _SIGNATURE, None, None)
        assert flows == []


# ===================================================================
# _parse_sol_flows (integration of inner + fallback)
# ===================================================================

class TestParseSolFlows:
    """Test the unified _parse_sol_flows with both paths."""

    def test_inner_instructions_primary_path(self):
        """When innerInstructions contain transfers, use them (primary)."""
        transfers = [_make_inner_transfer(_SOURCE, _DEST_A, _LAMPORTS_1SOL)]
        tx = _make_tx_with_inner(_SOURCE, transfers)
        flows = _parse_sol_flows(tx, _SOURCE, _MINT, 0, _SIGNATURE)
        assert len(flows) == 1
        assert flows[0]["to_address"] == _DEST_A

    def test_balance_delta_fallback(self):
        """When innerInstructions are empty, fall back to balance delta."""
        tx = _make_tx_balance_delta(
            account_keys=[_SOURCE, _DEST_A],
            pre_balances=[5 * _LAMPORTS_1SOL, 0],
            post_balances=[3 * _LAMPORTS_1SOL, 2 * _LAMPORTS_1SOL],
        )
        flows = _parse_sol_flows(tx, _SOURCE, _MINT, 0, _SIGNATURE)
        assert len(flows) == 1
        assert flows[0]["from_address"] == _SOURCE
        assert flows[0]["to_address"] == _DEST_A
        assert flows[0]["amount_lamports"] == 2 * _LAMPORTS_1SOL

    def test_balance_delta_no_outflow(self):
        """If source didn't lose SOL, no flows from balance delta."""
        tx = _make_tx_balance_delta(
            account_keys=[_SOURCE, _DEST_A],
            pre_balances=[1 * _LAMPORTS_1SOL, 0],
            post_balances=[2 * _LAMPORTS_1SOL, 1 * _LAMPORTS_1SOL],
        )
        flows = _parse_sol_flows(tx, _SOURCE, _MINT, 0, _SIGNATURE)
        assert flows == []

    def test_empty_tx(self):
        flows = _parse_sol_flows({}, _SOURCE, _MINT, 0, _SIGNATURE)
        assert flows == []

    def test_source_not_in_account_keys(self):
        """If source wallet is not in the account keys, no flows."""
        tx = _make_tx_balance_delta(
            account_keys=["OtherWallet", _DEST_A],
            pre_balances=[5 * _LAMPORTS_1SOL, 0],
            post_balances=[3 * _LAMPORTS_1SOL, 2 * _LAMPORTS_1SOL],
        )
        flows = _parse_sol_flows(tx, _SOURCE, _MINT, 0, _SIGNATURE)
        assert flows == []

    def test_flow_metadata_correct(self):
        """Verify all metadata fields are populated."""
        transfers = [_make_inner_transfer(_SOURCE, _DEST_A, _LAMPORTS_1SOL)]
        tx = _make_tx_with_inner(_SOURCE, transfers)
        flows = _parse_sol_flows(tx, _SOURCE, _MINT, 1, _SIGNATURE)
        assert len(flows) == 1
        f = flows[0]
        assert f["mint"] == _MINT
        assert f["signature"] == _SIGNATURE
        assert f["hop"] == 1
        assert f["block_time"] == 1700000000
        assert f["slot"] == 12345

    def test_inner_instructions_preferred_over_delta(self):
        """When both innerInstructions AND delta are available, inner wins."""
        transfers = [_make_inner_transfer(_SOURCE, _DEST_A, 500_000_000)]
        tx = _make_tx_with_inner(
            _SOURCE,
            transfers,
            account_keys=[_SOURCE, _DEST_A, _DEST_B],
            pre_balances=[5 * _LAMPORTS_1SOL, 0, 0],
            post_balances=[3 * _LAMPORTS_1SOL, 1 * _LAMPORTS_1SOL, 1 * _LAMPORTS_1SOL],
        )
        flows = _parse_sol_flows(tx, _SOURCE, _MINT, 0, _SIGNATURE)
        # Should get only the inner instruction flow (500M to DEST_A)
        # not the balance-delta flows
        assert len(flows) == 1
        assert flows[0]["amount_lamports"] == 500_000_000
        assert flows[0]["to_address"] == _DEST_A


# ===================================================================
# trace_sol_flow — high-level async API (mocked _run_trace)
# ===================================================================
class TestTraceSolFlowHighLevel:
    """Test the timeout / exception handling paths of trace_sol_flow."""

    async def test_timeout_no_partial_flows_returns_none(self):
        from lineage_agent.sol_flow_service import trace_sol_flow

        async def _slow(*args, **kwargs):
            await asyncio.sleep(9999)

        with patch("lineage_agent.sol_flow_service._run_trace", new=_slow):
            with patch("lineage_agent.sol_flow_service._TRACE_TIMEOUT", 0.001):
                result = await trace_sol_flow("MINT1", "DEPLOYER1")

        assert result is None

    async def test_exception_returns_none(self):
        from lineage_agent.sol_flow_service import trace_sol_flow

        async def _explode(*args, **kwargs):
            raise RuntimeError("rpc failure")

        with patch("lineage_agent.sol_flow_service._run_trace", new=_explode):
            result = await trace_sol_flow("MINT2", "DEPLOYER2")

        assert result is None

    async def test_success_returns_report(self):
        from lineage_agent.sol_flow_service import trace_sol_flow
        from lineage_agent.models import SolFlowReport

        from datetime import datetime, timezone
        mock_report = SolFlowReport(
            mint="MINT3",
            deployer="DEPLOYER3",
            total_extracted_sol=0.0,
            analysis_timestamp=datetime.now(timezone.utc),
        )

        async def _fast(*args, **kwargs):
            return mock_report

        with patch("lineage_agent.sol_flow_service._run_trace", new=_fast):
            result = await trace_sol_flow("MINT3", "DEPLOYER3")

        assert result is mock_report


# ===================================================================
# get_sol_flow_report — DB-backed report retrieval
# ===================================================================

class TestGetSolFlowReport:
    async def test_force_refresh_returns_none(self):
        from lineage_agent.sol_flow_service import get_sol_flow_report

        with patch("lineage_agent.sol_flow_service.sol_flows_delete", new_callable=AsyncMock) as mock_del:
            result = await get_sol_flow_report("MINT_FR", force_refresh=True)

        assert result is None
        mock_del.assert_called_once_with("MINT_FR")

    async def test_no_rows_in_db_returns_none(self):
        from lineage_agent.sol_flow_service import get_sol_flow_report

        with patch("lineage_agent.sol_flow_service.sol_flows_query", new_callable=AsyncMock, return_value=[]):
            result = await get_sol_flow_report("MINT_EMPTY")

        assert result is None

    async def test_existing_rows_returns_report(self):
        from lineage_agent.sol_flow_service import get_sol_flow_report

        rows = [
            {
                "from_address": "DEPLOYER_X",
                "to_address": "Wallet_AA",
                "amount_lamports": 1_000_000_000,
                "signature": "sig_abc",
                "slot": 111,
                "block_time": 1700000000.0,
                "hop": 0,
                "label": None,
                "is_bridge": False,
            }
        ]

        with patch("lineage_agent.sol_flow_service.sol_flows_query", new_callable=AsyncMock, return_value=rows):
            result = await get_sol_flow_report("MINT_DB")

        # Report should be non-None with at least one edge
        assert result is not None

    async def test_exception_returns_none(self):
        from lineage_agent.sol_flow_service import get_sol_flow_report

        with patch(
            "lineage_agent.sol_flow_service.sol_flows_query",
            new_callable=AsyncMock,
            side_effect=Exception("db error"),
        ):
            result = await get_sol_flow_report("MINT_ERR")

        assert result is None

