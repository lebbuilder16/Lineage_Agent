"""Unit tests for lineage_agent.cartel_service — helper functions and public API.

Targets the most impactful uncovered code paths:
- _is_confirmed_cartel_rug (pure helper)
- compute_cartel_report (public API with timeout/exception handling)
- build_cartel_edges_for_deployer (signal aggregation)
- _signal_timing_sync, run_cartel_sweep (with mocked DB clients)
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lineage_agent.cartel_service import (
    _is_confirmed_cartel_rug,
    compute_cartel_report,
)


# ---------------------------------------------------------------------------
# _is_confirmed_cartel_rug  — pure function
# ---------------------------------------------------------------------------

class TestIsConfirmedCartelRug:
    def test_no_mechanism_returns_true(self):
        assert _is_confirmed_cartel_rug({}) is True
        assert _is_confirmed_cartel_rug({"rug_mechanism": ""}) is True
        assert _is_confirmed_cartel_rug({"rug_mechanism": None}) is True

    def test_incompatible_mechanism_returns_false(self):
        row = {"rug_mechanism": "soft_rug", "evidence_level": "strong"}
        assert _is_confirmed_cartel_rug(row) is False

    def test_unknown_mechanism_returns_false(self):
        row = {"rug_mechanism": "whale_dump"}
        assert _is_confirmed_cartel_rug(row) is False

    def test_compatible_mechanism_no_evidence_returns_true(self):
        row = {"rug_mechanism": "dex_liquidity_rug", "evidence_level": ""}
        assert _is_confirmed_cartel_rug(row) is True

    def test_compatible_mechanism_no_evidence_key_returns_true(self):
        row = {"rug_mechanism": "dex_liquidity_rug"}
        assert _is_confirmed_cartel_rug(row) is True

    def test_compatible_mechanism_strong_evidence_returns_true(self):
        row = {"rug_mechanism": "dex_liquidity_rug", "evidence_level": "strong"}
        assert _is_confirmed_cartel_rug(row) is True

    def test_compatible_mechanism_moderate_evidence_returns_true(self):
        row = {"rug_mechanism": "dex_liquidity_rug", "evidence_level": "moderate"}
        assert _is_confirmed_cartel_rug(row) is True

    def test_compatible_mechanism_weak_evidence_returns_false(self):
        row = {"rug_mechanism": "dex_liquidity_rug", "evidence_level": "weak"}
        assert _is_confirmed_cartel_rug(row) is False

    def test_pre_dex_extraction_rug_strong(self):
        row = {"rug_mechanism": "pre_dex_extraction_rug", "evidence_level": "strong"}
        assert _is_confirmed_cartel_rug(row) is True

    def test_pre_dex_extraction_rug_weak(self):
        row = {"rug_mechanism": "pre_dex_extraction_rug", "evidence_level": "weak"}
        assert _is_confirmed_cartel_rug(row) is False

    def test_whitespace_stripped(self):
        row = {"rug_mechanism": " dex_liquidity_rug ", "evidence_level": " strong "}
        # After stripping, mechanism matches and evidence matches
        assert _is_confirmed_cartel_rug(row) is True


# ---------------------------------------------------------------------------
# compute_cartel_report — public API
# ---------------------------------------------------------------------------

class TestComputeCartelReport:
    async def test_empty_deployer_returns_none(self):
        result = await compute_cartel_report("mint123", "")
        assert result is None

    async def test_none_deployer_returns_none(self):
        result = await compute_cartel_report("mint123", None)  # type: ignore[arg-type]
        assert result is None

    async def test_exception_in_build_report_returns_none(self):
        with patch(
            "lineage_agent.cartel_service._build_report",
            side_effect=RuntimeError("db error"),
        ):
            result = await compute_cartel_report("mint123", "DeployerABC")
        assert result is None

    async def test_timeout_returns_none(self):
        async def _slow(*args, **kwargs):
            await asyncio.sleep(9999)

        with patch("lineage_agent.cartel_service._build_report", new=_slow):
            with patch("lineage_agent.cartel_service._COMMUNITY_TIMEOUT", 0.001):
                result = await compute_cartel_report("mint123", "DeployerABC")
        assert result is None

    async def test_successful_build_returns_report(self):
        mock_report = MagicMock()

        async def _fast_build(mint, deployer):
            return mock_report

        with patch("lineage_agent.cartel_service._build_report", new=_fast_build):
            result = await compute_cartel_report("mint123", "DeployerABC")
        assert result is mock_report


# ---------------------------------------------------------------------------
# build_cartel_edges_for_deployer — signal aggregation
# ---------------------------------------------------------------------------

class TestBuildCartelEdgesForDeployer:
    async def test_aggregates_integer_results(self):
        from lineage_agent.cartel_service import build_cartel_edges_for_deployer

        with (
            patch("lineage_agent.cartel_service._signal_timing_sync", new_callable=AsyncMock, return_value=3),
            patch("lineage_agent.cartel_service._signal_phash_cluster", new_callable=AsyncMock, return_value=2),
            patch("lineage_agent.cartel_service._signal_sol_transfer", new_callable=AsyncMock, return_value=1),
            patch("lineage_agent.cartel_service._signal_cross_holdings", new_callable=AsyncMock, return_value=0),
            patch("lineage_agent.cartel_financial_service.build_financial_edges", new_callable=AsyncMock, return_value=4),
        ):
            total = await build_cartel_edges_for_deployer("DeployerX")

        assert total == 10

    async def test_ignores_exceptions_from_signals(self):
        from lineage_agent.cartel_service import build_cartel_edges_for_deployer

        with (
            patch("lineage_agent.cartel_service._signal_timing_sync", new_callable=AsyncMock, side_effect=Exception("fail")),
            patch("lineage_agent.cartel_service._signal_phash_cluster", new_callable=AsyncMock, return_value=5),
            patch("lineage_agent.cartel_service._signal_sol_transfer", new_callable=AsyncMock, return_value=0),
            patch("lineage_agent.cartel_service._signal_cross_holdings", new_callable=AsyncMock, return_value=0),
            patch("lineage_agent.cartel_financial_service.build_financial_edges", new_callable=AsyncMock, return_value=0),
        ):
            total = await build_cartel_edges_for_deployer("DeployerY")

        # Exception result is ignored (not int), so only 5 counted
        assert total == 5

    async def test_all_zero_returns_zero(self):
        from lineage_agent.cartel_service import build_cartel_edges_for_deployer

        with (
            patch("lineage_agent.cartel_service._signal_timing_sync", new_callable=AsyncMock, return_value=0),
            patch("lineage_agent.cartel_service._signal_phash_cluster", new_callable=AsyncMock, return_value=0),
            patch("lineage_agent.cartel_service._signal_sol_transfer", new_callable=AsyncMock, return_value=0),
            patch("lineage_agent.cartel_service._signal_cross_holdings", new_callable=AsyncMock, return_value=0),
            patch("lineage_agent.cartel_financial_service.build_financial_edges", new_callable=AsyncMock, return_value=0),
        ):
            total = await build_cartel_edges_for_deployer("DeployerZ")

        assert total == 0


# ---------------------------------------------------------------------------
# run_cartel_sweep — high-level sweep with mocked DB
# ---------------------------------------------------------------------------

class TestRunCartelSweep:
    async def test_returns_zero_when_no_deployers(self):
        from lineage_agent.cartel_service import run_cartel_sweep

        with (
            patch("lineage_agent.cartel_service.event_query", new_callable=AsyncMock, return_value=[]),
            patch("lineage_agent.cartel_service._signal_dna_match_all", new_callable=AsyncMock, return_value=0),
            patch("lineage_agent.cartel_service._populate_community_lookup", new_callable=AsyncMock),
        ):
            total = await run_cartel_sweep()

        assert total == 0

    async def test_sweeps_eligible_deployers(self):
        from lineage_agent.cartel_service import run_cartel_sweep

        # 3 tokens by same deployer (meets _MIN_TOKENS_FOR_CARTEL_SCAN=2 threshold)
        rows = [{"deployer": "D1"}, {"deployer": "D1"}, {"deployer": "D1"}]

        with (
            patch("lineage_agent.cartel_service.event_query", new_callable=AsyncMock, return_value=rows),
            patch("lineage_agent.cartel_service._signal_dna_match_all", new_callable=AsyncMock, return_value=1),
            patch(
                "lineage_agent.cartel_service.build_cartel_edges_for_deployer",
                new_callable=AsyncMock,
                return_value=2,
            ),
            patch("lineage_agent.cartel_service._populate_community_lookup", new_callable=AsyncMock),
        ):
            total = await run_cartel_sweep()

        # 1 (dna) + 2 (D1) = 3
        assert total == 3

    async def test_handles_exception_gracefully(self):
        from lineage_agent.cartel_service import run_cartel_sweep

        with patch(
            "lineage_agent.cartel_service.event_query",
            new_callable=AsyncMock,
            side_effect=RuntimeError("DB down"),
        ):
            total = await run_cartel_sweep()

        assert total == 0


# ---------------------------------------------------------------------------
# _signal_timing_sync — detect co-timed launches
# ---------------------------------------------------------------------------

class TestSignalTimingSync:
    async def test_returns_zero_when_no_rows(self):
        from lineage_agent.cartel_service import _signal_timing_sync

        with patch("lineage_agent.cartel_service.event_query", new_callable=AsyncMock, return_value=[]):
            result = await _signal_timing_sync("DEPLOYER_A")

        assert result == 0

    async def test_returns_zero_when_nearby_empty(self):
        from lineage_agent.cartel_service import _signal_timing_sync

        my_row = {
            "mint": "MINT_1",
            "narrative": "meme",
            "created_at": "2024-01-01T12:00:00+00:00",
        }

        async def fake_event_query(*args, **kwargs):
            if "deployer = ?" in args[0] and "narrative" in kwargs.get("columns", ""):
                return [my_row]
            return []

        with (
            patch("lineage_agent.cartel_service.event_query", new=fake_event_query),
            patch("lineage_agent.cartel_service.cartel_edge_upsert", new_callable=AsyncMock),
        ):
            result = await _signal_timing_sync("DEPLOYER_A")

        assert result == 0

    async def test_counts_nearby_deployers(self):
        from lineage_agent.cartel_service import _signal_timing_sync

        my_row = {
            "mint": "M1",
            "narrative": "meme",
            "created_at": "2024-01-01T12:00:00+00:00",
        }
        nearby_row = {
            "deployer": "DEPLOYER_B",
            "created_at": "2024-01-01T12:05:00+00:00",
        }

        call_count = {"n": 0}

        async def fake_event_query(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return [my_row]
            return [nearby_row]

        mock_upsert = AsyncMock()
        with (
            patch("lineage_agent.cartel_service.event_query", new=fake_event_query),
            patch("lineage_agent.cartel_service.cartel_edge_upsert", mock_upsert),
        ):
            result = await _signal_timing_sync("DEPLOYER_A")

        assert result == 1
        mock_upsert.assert_called_once()

    async def test_returns_zero_on_exception(self):
        from lineage_agent.cartel_service import _signal_timing_sync

        with patch("lineage_agent.cartel_service.event_query", new_callable=AsyncMock, side_effect=Exception("db")):
            result = await _signal_timing_sync("DEPLOYER_A")

        assert result == 0


# ---------------------------------------------------------------------------
# _signal_phash_cluster — near-identical logos
# ---------------------------------------------------------------------------

class TestSignalPhashCluster:
    async def test_returns_zero_when_no_phash_rows(self):
        from lineage_agent.cartel_service import _signal_phash_cluster

        with patch("lineage_agent.cartel_service.event_query", new_callable=AsyncMock, return_value=[]):
            result = await _signal_phash_cluster("DEPLOYER_A")

        assert result == 0

    async def test_counts_matching_phash(self):
        from lineage_agent.cartel_service import _signal_phash_cluster

        # Two phashes with hamming distance 0 (identical) → should match
        my_rows = [{"mint": "M1", "phash": "aaaaaaaaaaaaaaaa"}]  # 64-bit as hex
        other_rows = [{"deployer": "DEPLOYER_B", "mint": "M2", "phash": "aaaaaaaaaaaaaaaa"}]

        call_count = {"n": 0}

        async def fake_event_query(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return my_rows
            return other_rows

        mock_upsert = AsyncMock()
        with (
            patch("lineage_agent.cartel_service.event_query", new=fake_event_query),
            patch("lineage_agent.cartel_service.cartel_edge_upsert", mock_upsert),
        ):
            result = await _signal_phash_cluster("DEPLOYER_A")

        assert result == 1
        mock_upsert.assert_called_once()

    async def test_skips_different_phash(self):
        from lineage_agent.cartel_service import _signal_phash_cluster

        # Hamming distance 64 (all bits flipped) → should not match
        my_rows = [{"mint": "M1", "phash": "0000000000000000"}]
        other_rows = [{"deployer": "DEPLOYER_B", "mint": "M2", "phash": "ffffffffffffffff"}]

        call_count = {"n": 0}

        async def fake_event_query(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return my_rows
            return other_rows

        mock_upsert = AsyncMock()
        with (
            patch("lineage_agent.cartel_service.event_query", new=fake_event_query),
            patch("lineage_agent.cartel_service.cartel_edge_upsert", mock_upsert),
        ):
            result = await _signal_phash_cluster("DEPLOYER_A")

        assert result == 0

    async def test_returns_zero_on_exception(self):
        from lineage_agent.cartel_service import _signal_phash_cluster

        with patch("lineage_agent.cartel_service.event_query", new_callable=AsyncMock, side_effect=Exception("db")):
            result = await _signal_phash_cluster("DEPLOYER_A")

        assert result == 0


# ---------------------------------------------------------------------------
# _signal_sol_transfer — direct SOL flows between deployers
# ---------------------------------------------------------------------------

class TestSignalSolTransfer:
    async def test_returns_zero_when_no_flows(self):
        from lineage_agent.cartel_service import _signal_sol_transfer

        with patch("lineage_agent.cartel_service.sol_flows_query_by_from", new_callable=AsyncMock, return_value=[]):
            result = await _signal_sol_transfer("DEPLOYER_A")

        assert result == 0

    async def test_counts_transfer_to_known_deployer(self):
        from lineage_agent.cartel_service import _signal_sol_transfer

        flows = [
            {"to_address": "DEPLOYER_B", "amount_lamports": 2_000_000_000, "signature": "sig1", "hop": 0}
        ]
        deployer_rows = [{"deployer": "DEPLOYER_B"}]

        mock_upsert = AsyncMock()
        with (
            patch("lineage_agent.cartel_service.sol_flows_query_by_from", new_callable=AsyncMock, return_value=flows),
            patch("lineage_agent.cartel_service.event_query", new_callable=AsyncMock, return_value=deployer_rows),
            patch("lineage_agent.cartel_service.cartel_edge_upsert", mock_upsert),
        ):
            result = await _signal_sol_transfer("DEPLOYER_A")

        assert result == 1

    async def test_ignores_transfer_below_min_sol(self):
        from lineage_agent.cartel_service import _signal_sol_transfer

        flows = [
            {"to_address": "DEPLOYER_B", "amount_lamports": 1000, "signature": "sig2", "hop": 0}  # < 0.1 SOL
        ]
        deployer_rows = [{"deployer": "DEPLOYER_B"}]

        mock_upsert = AsyncMock()
        with (
            patch("lineage_agent.cartel_service.sol_flows_query_by_from", new_callable=AsyncMock, return_value=flows),
            patch("lineage_agent.cartel_service.event_query", new_callable=AsyncMock, return_value=deployer_rows),
            patch("lineage_agent.cartel_service.cartel_edge_upsert", mock_upsert),
        ):
            result = await _signal_sol_transfer("DEPLOYER_A")

        assert result == 0

    async def test_returns_zero_on_exception(self):
        from lineage_agent.cartel_service import _signal_sol_transfer

        with patch(
            "lineage_agent.cartel_service.sol_flows_query_by_from",
            new_callable=AsyncMock,
            side_effect=Exception("rpc error"),
        ):
            result = await _signal_sol_transfer("DEPLOYER_A")

        assert result == 0


# ---------------------------------------------------------------------------
# _signal_cross_holdings — deployer holds tokens from other deployers
# ---------------------------------------------------------------------------

class TestSignalCrossHoldings:
    async def test_returns_zero_when_fewer_than_3_tokens(self):
        from lineage_agent.cartel_service import _signal_cross_holdings

        # Only 2 rows → below threshold of 3
        with patch(
            "lineage_agent.cartel_service.event_query",
            new_callable=AsyncMock,
            return_value=[{"mint": "M1"}, {"mint": "M2"}],
        ):
            result = await _signal_cross_holdings("DEPLOYER_A")

        assert result == 0

    async def test_returns_zero_when_no_holdings(self):
        from lineage_agent.cartel_service import _signal_cross_holdings

        mock_rpc = MagicMock()
        mock_rpc.get_deployer_token_holdings = AsyncMock(return_value=[])

        with (
            patch("lineage_agent.cartel_service.event_query", new_callable=AsyncMock,
                  return_value=[{"mint": "M1"}, {"mint": "M2"}, {"mint": "M3"}]),
            patch("lineage_agent.cartel_service.get_rpc_client", return_value=mock_rpc),
        ):
            result = await _signal_cross_holdings("DEPLOYER_A")

        assert result == 0

    async def test_counts_cross_holdings(self):
        from lineage_agent.cartel_service import _signal_cross_holdings

        holding_mints = ["M_OTHER1"]
        creator_rows = [{"mint": "M_OTHER1", "deployer": "DEPLOYER_B"}]
        my_token_rows = [{"mint": "M1"}, {"mint": "M2"}, {"mint": "M3"}]

        mock_rpc = MagicMock()
        mock_rpc.get_deployer_token_holdings = AsyncMock(return_value=holding_mints)

        call_count = {"n": 0}

        async def fake_event_query(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return my_token_rows
            return creator_rows

        mock_upsert = AsyncMock()
        with (
            patch("lineage_agent.cartel_service.event_query", new=fake_event_query),
            patch("lineage_agent.cartel_service.get_rpc_client", return_value=mock_rpc),
            patch("lineage_agent.cartel_service.cartel_edge_upsert", mock_upsert),
        ):
            result = await _signal_cross_holdings("DEPLOYER_A")

        assert result == 1


# ---------------------------------------------------------------------------
# _signal_dna_match_all — shared metadata fingerprint
# ---------------------------------------------------------------------------

class TestSignalDnaMatchAll:
    async def test_returns_zero_when_no_mappings(self):
        from lineage_agent.cartel_service import _signal_dna_match_all

        with patch(
            "lineage_agent.cartel_service.operator_mapping_query_all",
            new_callable=AsyncMock,
            return_value=[],
        ):
            result = await _signal_dna_match_all()

        assert result == 0

    async def test_returns_zero_for_single_wallet_per_fingerprint(self):
        from lineage_agent.cartel_service import _signal_dna_match_all

        rows = [{"fingerprint": "fp1", "wallet": "W1"}]
        with patch(
            "lineage_agent.cartel_service.operator_mapping_query_all",
            new_callable=AsyncMock,
            return_value=rows,
        ):
            result = await _signal_dna_match_all()

        assert result == 0

    async def test_creates_edges_for_multiple_wallets(self):
        from lineage_agent.cartel_service import _signal_dna_match_all

        rows = [
            {"fingerprint": "fp1", "wallet": "W1"},
            {"fingerprint": "fp1", "wallet": "W2"},
            {"fingerprint": "fp1", "wallet": "W3"},
        ]
        mock_upsert = AsyncMock()
        with (
            patch("lineage_agent.cartel_service.operator_mapping_query_all", new_callable=AsyncMock, return_value=rows),
            patch("lineage_agent.cartel_service.cartel_edge_upsert", mock_upsert),
        ):
            result = await _signal_dna_match_all()

        # 3 wallets → C(3,2) = 3 edges
        assert result == 3
        assert mock_upsert.call_count == 3

    async def test_returns_zero_on_exception(self):
        from lineage_agent.cartel_service import _signal_dna_match_all

        with patch(
            "lineage_agent.cartel_service.operator_mapping_query_all",
            new_callable=AsyncMock,
            side_effect=Exception("db error"),
        ):
            result = await _signal_dna_match_all()

        assert result == 0
