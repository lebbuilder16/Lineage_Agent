"""Integration tests for the full detect_lineage flow with mocked data sources."""

from __future__ import annotations

from contextlib import ExitStack, contextmanager
import json
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from lineage_agent.lineage_detector import detect_lineage, search_tokens
from lineage_agent.data_sources import _clients
from lineage_agent.cache import SQLiteCache, TTLCache
from lineage_agent.models import BundleExtractionReport, EvidenceLevel, RugMechanism, SolFlowReport


@pytest.fixture(autouse=True)
def clear_cache():
    """Replace the module-level cache with a fresh in-memory TTLCache before each test."""
    old_cache = _clients.cache
    _clients.cache = TTLCache()
    yield
    _clients.cache = old_cache


# Sample pair data returned by DexScreener
_QUERY_PAIRS = [
    {
        "chainId": "solana",
        "baseToken": {
            "address": "QueryMint1234567890123456789012345678",
            "name": "OriginalDoge",
            "symbol": "ODOGE",
        },
        "info": {"imageUrl": "https://img.example.com/odoge.png"},
        "priceUsd": "0.001",
        "marketCap": 5_000_000,
        "liquidity": {"usd": 300_000},
        "url": "https://dex.example.com/odoge",
    }
]

_SEARCH_PAIRS = [
    {
        "chainId": "solana",
        "baseToken": {
            "address": "CloneMintA12345678901234567890123456789",
            "name": "OriginalDoge",
            "symbol": "ODOGE",
        },
        "info": {"imageUrl": "https://img.example.com/clone1.png"},
        "priceUsd": "0.0001",
        "marketCap": 100_000,
        "liquidity": {"usd": 10_000},
        "url": "",
    },
    {
        "chainId": "solana",
        "baseToken": {
            "address": "CloneMintB12345678901234567890123456789",
            "name": "OrigDoge2",
            "symbol": "ODOGE2",
        },
        "info": {},
        "priceUsd": None,
        "marketCap": None,
        "liquidity": {"usd": 500},
        "url": "",
    },
    {
        "chainId": "ethereum",  # non-Solana — should be filtered out
        "baseToken": {
            "address": "0xabc",
            "name": "EthDoge",
            "symbol": "EDOGE",
        },
        "info": {},
        "priceUsd": "1.0",
        "marketCap": 99_999_999,
        "liquidity": {"usd": 9_999_999},
        "url": "",
    },
]


def _make_dex_client():
    """Create a mock DexScreenerClient."""
    dex = AsyncMock()
    dex.get_token_pairs = AsyncMock(return_value=_QUERY_PAIRS)
    dex.get_token_pairs_with_fallback = AsyncMock(return_value=_QUERY_PAIRS)
    dex.search_tokens = AsyncMock(return_value=_SEARCH_PAIRS)
    dex.search_tokens_with_fallback = AsyncMock(return_value=_SEARCH_PAIRS)

    # Use real conversion methods from the actual class
    from lineage_agent.data_sources.dexscreener import DexScreenerClient
    real = DexScreenerClient.__new__(DexScreenerClient)
    dex.pairs_to_metadata = real.pairs_to_metadata
    dex.pairs_to_search_results = real.pairs_to_search_results
    return dex


def _make_rpc_client():
    """Create a mock SolanaRpcClient that returns predictable data."""
    base_time = datetime(2024, 1, 1, tzinfo=timezone.utc)

    async def fake_deployer(mint: str):
        if "Query" in mint:
            return ("DeployerAAA", base_time)
        elif "CloneA" in mint:
            return ("DeployerAAA", base_time + timedelta(days=5))
        elif "CloneB" in mint:
            return ("DeployerBBB", base_time + timedelta(days=30))
        return ("", None)

    rpc = AsyncMock()
    rpc.get_deployer_and_timestamp = AsyncMock(side_effect=fake_deployer)
    rpc.get_asset = AsyncMock(return_value={})  # DAS returns empty → falls back to sig walk
    rpc.search_assets_by_creator = AsyncMock(return_value=[])  # no extra deployer candidates
    return rpc


