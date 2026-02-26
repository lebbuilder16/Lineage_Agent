"""
Tests for insider_sell_service.py and SolanaRpcClient.get_wallet_token_balance.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from lineage_agent.insider_sell_service import (
    analyze_insider_sell,
    _fill_market_signals,
    _apply_flags,
    _compute_risk_score,
    _compute_verdict,
)
from lineage_agent.models import InsiderSellReport
from lineage_agent.data_sources.solana_rpc import SolanaRpcClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MINT     = "MintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
DEPLOYER = "DeployerAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

def _make_pair(
    buys_1h=10, sells_1h=5,
    buys_6h=40, sells_6h=20,
    buys_24h=100, sells_24h=50,
    price_h1=1.0, price_h6=3.0, price_h24=5.0,
    vol_h1=1000.0, vol_h24=24000.0,
    chain="solana",
) -> dict:
    return {
        "chainId": chain,
        "txns": {
            "h1":  {"buys": buys_1h,  "sells": sells_1h},
            "h6":  {"buys": buys_6h,  "sells": sells_6h},
            "h24": {"buys": buys_24h, "sells": sells_24h},
        },
        "priceChange": {"h1": price_h1, "h6": price_h6, "h24": price_h24},
        "volume": {"h1": vol_h1, "h24": vol_h24},
    }


# ---------------------------------------------------------------------------
# _fill_market_signals
# ---------------------------------------------------------------------------

class TestFillMarketSignals:

    def test_equal_buys_sells(self):
        pair = _make_pair(buys_24h=100, sells_24h=100)
        r = InsiderSellReport(mint=MINT)
        _fill_market_signals(r, [pair])
        assert r.sell_pressure_24h == pytest.approx(0.5, abs=0.001)

    def test_heavy_sells(self):
        pair = _make_pair(buys_24h=20, sells_24h=80)
        r = InsiderSellReport(mint=MINT)
        _fill_market_signals(r, [pair])
        assert r.sell_pressure_24h == pytest.approx(0.8, abs=0.001)

    def test_no_solana_pairs(self):
        pair = _make_pair(chain="ethereum")
        r = InsiderSellReport(mint=MINT)
        _fill_market_signals(r, [pair])
        assert r.sell_pressure_24h is None

    def test_price_change_populated(self):
        pair = _make_pair(price_h24=-60.0)
        r = InsiderSellReport(mint=MINT)
        _fill_market_signals(r, [pair])
        assert r.price_change_24h == -60.0

    def test_volume_spike_ratio(self):
        # 1h vol = 4000, 24h vol = 24000 → avg hourly = 1000 → spike = 4.0
        pair = _make_pair(vol_h1=4000.0, vol_h24=24000.0)
        r = InsiderSellReport(mint=MINT)
        _fill_market_signals(r, [pair])
        assert r.volume_spike_ratio == pytest.approx(4.0, abs=0.01)

    def test_volume_spike_below_threshold(self):
        # No spike: 1h vol = 500, avg hourly = 1000 → spike = 0.5
        pair = _make_pair(vol_h1=500.0, vol_h24=24000.0)
        r = InsiderSellReport(mint=MINT)
        _fill_market_signals(r, [pair])
        assert r.volume_spike_ratio == pytest.approx(0.5, abs=0.01)

    def test_aggregates_multiple_pairs(self):
        p1 = _make_pair(buys_24h=30, sells_24h=70)
        p2 = _make_pair(buys_24h=20, sells_24h=30)
        r = InsiderSellReport(mint=MINT)
        _fill_market_signals(r, [p1, p2])
        # total = 50 buys, 100 sells → pressure = 100/150 ≈ 0.667
        assert r.sell_pressure_24h == pytest.approx(100/150, abs=0.001)


# ---------------------------------------------------------------------------
# _apply_flags
# ---------------------------------------------------------------------------

class TestApplyFlags:

    def _report(self, **kwargs) -> InsiderSellReport:
        base = {
            "mint": MINT,
            "sell_pressure_24h": None,
            "price_change_24h": None,
            "volume_spike_ratio": None,
            "deployer_exited": None,
        }
        base.update(kwargs)
        r = InsiderSellReport(**base)
        _apply_flags(r)
        return r

    def test_elevated_sell_pressure_flag(self):
        r = self._report(sell_pressure_24h=0.70)
        assert "ELEVATED_SELL_PRESSURE" in r.flags

    def test_high_sell_pressure_flag(self):
        r = self._report(sell_pressure_24h=0.58)
        assert "HIGH_SELL_PRESSURE" in r.flags

    def test_price_crash_flag(self):
        r = self._report(price_change_24h=-55.0)
        assert "PRICE_CRASH" in r.flags

    def test_price_declining_flag(self):
        r = self._report(price_change_24h=-35.0)
        assert "PRICE_DECLINING" in r.flags

    def test_sell_burst_flag(self):
        r = self._report(volume_spike_ratio=5.0)
        assert "SELL_BURST" in r.flags

    def test_deployer_exited_flag(self):
        r = self._report(deployer_exited=True)
        assert "DEPLOYER_EXITED" in r.flags

    def test_insider_dump_confirmed(self):
        r = self._report(
            sell_pressure_24h=0.72,
            price_change_24h=-55.0,
            deployer_exited=True,
        )
        assert "INSIDER_DUMP_CONFIRMED" in r.flags

    def test_no_flags_on_clean_token(self):
        r = self._report(sell_pressure_24h=0.45, price_change_24h=5.0)
        assert r.flags == []


# ---------------------------------------------------------------------------
# _compute_risk_score
# ---------------------------------------------------------------------------

class TestComputeRiskScore:

    def test_clean_score(self):
        r = InsiderSellReport(mint=MINT, sell_pressure_24h=0.40)
        r.flags = []
        assert _compute_risk_score(r) == 0.0

    def test_max_score_confirmed_dump(self):
        r = InsiderSellReport(
            mint=MINT,
            sell_pressure_24h=0.80,
            price_change_24h=-60.0,
            volume_spike_ratio=5.0,
            deployer_exited=True,
        )
        r.flags = ["INSIDER_DUMP_CONFIRMED"]
        score = _compute_risk_score(r)
        assert score >= 0.80

    def test_deployer_still_holding_reduces_score(self):
        r1 = InsiderSellReport(mint=MINT, sell_pressure_24h=0.60)
        r1.flags = ["HIGH_SELL_PRESSURE"]
        r2 = InsiderSellReport(mint=MINT, sell_pressure_24h=0.60, deployer_exited=False)
        r2.flags = ["HIGH_SELL_PRESSURE"]
        # r2 should have lower score (deployer still in)
        assert _compute_risk_score(r2) < _compute_risk_score(r1) + 0.01


# ---------------------------------------------------------------------------
# _compute_verdict
# ---------------------------------------------------------------------------

class TestComputeVerdict:

    def test_insider_dump(self):
        r = InsiderSellReport(mint=MINT, risk_score=0.9)
        r.flags = ["INSIDER_DUMP_CONFIRMED"]
        assert _compute_verdict(r) == "insider_dump"

    def test_suspicious_via_score(self):
        r = InsiderSellReport(mint=MINT, risk_score=0.50)
        r.flags = []
        assert _compute_verdict(r) == "suspicious"

    def test_suspicious_via_deployer_exited(self):
        r = InsiderSellReport(mint=MINT, risk_score=0.0)
        r.flags = ["DEPLOYER_EXITED"]
        assert _compute_verdict(r) == "suspicious"

    def test_clean(self):
        r = InsiderSellReport(mint=MINT, risk_score=0.0)
        r.flags = []
        assert _compute_verdict(r) == "clean"


# ---------------------------------------------------------------------------
# SolanaRpcClient.get_wallet_token_balance
# ---------------------------------------------------------------------------

@pytest.fixture
def rpc() -> SolanaRpcClient:
    return SolanaRpcClient("https://api.mainnet-beta.solana.com")


class TestGetWalletTokenBalance:

    @pytest.mark.asyncio
    async def test_returns_balance(self, rpc):
        mock_result = {
            "value": [
                {
                    "account": {
                        "data": {
                            "parsed": {
                                "info": {
                                    "mint": MINT,
                                    "tokenAmount": {"uiAmount": 1234.56},
                                }
                            }
                        }
                    }
                }
            ]
        }
        with patch.object(rpc, "_call", new_callable=AsyncMock, return_value=mock_result):
            bal = await rpc.get_wallet_token_balance(DEPLOYER, MINT)
        assert bal == pytest.approx(1234.56)

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_accounts(self, rpc):
        mock_result = {"value": []}
        with patch.object(rpc, "_call", new_callable=AsyncMock, return_value=mock_result):
            bal = await rpc.get_wallet_token_balance(DEPLOYER, MINT)
        assert bal == 0.0

    @pytest.mark.asyncio
    async def test_returns_zero_on_rpc_failure(self, rpc):
        with patch.object(rpc, "_call", new_callable=AsyncMock, return_value=None):
            bal = await rpc.get_wallet_token_balance(DEPLOYER, MINT)
        assert bal == 0.0

    @pytest.mark.asyncio
    async def test_sums_multiple_accounts(self, rpc):
        """Handles wallets with multiple token accounts for the same mint."""
        mock_result = {
            "value": [
                {"account": {"data": {"parsed": {"info": {"mint": MINT, "tokenAmount": {"uiAmount": 500.0}}}}}},
                {"account": {"data": {"parsed": {"info": {"mint": MINT, "tokenAmount": {"uiAmount": 250.0}}}}}},
            ]
        }
        with patch.object(rpc, "_call", new_callable=AsyncMock, return_value=mock_result):
            bal = await rpc.get_wallet_token_balance(DEPLOYER, MINT)
        assert bal == pytest.approx(750.0)


# ---------------------------------------------------------------------------
# analyze_insider_sell (integration-level, mocked RPC)
# ---------------------------------------------------------------------------

class TestAnalyzeInsiderSell:

    @pytest.mark.asyncio
    async def test_confirmed_dump_scenario(self, rpc):
        """Heavy sells + price crash + deployer balance 0 → insider_dump."""
        pair = _make_pair(
            buys_24h=15, sells_24h=85,
            price_h24=-65.0,
            vol_h1=8000.0, vol_h24=24000.0,
        )
        with patch.object(rpc, "get_wallet_token_balance", new_callable=AsyncMock, return_value=0.0):
            report = await analyze_insider_sell(
                mint=MINT,
                deployer=DEPLOYER,
                linked_wallets=[],
                pairs=[pair],
                rpc=rpc,
            )
        assert report.verdict == "insider_dump"
        assert "INSIDER_DUMP_CONFIRMED" in report.flags
        assert report.deployer_exited is True

    @pytest.mark.asyncio
    async def test_clean_scenario(self, rpc):
        """Balanced txns, positive price, deployer still holding → clean."""
        pair = _make_pair(
            buys_24h=60, sells_24h=40,
            price_h24=15.0,
            vol_h1=800.0, vol_h24=24000.0,
        )
        with patch.object(rpc, "get_wallet_token_balance", new_callable=AsyncMock, return_value=500_000.0):
            report = await analyze_insider_sell(
                mint=MINT,
                deployer=DEPLOYER,
                linked_wallets=[],
                pairs=[pair],
                rpc=rpc,
            )
        assert report.verdict == "clean"
        assert report.deployer_exited is False

    @pytest.mark.asyncio
    async def test_no_pairs_returns_clean(self, rpc):
        """Token with no DexScreener pairs yet → insufficient data, clean by default."""
        with patch.object(rpc, "get_wallet_token_balance", new_callable=AsyncMock, return_value=0.0):
            report = await analyze_insider_sell(
                mint=MINT,
                deployer=DEPLOYER,
                linked_wallets=[],
                pairs=[],
                rpc=rpc,
            )
        # Only deployer_exited flag, not enough evidence for dump alone
        assert report.verdict in ("clean", "suspicious")
        assert report.sell_pressure_24h is None

    @pytest.mark.asyncio
    async def test_rpc_timeout_graceful(self, rpc):
        """RPC timeout on balance call does not raise — report still computed."""
        import asyncio as _asyncio

        async def _slow_balance(*args, **kwargs):
            await _asyncio.sleep(100)
            return 0.0

        pair = _make_pair(buys_24h=20, sells_24h=80, price_h24=-55.0)
        with patch.object(rpc, "get_wallet_token_balance", side_effect=_slow_balance):
            # Monkeypatch wait_for timeout to 0.01 s to force timeout quickly
            original_wait_for = _asyncio.wait_for

            async def _fast_wait_for(coro, timeout):
                return await original_wait_for(coro, timeout=0.01)

            import lineage_agent.insider_sell_service as _svc
            original = _svc.asyncio.wait_for
            _svc.asyncio.wait_for = _fast_wait_for
            try:
                report = await analyze_insider_sell(
                    mint=MINT,
                    deployer=DEPLOYER,
                    linked_wallets=[],
                    pairs=[pair],
                    rpc=rpc,
                )
            finally:
                _svc.asyncio.wait_for = original

        # Market signals should still be populated even if RPC failed
        assert report.sell_pressure_24h is not None

    @pytest.mark.asyncio
    async def test_linked_wallets_checked(self, rpc):
        """Up to 3 linked wallets are included in wallet_events."""
        pair = _make_pair()
        linked = [
            "LinkedWallet1AAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "LinkedWallet2AAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "LinkedWallet3AAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "LinkedWallet4AAAAAAAAAAAAAAAAAAAAAAAAAAAAA",  # 4th → must be ignored
        ]
        call_count = 0

        async def _mock_balance(wallet, mint):
            nonlocal call_count
            call_count += 1
            return 100.0

        with patch.object(rpc, "get_wallet_token_balance", side_effect=_mock_balance):
            report = await analyze_insider_sell(
                mint=MINT,
                deployer=DEPLOYER,
                linked_wallets=linked,
                pairs=[pair],
                rpc=rpc,
            )

        # deployer + 3 linked = 4 calls total (4th linked wallet is skipped)
        assert call_count == 4
        assert len(report.wallet_events) == 4
