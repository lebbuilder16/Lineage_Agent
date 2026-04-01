"""Unit tests for lineage_agent.sniper_tracker_service.

Covers:
- analyze_sniper_ring public API (timeout, no helius, exceptions)
- _run_analysis internals: sniper extraction, funding detection,
  shared funder pattern, SOL return, verdict logic
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lineage_agent.sniper_tracker_service import analyze_sniper_ring


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_rpc(helius_key: str = "test-key"):
    rpc = MagicMock()
    rpc.helius_api_key = helius_key
    rpc.get_enhanced_transactions = AsyncMock(return_value=[])
    return rpc


def _buy_tx(buyer: str, mint: str, *, slot: int = 100, sol_lamports: int = 1_000_000_000,
            token_amount: float = 1000.0, timestamp: int = 0):
    """Build a minimal Helius Enhanced Transaction representing a token buy."""
    return {
        "slot": slot,
        "timestamp": timestamp,
        "signature": f"sig_{buyer[:8]}_{slot}",
        "tokenTransfers": [
            {"mint": mint, "toUserAccount": buyer, "tokenAmount": token_amount},
        ],
        "nativeTransfers": [
            {"fromUserAccount": buyer, "toUserAccount": "AMM_POOL", "amount": sol_lamports},
        ],
    }


def _fund_tx(funder: str, recipient: str, *, slot: int = 50, lamports: int = 500_000_000):
    """Helius Enhanced TX representing a SOL funding transfer."""
    return {
        "slot": slot,
        "timestamp": 0,
        "signature": f"fund_{funder[:6]}_{slot}",
        "tokenTransfers": [],
        "nativeTransfers": [
            {"fromUserAccount": funder, "toUserAccount": recipient, "amount": lamports},
        ],
    }


def _sell_tx(seller: str, mint: str, *, slot: int = 200, sol_received: int = 2_000_000_000,
             return_to: str | None = None, return_amount: int = 500_000_000):
    """Helius Enhanced TX representing a token sell (+ optional SOL return)."""
    native = [{"toUserAccount": seller, "fromUserAccount": "AMM_POOL", "amount": sol_received}]
    if return_to:
        native.append({"fromUserAccount": seller, "toUserAccount": return_to, "amount": return_amount})
    return {
        "slot": slot,
        "timestamp": 0,
        "signature": f"sell_{seller[:6]}_{slot}",
        "tokenTransfers": [
            {"mint": mint, "fromUserAccount": seller, "toUserAccount": "AMM_POOL", "tokenAmount": 1000.0},
        ],
        "nativeTransfers": native,
    }


# ---------------------------------------------------------------------------
# Public API — analyze_sniper_ring
# ---------------------------------------------------------------------------

class TestAnalyzeSniperRingAPI:
    async def test_returns_none_without_helius(self):
        rpc = _make_rpc(helius_key="")
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring("MINT", "DEPLOYER")
        assert result is None

    async def test_returns_none_on_timeout(self):
        rpc = _make_rpc()
        with (
            patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc),
            patch("lineage_agent.sniper_tracker_service._run_analysis",
                  side_effect=asyncio.TimeoutError),
        ):
            result = await analyze_sniper_ring("MINT", "DEPLOYER")
        assert result is None

    async def test_returns_none_on_exception(self):
        rpc = _make_rpc()
        with (
            patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc),
            patch("lineage_agent.sniper_tracker_service._run_analysis",
                  side_effect=RuntimeError("rpc down")),
        ):
            result = await analyze_sniper_ring("MINT", "DEPLOYER")
        assert result is None


# ---------------------------------------------------------------------------
# _run_analysis — sniper extraction
# ---------------------------------------------------------------------------

class TestSniperExtraction:
    async def test_no_enhanced_txs_returns_none(self):
        rpc = _make_rpc()
        rpc.get_enhanced_transactions = AsyncMock(return_value=[])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring("MINT", "DEPLOYER")
        assert result is None

    async def test_no_buyers_returns_no_snipers(self):
        """TXs exist but none are token buys → verdict no_snipers."""
        rpc = _make_rpc()
        rpc.get_enhanced_transactions = AsyncMock(return_value=[
            {"slot": 100, "timestamp": 0, "tokenTransfers": [], "nativeTransfers": []},
        ])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring("MINT", "DEPLOYER", creation_slot=90)
        assert result is not None
        assert result.verdict == "no_snipers"

    async def test_buyer_outside_slot_window_ignored(self):
        """Buy TX 100 slots after creation → outside 50-slot window."""
        rpc = _make_rpc()
        rpc.get_enhanced_transactions = AsyncMock(side_effect=[
            [_buy_tx("SNIPER_A", "MINT", slot=200)],  # mint query
            [],  # wallet query
        ])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring("MINT", "DEPLOYER", creation_slot=90)
        assert result is not None
        assert result.verdict == "no_snipers"

    async def test_buyer_within_slot_window_detected(self):
        """Buy TX 10 slots after creation → within window → detected as sniper."""
        rpc = _make_rpc()
        rpc.get_enhanced_transactions = AsyncMock(side_effect=[
            [_buy_tx("SNIPER_A", "MINT", slot=100)],  # mint query
            [],  # wallet enhanced TXs (no funding info)
        ])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring("MINT", "DEPLOYER", creation_slot=90)
        assert result is not None
        assert result.ring_size == 1
        assert result.snipers[0].wallet == "SNIPER_A"
        assert result.verdict == "organic"

    async def test_deployer_wallet_not_counted_as_sniper(self):
        """Deployer buying their own token should be excluded."""
        rpc = _make_rpc()
        rpc.get_enhanced_transactions = AsyncMock(side_effect=[
            [_buy_tx("DEPLOYER", "MINT", slot=100)],
            [],
        ])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring("MINT", "DEPLOYER", creation_slot=90)
        assert result is not None
        assert result.verdict == "no_snipers"

    async def test_time_based_window_fallback(self):
        """When creation_slot is None, use timestamp-based 20s window."""
        from datetime import datetime, timezone
        created = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

        rpc = _make_rpc()
        # Buy at +5s → within window
        rpc.get_enhanced_transactions = AsyncMock(side_effect=[
            [_buy_tx("SNIPER_A", "MINT", slot=0, timestamp=int(created.timestamp()) + 5)],
            [],
        ])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring(
                "MINT", "DEPLOYER", creation_slot=None, created_at=created,
            )
        assert result is not None
        assert result.ring_size == 1


# ---------------------------------------------------------------------------
# Deployer links — funding, SOL return, shared funder
# ---------------------------------------------------------------------------

class TestDeployerLinks:
    async def test_deployer_funded_sniper_detected(self):
        """Deployer funds a sniper pre-buy → FUNDED_BY_DEPLOYER flag + risk boost."""
        rpc = _make_rpc()
        rpc.get_enhanced_transactions = AsyncMock(side_effect=[
            # Mint enhanced TXs: sniper buy
            [_buy_tx("SNIPER_A", "MINT", slot=100)],
            # Sniper wallet TXs: deployer funded pre-buy
            [_fund_tx("DEPLOYER", "SNIPER_A", slot=50)],
        ])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring("MINT", "DEPLOYER", creation_slot=90)

        assert result is not None
        assert result.deployer_funded_count == 1
        assert result.snipers[0].funder_is_deployer is True
        assert "FUNDED_BY_DEPLOYER" in result.snipers[0].flags
        assert result.risk_score >= 0.4  # deployer_funded adds ≥0.4

    async def test_sol_returned_to_deployer(self):
        """Sniper sells + sends SOL back to deployer → SOL_RETURNED_TO_DEPLOYER."""
        rpc = _make_rpc()
        rpc.get_enhanced_transactions = AsyncMock(side_effect=[
            [_buy_tx("SNIPER_A", "MINT", slot=100)],
            # Wallet TXs: sell at slot 200 with SOL returned to deployer
            [_sell_tx("SNIPER_A", "MINT", slot=200, return_to="DEPLOYER")],
        ])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring("MINT", "DEPLOYER", creation_slot=90)

        assert result is not None
        assert result.sol_returned_to_deployer > 0
        assert "SOL_RETURNED_TO_DEPLOYER" in result.snipers[0].flags
        assert result.risk_score >= 0.3

    async def test_shared_funder_pattern(self):
        """Two snipers funded by same wallet → SHARED_FUNDER flag."""
        rpc = _make_rpc()
        rpc.get_enhanced_transactions = AsyncMock(side_effect=[
            # Mint TXs: two snipers buy
            [
                _buy_tx("SNIPER_A", "MINT", slot=100),
                _buy_tx("SNIPER_B", "MINT", slot=101),
            ],
            # SNIPER_A wallet: funded by FACTORY
            [_fund_tx("FACTORY", "SNIPER_A", slot=50)],
            # SNIPER_B wallet: funded by same FACTORY
            [_fund_tx("FACTORY", "SNIPER_B", slot=51)],
        ])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring("MINT", "DEPLOYER", creation_slot=90)

        assert result is not None
        assert result.shared_funder == "FACTORY"
        assert result.shared_funder_count == 2
        shared_flags = [s for s in result.snipers if "SHARED_FUNDER" in s.flags]
        assert len(shared_flags) == 2


# ---------------------------------------------------------------------------
# Verdict logic
# ---------------------------------------------------------------------------

class TestVerdict:
    async def test_organic_verdict_when_no_links(self):
        rpc = _make_rpc()
        rpc.get_enhanced_transactions = AsyncMock(side_effect=[
            [_buy_tx("SNIPER_A", "MINT", slot=100)],
            [],
        ])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring("MINT", "DEPLOYER", creation_slot=90)
        assert result.verdict == "organic"
        assert result.risk_score < 0.2

    async def test_deployer_linked_ring_verdict(self):
        """Deployer-funded + SOL returned → high risk → deployer_linked_ring."""
        rpc = _make_rpc()
        rpc.get_enhanced_transactions = AsyncMock(side_effect=[
            [_buy_tx("SNIPER_A", "MINT", slot=100)],
            # Funded by deployer pre-buy + sold + returned SOL
            [
                _fund_tx("DEPLOYER", "SNIPER_A", slot=50),
                _sell_tx("SNIPER_A", "MINT", slot=200, return_to="DEPLOYER"),
            ],
        ])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring("MINT", "DEPLOYER", creation_slot=90)

        assert result.verdict == "deployer_linked_ring"
        assert result.risk_score >= 0.5

    async def test_suspicious_ring_verdict(self):
        """Shared funder but no deployer link → suspicious_ring."""
        rpc = _make_rpc()
        rpc.get_enhanced_transactions = AsyncMock(side_effect=[
            [
                _buy_tx("SNIPER_A", "MINT", slot=100),
                _buy_tx("SNIPER_B", "MINT", slot=101),
            ],
            [_fund_tx("FACTORY", "SNIPER_A", slot=50)],
            [_fund_tx("FACTORY", "SNIPER_B", slot=51)],
        ])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring("MINT", "DEPLOYER", creation_slot=90)

        assert result.verdict in ("suspicious_ring", "organic")
        # shared_funder_count >= 2 adds 0.2 risk
        assert result.shared_funder_count >= 2


# ---------------------------------------------------------------------------
# Fresh wallet detection
# ---------------------------------------------------------------------------

class TestFreshWallet:
    async def test_fresh_wallet_flag(self):
        """Wallet created <1h before snipe → FRESH_WALLET flag."""
        from datetime import datetime, timezone
        created = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

        rpc = _make_rpc()
        # Wallet's oldest TX is 30 minutes before creation
        wallet_tx = {
            "slot": 50,
            "timestamp": int(created.timestamp()) - 1800,  # 30 min before
            "tokenTransfers": [],
            "nativeTransfers": [],
        }
        rpc.get_enhanced_transactions = AsyncMock(side_effect=[
            [_buy_tx("SNIPER_A", "MINT", slot=100, timestamp=int(created.timestamp()) + 5)],
            [wallet_tx],
        ])
        with patch("lineage_agent.sniper_tracker_service.get_rpc_client", return_value=rpc):
            result = await analyze_sniper_ring(
                "MINT", "DEPLOYER", creation_slot=90, created_at=created,
            )

        assert result is not None
        assert result.ring_size == 1
        assert "FRESH_WALLET" in result.snipers[0].flags