@contextmanager
def _patch_fast_detect_lineage_background_work():
    """Disable slow enrichers in tests that only care about lineage caching/state."""
    with ExitStack() as stack:
        jup = AsyncMock()
        jup.get_price = AsyncMock(return_value=None)
        stack.enter_context(
            patch("lineage_agent.lineage_detector._get_jup_client", return_value=jup)
        )
        stack.enter_context(
            patch(
                "lineage_agent.lineage_detector.get_sol_flow_report",
                new_callable=AsyncMock,
                return_value=None,
            )
        )
        stack.enter_context(
            patch(
                "lineage_agent.lineage_detector.trace_sol_flow",
                new_callable=AsyncMock,
                return_value=None,
            )
        )
        stack.enter_context(
            patch(
                "lineage_agent.lineage_detector.analyze_bundle",
                new_callable=AsyncMock,
                return_value=None,
            )
        )
        yield


class TestDetectLineageIntegration:

    @pytest.mark.asyncio
    async def test_full_flow(self):
        """Full lineage detection with mocked DexScreener + RPC."""
        dex = _make_dex_client()
        rpc = _make_rpc_client()

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
             patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
               patch("lineage_agent.lineage_detector.compute_image_similarity", new_callable=AsyncMock, return_value=0.9), \
               _patch_fast_detect_lineage_background_work():

            result = await detect_lineage("QueryMint1234567890123456789012345678")

        assert result.mint == "QueryMint1234567890123456789012345678"
        assert result.root is not None
        assert result.root.name == "OriginalDoge"
        assert result.family_size >= 1
        assert 0.0 <= result.confidence <= 1.0

    @pytest.mark.asyncio
    async def test_query_deployer_prefers_creator_over_update_authority(self):
        """Regression: deployer must match on-chain creator (Solscan-style)."""
        dex = AsyncMock()
        dex.get_token_pairs = AsyncMock(return_value=_QUERY_PAIRS)
        dex.get_token_pairs_with_fallback = AsyncMock(return_value=_QUERY_PAIRS)
        dex.search_tokens = AsyncMock(return_value=[])
        dex.search_tokens_with_fallback = AsyncMock(return_value=[])
        dex.pairs_to_metadata = _make_dex_client().pairs_to_metadata
        dex.pairs_to_search_results = _make_dex_client().pairs_to_search_results

        creator = "5hH3qDQEHXa7Rff5k1Tz3Dot6HFTjQcfMQQJRXyxRszA"
        wrong_ua_or_signer = "29bu1111111111111111111111111111111111W4mw"

        rpc = AsyncMock()
        rpc.get_asset = AsyncMock(return_value={
            "authorities": [{"address": wrong_ua_or_signer}],
            "creators": [{"address": creator, "verified": True}],
        })
        rpc.get_deployer_and_timestamp = AsyncMock(
            return_value=(wrong_ua_or_signer, datetime(2024, 1, 1, tzinfo=timezone.utc))
        )
        rpc.search_assets_by_creator = AsyncMock(return_value=[])

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
               patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
               _patch_fast_detect_lineage_background_work():
            result = await detect_lineage("QueryMint1234567890123456789012345678")

        assert result.query_token.deployer == creator

    @pytest.mark.asyncio
    async def test_no_name_no_symbol(self):
        """Token with no name/symbol should return early with self as root."""
        empty_pairs = [
            {
                "chainId": "solana",
                "baseToken": {"address": "EmptyMint12345678901234567890123456", "name": "", "symbol": ""},
                "info": {},
                "priceUsd": None,
                "marketCap": None,
                "liquidity": {"usd": None},
                "url": "",
            }
        ]

        dex = AsyncMock()
        dex.get_token_pairs = AsyncMock(return_value=empty_pairs)
        dex.get_token_pairs_with_fallback = AsyncMock(return_value=empty_pairs)
        dex.pairs_to_metadata = _make_dex_client().pairs_to_metadata

        rpc = AsyncMock()
        rpc.get_deployer_and_timestamp = AsyncMock(return_value=("", None))
        rpc.get_asset = AsyncMock(return_value={})
        rpc.search_assets_by_creator = AsyncMock(return_value=[])

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
             patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc):

            result = await detect_lineage("EmptyMint12345678901234567890123456")

        assert result.family_size == 1
        assert result.confidence == 0.0
        assert result.derivatives == []

    @pytest.mark.asyncio
    async def test_no_candidates(self):
        """If search returns no Solana tokens, result has no derivatives."""
        dex = AsyncMock()
        dex.get_token_pairs = AsyncMock(return_value=_QUERY_PAIRS)
        dex.get_token_pairs_with_fallback = AsyncMock(return_value=_QUERY_PAIRS)
        dex.search_tokens = AsyncMock(return_value=[])
        dex.search_tokens_with_fallback = AsyncMock(return_value=[])
        dex.pairs_to_metadata = _make_dex_client().pairs_to_metadata
        dex.pairs_to_search_results = _make_dex_client().pairs_to_search_results

        rpc = AsyncMock()
        rpc.get_deployer_and_timestamp = AsyncMock(return_value=("Deployer", datetime(2024, 1, 1, tzinfo=timezone.utc)))
        rpc.get_asset = AsyncMock(return_value={})
        rpc.search_assets_by_creator = AsyncMock(return_value=[])

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
               patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
               _patch_fast_detect_lineage_background_work():

            result = await detect_lineage("QueryMint1234567890123456789012345678")

        assert result.family_size == 1
        assert result.confidence == 1.0
        assert result.derivatives == []

    @pytest.mark.asyncio
    async def test_result_is_cached(self):
        """Second call should hit the cache."""
        dex = _make_dex_client()
        rpc = _make_rpc_client()

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
             patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
               patch("lineage_agent.lineage_detector.compute_image_similarity", new_callable=AsyncMock, return_value=0.9), \
               _patch_fast_detect_lineage_background_work():

            result1 = await detect_lineage("QueryMint1234567890123456789012345678")
            result2 = await detect_lineage("QueryMint1234567890123456789012345678")

        # DexScreener should only be called once
        assert dex.get_token_pairs_with_fallback.call_count == 1
        assert result1.mint == result2.mint

    @pytest.mark.asyncio
    async def test_detect_lineage_persists_pre_dex_extraction_rug(self, tmp_path):
        """Full pipeline should persist a pre-DEX extraction rug for launchpad tokens."""
        db_cache = SQLiteCache(db_path=str(tmp_path / "lineage_integration.db"), default_ttl=3600)
        old_cache = _clients.cache
        _clients.cache = db_cache

        query_mint = "QueryMoonshotMint12345678901234567890123"
        clone_mint = "CloneMoonshotMint12345678901234567890123"
        deployer = "DeployerMoonshotAAA"
        base_time = datetime(2024, 1, 1, tzinfo=timezone.utc)

        dex = AsyncMock()
        dex.get_token_pairs = AsyncMock(return_value=[])
        dex.get_token_pairs_with_fallback = AsyncMock(return_value=[])
        _search_results_1 = [
            {
                "chainId": "solana",
                "baseToken": {
                    "address": clone_mint,
                    "name": "Moon Runner",
                    "symbol": "MOON",
                },
                "info": {"imageUrl": "https://img.example.com/clone-moon.png"},
                "priceUsd": "0.0002",
                "marketCap": 90_000,
                "liquidity": {"usd": 8_000},
                "url": "",
            }
        ]
        dex.search_tokens = AsyncMock(return_value=_search_results_1)
        dex.search_tokens_with_fallback = AsyncMock(return_value=_search_results_1)
        real_dex = _make_dex_client()
        dex.pairs_to_metadata = real_dex.pairs_to_metadata
        dex.pairs_to_search_results = real_dex.pairs_to_search_results

        async def fake_deployer(mint: str):
            if mint == query_mint:
                return (deployer, base_time)
            if mint == clone_mint:
                return ("CloneDeployerBBB", base_time + timedelta(days=3))
            return ("", None)

        query_asset = {
            "content": {
                "metadata": {"name": "Moon Runner", "symbol": "MOON"},
                "links": {"image": "https://img.example.com/query-moon.png"},
                "json_uri": "https://meta.example.com/query-moon.json",
            },
            "authorities": [{"address": "MoonCVVNZFSYkqNXP6bxHLPL6QQJiMEfzPWlVMMf9Ly"}],
            "creators": [{"address": deployer, "verified": True}],
        }
        clone_asset = {
            "content": {
                "metadata": {"name": "Moon Runner", "symbol": "MOON"},
                "links": {"image": "https://img.example.com/clone-moon.png"},
                "json_uri": "https://meta.example.com/clone-moon.json",
            },
            "authorities": [],
            "creators": [{"address": "CloneDeployerBBB", "verified": True}],
        }

        rpc = AsyncMock()
        rpc.get_deployer_and_timestamp = AsyncMock(side_effect=fake_deployer)
        rpc.get_asset = AsyncMock(side_effect=lambda mint: query_asset if mint == query_mint else clone_asset)
        rpc.search_assets_by_creator = AsyncMock(return_value=[])

        jup = AsyncMock()
        jup.get_price = AsyncMock(return_value=None)

        bundle_report = BundleExtractionReport(
            mint=query_mint,
            deployer=deployer,
            overall_verdict="suspected_team_extraction",
        )
        sol_flow_report = SolFlowReport(
            mint=query_mint,
            deployer=deployer,
            total_extracted_sol=4.5,
            analysis_timestamp=base_time,
        )

        try:
            with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
                 patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
                 patch("lineage_agent.lineage_detector._get_jup_client", return_value=jup), \
                 patch("lineage_agent.lineage_detector.compute_image_similarity", new_callable=AsyncMock, return_value=1.0), \
                 patch("lineage_agent.lineage_detector.compute_death_clock", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.build_operator_fingerprint", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.analyze_factory_rhythm", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.compute_deployer_profile", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.get_sol_flow_report", new_callable=AsyncMock, return_value=sol_flow_report), \
                 patch("lineage_agent.lineage_detector.trace_sol_flow", new_callable=AsyncMock, return_value=sol_flow_report), \
                 patch("lineage_agent.lineage_detector.build_cartel_edges_for_deployer", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.compute_cartel_report", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.analyze_insider_sell", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.analyze_bundle", new_callable=AsyncMock, return_value=bundle_report), \
                 patch("lineage_agent.lineage_detector.detect_resurrection", return_value=None), \
                 patch("lineage_agent.lineage_detector.analyze_liquidity_architecture", return_value=None), \
                 patch("lineage_agent.lineage_detector._bootstrap_deployer_history", new_callable=AsyncMock, return_value=None):
                result = await detect_lineage(query_mint, force_refresh=True)

            rugged_rows = await db_cache.query_events(
                where="event_type = 'token_rugged' AND mint = ?",
                params=(query_mint,),
            )

            assert result.query_token is not None
            assert result.query_token.launch_platform == "moonshot"
            assert result.query_token.lifecycle_stage.value == "launchpad_curve_only"
            assert result.bundle_report is not None
            assert result.sol_flow is not None
            assert len(rugged_rows) == 1
            assert rugged_rows[0]["rug_mechanism"] == RugMechanism.PRE_DEX_EXTRACTION_RUG.value
            assert rugged_rows[0]["evidence_level"] == EvidenceLevel.MODERATE.value
            assert set(json.loads(rugged_rows[0]["reason_codes"])) >= {
                "launchpad_authority_matched",
                "bundle_suspected_team_extraction",
                "sol_flow_extraction_detected",
            }
        finally:
            _clients.cache = old_cache
            await db_cache.close()

    @pytest.mark.asyncio
    async def test_detect_lineage_persists_sol_flow_only_pre_dex_extraction_rug(self, tmp_path):
        """Pre-DEX launchpad tokens should persist a sol-flow-only extraction rug without bundle proof."""
        db_cache = SQLiteCache(db_path=str(tmp_path / "lineage_integration_sol_only.db"), default_ttl=3600)
        old_cache = _clients.cache
        _clients.cache = db_cache

        query_mint = "QueryMoonshotSolOnly12345678901234567890"
        clone_mint = "CloneMoonshotSolOnly12345678901234567890"
        deployer = "DeployerMoonshotSOL"
        base_time = datetime(2024, 2, 1, tzinfo=timezone.utc)

        dex = AsyncMock()
        dex.get_token_pairs = AsyncMock(return_value=[])
        dex.get_token_pairs_with_fallback = AsyncMock(return_value=[])
        _search_results_2 = [
            {
                "chainId": "solana",
                "baseToken": {
                    "address": clone_mint,
                    "name": "Moon Solo",
                    "symbol": "MSOLO",
                },
                "info": {"imageUrl": "https://img.example.com/clone-solo.png"},
                "priceUsd": "0.0001",
                "marketCap": 50_000,
                "liquidity": {"usd": 4_000},
                "url": "",
            }
        ]
        dex.search_tokens = AsyncMock(return_value=_search_results_2)
        dex.search_tokens_with_fallback = AsyncMock(return_value=_search_results_2)
        real_dex = _make_dex_client()
        dex.pairs_to_metadata = real_dex.pairs_to_metadata
        dex.pairs_to_search_results = real_dex.pairs_to_search_results

        async def fake_deployer(mint: str):
            if mint == query_mint:
                return (deployer, base_time)
            if mint == clone_mint:
                return ("CloneSoloDeployer", base_time + timedelta(days=2))
            return ("", None)

        query_asset = {
            "content": {
                "metadata": {"name": "Moon Solo", "symbol": "MSOLO"},
                "links": {"image": "https://img.example.com/query-solo.png"},
                "json_uri": "https://meta.example.com/query-solo.json",
            },
            "authorities": [{"address": "MoonCVVNZFSYkqNXP6bxHLPL6QQJiMEfzPWlVMMf9Ly"}],
            "creators": [{"address": deployer, "verified": True}],
        }
        clone_asset = {
            "content": {
                "metadata": {"name": "Moon Solo", "symbol": "MSOLO"},
                "links": {"image": "https://img.example.com/clone-solo.png"},
                "json_uri": "https://meta.example.com/clone-solo.json",
            },
            "authorities": [],
            "creators": [{"address": "CloneSoloDeployer", "verified": True}],
        }

        rpc = AsyncMock()
        rpc.get_deployer_and_timestamp = AsyncMock(side_effect=fake_deployer)
        rpc.get_asset = AsyncMock(side_effect=lambda mint: query_asset if mint == query_mint else clone_asset)
        rpc.search_assets_by_creator = AsyncMock(return_value=[])

        jup = AsyncMock()
        jup.get_price = AsyncMock(return_value=None)
        sol_flow_report = SolFlowReport(
            mint=query_mint,
            deployer=deployer,
            total_extracted_sol=2.75,
            extraction_context="confirmed_extraction",
            analysis_timestamp=base_time,
        )

        try:
            with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
                 patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
                 patch("lineage_agent.lineage_detector._get_jup_client", return_value=jup), \
                 patch("lineage_agent.lineage_detector.compute_image_similarity", new_callable=AsyncMock, return_value=1.0), \
                 patch("lineage_agent.lineage_detector.compute_death_clock", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.build_operator_fingerprint", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.analyze_factory_rhythm", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.compute_deployer_profile", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.get_sol_flow_report", new_callable=AsyncMock, return_value=sol_flow_report), \
                 patch("lineage_agent.lineage_detector.trace_sol_flow", new_callable=AsyncMock, return_value=sol_flow_report), \
                 patch("lineage_agent.lineage_detector.build_cartel_edges_for_deployer", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.compute_cartel_report", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.analyze_insider_sell", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.analyze_bundle", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.detect_resurrection", return_value=None), \
                 patch("lineage_agent.lineage_detector.analyze_liquidity_architecture", return_value=None), \
                 patch("lineage_agent.lineage_detector._bootstrap_deployer_history", new_callable=AsyncMock, return_value=None):
                await detect_lineage(query_mint, force_refresh=True)

            rugged_rows = await db_cache.query_events(
                where="event_type = 'token_rugged' AND mint = ?",
                params=(query_mint,),
            )

            assert len(rugged_rows) == 1
            assert rugged_rows[0]["rug_mechanism"] == RugMechanism.PRE_DEX_EXTRACTION_RUG.value
            assert rugged_rows[0]["evidence_level"] == EvidenceLevel.WEAK.value
            assert set(json.loads(rugged_rows[0]["reason_codes"])) >= {
                "launchpad_authority_matched",
                "sol_flow_only_extraction_detected",
                "team_link_unproven",
            }
        finally:
            _clients.cache = old_cache
            await db_cache.close()

    @pytest.mark.asyncio
    async def test_detect_lineage_dex_context_never_persists_pre_dex_extraction_rug(self, tmp_path):
        """DEX-listed tokens must never be retyped as pre-DEX extraction rugs."""
        db_cache = SQLiteCache(db_path=str(tmp_path / "lineage_integration_dex_guard.db"), default_ttl=3600)
        old_cache = _clients.cache
        _clients.cache = db_cache

        query_mint = "QueryDexGuardMint123456789012345678901"
        clone_mint = "CloneDexGuardMint123456789012345678901"
        deployer = "DeployerDexGuardAAA"
        base_time = datetime(2024, 3, 1, tzinfo=timezone.utc)
        dex_pairs = [
            {
                "chainId": "solana",
                "baseToken": {
                    "address": query_mint,
                    "name": "Dex Runner",
                    "symbol": "DEXR",
                },
                "info": {"imageUrl": "https://img.example.com/dexr.png"},
                "priceUsd": "0.002",
                "marketCap": 250_000,
                "liquidity": {"usd": 40_000},
                "url": "https://dex.example.com/dexr",
            }
        ]

        dex = AsyncMock()
        dex.get_token_pairs = AsyncMock(return_value=dex_pairs)
        dex.get_token_pairs_with_fallback = AsyncMock(return_value=dex_pairs)
        _search_results_3 = [
            {
                "chainId": "solana",
                "baseToken": {
                    "address": clone_mint,
                    "name": "Dex Runner",
                    "symbol": "DEXR",
                },
                "info": {"imageUrl": "https://img.example.com/dexr-clone.png"},
                "priceUsd": "0.001",
                "marketCap": 75_000,
                "liquidity": {"usd": 5_000},
                "url": "",
            }
        ]
        dex.search_tokens = AsyncMock(return_value=_search_results_3)
        dex.search_tokens_with_fallback = AsyncMock(return_value=_search_results_3)
        real_dex = _make_dex_client()
        dex.pairs_to_metadata = real_dex.pairs_to_metadata
        dex.pairs_to_search_results = real_dex.pairs_to_search_results

        async def fake_deployer(mint: str):
            if mint == query_mint:
                return (deployer, base_time)
            if mint == clone_mint:
                return ("CloneDexGuardBBB", base_time + timedelta(days=5))
            return ("", None)

        query_asset = {
            "content": {
                "metadata": {"name": "Dex Runner", "symbol": "DEXR"},
                "links": {"image": "https://img.example.com/dexr.png"},
                "json_uri": "https://meta.example.com/dexr.json",
            },
            "authorities": [{"address": "MoonCVVNZFSYkqNXP6bxHLPL6QQJiMEfzPWlVMMf9Ly"}],
            "creators": [{"address": deployer, "verified": True}],
        }
        clone_asset = {
            "content": {
                "metadata": {"name": "Dex Runner", "symbol": "DEXR"},
                "links": {"image": "https://img.example.com/dexr-clone.png"},
                "json_uri": "https://meta.example.com/dexr-clone.json",
            },
            "authorities": [],
            "creators": [{"address": "CloneDexGuardBBB", "verified": True}],
        }

        rpc = AsyncMock()
        rpc.get_deployer_and_timestamp = AsyncMock(side_effect=fake_deployer)
        rpc.get_asset = AsyncMock(side_effect=lambda mint: query_asset if mint == query_mint else clone_asset)
        rpc.search_assets_by_creator = AsyncMock(return_value=[])

        jup = AsyncMock()
        jup.get_price = AsyncMock(return_value=None)
        bundle_report = BundleExtractionReport(
            mint=query_mint,
            deployer=deployer,
            overall_verdict="suspected_team_extraction",
        )
        sol_flow_report = SolFlowReport(
            mint=query_mint,
            deployer=deployer,
            total_extracted_sol=5.0,
            analysis_timestamp=base_time,
        )

        try:
            with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
                 patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
                 patch("lineage_agent.lineage_detector._get_jup_client", return_value=jup), \
                 patch("lineage_agent.lineage_detector.compute_image_similarity", new_callable=AsyncMock, return_value=1.0), \
                 patch("lineage_agent.lineage_detector.compute_death_clock", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.build_operator_fingerprint", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.analyze_factory_rhythm", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.compute_deployer_profile", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.get_sol_flow_report", new_callable=AsyncMock, return_value=sol_flow_report), \
                 patch("lineage_agent.lineage_detector.trace_sol_flow", new_callable=AsyncMock, return_value=sol_flow_report), \
                 patch("lineage_agent.lineage_detector.build_cartel_edges_for_deployer", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.compute_cartel_report", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.analyze_insider_sell", new_callable=AsyncMock, return_value=None), \
                 patch("lineage_agent.lineage_detector.analyze_bundle", new_callable=AsyncMock, return_value=bundle_report), \
                 patch("lineage_agent.lineage_detector.detect_resurrection", return_value=None), \
                 patch("lineage_agent.lineage_detector.analyze_liquidity_architecture", return_value=None), \
                 patch("lineage_agent.lineage_detector._bootstrap_deployer_history", new_callable=AsyncMock, return_value=None):
                result = await detect_lineage(query_mint, force_refresh=True)

            rugged_rows = await db_cache.query_events(
                where="event_type = 'token_rugged' AND mint = ?",
                params=(query_mint,),
            )

            assert result.query_token is not None
            assert result.query_token.lifecycle_stage.value == "dex_listed"
            assert result.query_token.market_surface.value == "dex_pool_observed"
            assert rugged_rows == []
        finally:
            _clients.cache = old_cache
            await db_cache.close()


class TestSearchTokensIntegration:

    @pytest.mark.asyncio
    async def test_search_returns_results(self):
        dex = _make_dex_client()

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex):
            results = await search_tokens("doge")

        # Should have solana tokens only (ethereum filtered)
        assert len(results) >= 1
        assert all(r.mint for r in results)

    @pytest.mark.asyncio
    async def test_search_is_cached(self):
        dex = _make_dex_client()

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex):
            r1 = await search_tokens("doge")
            r2 = await search_tokens("doge")

        assert dex.search_tokens_with_fallback.call_count == 1
        assert r1 == r2


# ---------------------------------------------------------------------------
# Tests for force-refresh + scanned_at (introduced in PR: stale cache fix)
# ---------------------------------------------------------------------------

class TestScannedAt:
    """detect_lineage() stamps scanned_at on every computed result."""

    @pytest.mark.asyncio
    async def test_scanned_at_set_on_full_flow(self):
        """scanned_at is a UTC datetime, set during the full analysis path."""
        dex = _make_dex_client()
        rpc = _make_rpc_client()

        before = datetime.now(timezone.utc)
        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
             patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
               patch("lineage_agent.lineage_detector.compute_image_similarity", new_callable=AsyncMock, return_value=0.9), \
               _patch_fast_detect_lineage_background_work():
            result = await detect_lineage("QueryMint1234567890123456789012345678")
        after = datetime.now(timezone.utc)

        assert result.scanned_at is not None
        assert result.scanned_at.tzinfo is not None  # timezone-aware
        assert before <= result.scanned_at <= after

    @pytest.mark.asyncio
    async def test_scanned_at_set_on_no_candidates_path(self):
        """scanned_at is set even when no candidate clones are found."""
        dex = AsyncMock()
        dex.get_token_pairs = AsyncMock(return_value=_QUERY_PAIRS)
        dex.get_token_pairs_with_fallback = AsyncMock(return_value=_QUERY_PAIRS)
        dex.search_tokens = AsyncMock(return_value=[])  # no candidates
        dex.search_tokens_with_fallback = AsyncMock(return_value=[])
        dex.pairs_to_metadata = _make_dex_client().pairs_to_metadata
        dex.pairs_to_search_results = _make_dex_client().pairs_to_search_results

        rpc = AsyncMock()
        rpc.get_deployer_and_timestamp = AsyncMock(
            return_value=("Deployer", datetime(2024, 1, 1, tzinfo=timezone.utc))
        )
        rpc.get_asset = AsyncMock(return_value={})
        rpc.search_assets_by_creator = AsyncMock(return_value=[])

        before = datetime.now(timezone.utc)
        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
               patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
               _patch_fast_detect_lineage_background_work():
            result = await detect_lineage("QueryMint1234567890123456789012345678")
        after = datetime.now(timezone.utc)

        assert result.family_size == 1
        assert result.scanned_at is not None
        assert before <= result.scanned_at <= after

    @pytest.mark.asyncio
    async def test_scanned_at_preserved_from_cache(self):
        """Cached result keeps the original scanned_at; it is not re-stamped."""
        dex = _make_dex_client()
        rpc = _make_rpc_client()

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
             patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
               patch("lineage_agent.lineage_detector.compute_image_similarity", new_callable=AsyncMock, return_value=0.9), \
               _patch_fast_detect_lineage_background_work():
            result1 = await detect_lineage("QueryMint1234567890123456789012345678")
            result2 = await detect_lineage("QueryMint1234567890123456789012345678")  # cache hit

        # Both calls must reference the same original scanned_at
        assert result1.scanned_at == result2.scanned_at
        # DexScreener called only once (second call was from cache)
        assert dex.get_token_pairs_with_fallback.call_count == 1


class TestForceRefresh:
    """force_refresh=True busts the lineage + RPC caches and re-runs analysis."""

    @pytest.mark.asyncio
    async def test_force_refresh_bypasses_cache(self):
        """With force_refresh the backend re-fetches even if cache is warm."""
        dex = _make_dex_client()
        rpc = _make_rpc_client()

        patches = dict(
            lineage_detector___get_dex_client=patch(
                "lineage_agent.lineage_detector._get_dex_client", return_value=dex
            ),
            lineage_detector___get_rpc_client=patch(
                "lineage_agent.lineage_detector._get_rpc_client", return_value=rpc
            ),
            image_sim=patch(
                "lineage_agent.lineage_detector.compute_image_similarity",
                new_callable=AsyncMock, return_value=0.9,
            ),
        )
        with patches["lineage_detector___get_dex_client"], \
             patches["lineage_detector___get_rpc_client"], \
               patches["image_sim"], \
               _patch_fast_detect_lineage_background_work():
            # First call — populates cache
            await detect_lineage("QueryMint1234567890123456789012345678")
            first_call_count = dex.get_token_pairs_with_fallback.call_count

            # Second call WITHOUT force_refresh — should be cache hit
            await detect_lineage("QueryMint1234567890123456789012345678")
            assert dex.get_token_pairs_with_fallback.call_count == first_call_count  # no extra call

            # Third call WITH force_refresh — must re-fetch
            await detect_lineage("QueryMint1234567890123456789012345678", force_refresh=True)
            assert dex.get_token_pairs_with_fallback.call_count == first_call_count + 1

    @pytest.mark.asyncio
    async def test_force_refresh_updates_scanned_at(self):
        """force_refresh should yield a fresh scanned_at later than the original."""
        import asyncio as _asyncio

        dex = _make_dex_client()
        rpc = _make_rpc_client()

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
             patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
               patch("lineage_agent.lineage_detector.compute_image_similarity", new_callable=AsyncMock, return_value=0.9), \
               _patch_fast_detect_lineage_background_work():
            result1 = await detect_lineage("QueryMint1234567890123456789012345678")
            await _asyncio.sleep(0.01)  # ensure wall clock advances
            result2 = await detect_lineage(
                "QueryMint1234567890123456789012345678", force_refresh=True
            )

        assert result2.scanned_at is not None
        assert result1.scanned_at is not None
        assert result2.scanned_at >= result1.scanned_at

