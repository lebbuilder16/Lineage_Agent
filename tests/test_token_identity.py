"""Unit tests for lineage_agent.token_identity.

Covers:
- TokenIdentity dataclass defaults and field assignment
- resolve_token_identity: DexScreener + DAS + Jupiter enrichment paths
- Force-refresh cache clearing
- Error handling for each concurrent enrichment step
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lineage_agent.token_identity import TokenIdentity, resolve_token_identity


# ---------------------------------------------------------------------------
# TokenIdentity dataclass
# ---------------------------------------------------------------------------

class TestTokenIdentityDataclass:
    def test_minimal_defaults(self):
        ti = TokenIdentity(mint="abc123")
        assert ti.mint == "abc123"
        assert ti.name == ""
        assert ti.symbol == ""
        assert ti.deployer == ""
        assert ti.created_at is None
        assert ti.pairs == []
        assert ti.das_asset == {}
        assert ti.reason_codes == []

    def test_full_fields(self):
        now = datetime.now(tz=timezone.utc)
        ti = TokenIdentity(
            mint="abc",
            name="TestToken",
            symbol="TT",
            deployer="DEP123",
            created_at=now,
            price_usd=0.001,
            market_cap_usd=50000,
            liquidity_usd=10000,
            launch_platform="pumpfun",
            pairs=[{"pair": "data"}],
        )
        assert ti.name == "TestToken"
        assert ti.deployer == "DEP123"
        assert ti.price_usd == 0.001
        assert ti.launch_platform == "pumpfun"
        assert len(ti.pairs) == 1


# ---------------------------------------------------------------------------
# resolve_token_identity — mock helpers
# ---------------------------------------------------------------------------

def _mock_query_meta(**overrides):
    """Build a minimal TokenMetadata mock."""
    meta = MagicMock()
    meta.name = overrides.get("name", "MockToken")
    meta.symbol = overrides.get("symbol", "MOCK")
    meta.deployer = overrides.get("deployer", "")
    meta.created_at = overrides.get("created_at", None)
    meta.image_uri = overrides.get("image_uri", "")
    meta.metadata_uri = overrides.get("metadata_uri", "")
    meta.price_usd = overrides.get("price_usd", None)
    meta.market_cap_usd = overrides.get("market_cap_usd", None)
    meta.liquidity_usd = overrides.get("liquidity_usd", None)
    meta.launch_platform = overrides.get("launch_platform", None)
    meta.lifecycle_stage = overrides.get("lifecycle_stage", None)
    meta.market_surface = overrides.get("market_surface", None)
    meta.evidence_level = overrides.get("evidence_level", None)
    meta.reason_codes = overrides.get("reason_codes", [])
    return meta


_CLASSIFY_DEFAULT = {
    "launch_platform": None,
    "lifecycle_stage": "unknown",
    "market_surface": "no_market_observed",
    "evidence_level": "none",
    "reason_codes": [],
}


@pytest.fixture
def mock_infra():
    """Set up all patches for resolve_token_identity.

    token_identity.py imports inside the function body with local aliases:
        from .data_sources._clients import cache_delete as _cache_delete, ...
        from .lineage_detector import _get_deployer_cached, ...

    We must patch at the SOURCE modules so the local imports pick up the mocks.
    """
    mock_dex = MagicMock()
    mock_dex.get_token_pairs_with_fallback = AsyncMock(return_value=[])
    mock_dex.pairs_to_metadata = MagicMock(return_value=_mock_query_meta())

    mock_rpc = MagicMock()
    mock_jup = MagicMock()
    mock_jup.get_price = AsyncMock(return_value=None)

    patches = [
        patch("lineage_agent.data_sources._clients.get_dex_client", return_value=mock_dex),
        patch("lineage_agent.data_sources._clients.get_rpc_client", return_value=mock_rpc),
        patch("lineage_agent.data_sources._clients.get_jup_client", return_value=mock_jup),
        patch("lineage_agent.data_sources._clients.cache_delete", new_callable=AsyncMock),
        patch("lineage_agent.data_sources._clients.cache_get", new_callable=AsyncMock, return_value=None),
        patch("lineage_agent.lineage_detector._get_deployer_cached",
              new_callable=AsyncMock, return_value=("DEP_ADDR", None)),
        patch("lineage_agent.lineage_detector._get_asset_cached",
              new_callable=AsyncMock, return_value={}),
        patch("lineage_agent.lineage_detector.classify_market_context",
              return_value=_CLASSIFY_DEFAULT),
    ]

    started = [p.start() for p in patches]
    yield {
        "dex": mock_dex,
        "rpc": mock_rpc,
        "jup": mock_jup,
        "patches": patches,
    }
    for p in patches:
        p.stop()


# ---------------------------------------------------------------------------
# resolve_token_identity — integration tests
# ---------------------------------------------------------------------------

class TestResolveTokenIdentity:
    async def test_basic_resolution(self, mock_infra):
        """Resolves name/symbol from DexScreener pairs."""
        mock_infra["dex"].pairs_to_metadata.return_value = _mock_query_meta(
            name="Bonk", symbol="BONK",
        )

        result = await resolve_token_identity("MINT_ABC")

        assert result.mint == "MINT_ABC"
        assert result.name == "Bonk"
        assert result.symbol == "BONK"
        assert result.deployer == "DEP_ADDR"

    async def test_deployer_exception_handled(self, mock_infra):
        """If deployer resolution fails, deployer stays empty."""
        mock_infra["dex"].pairs_to_metadata.return_value = _mock_query_meta(
            name="Token", symbol="TKN", deployer="",
        )

        with patch(
            "lineage_agent.lineage_detector._get_deployer_cached",
            new_callable=AsyncMock,
            side_effect=RuntimeError("RPC error"),
        ):
            result = await resolve_token_identity("MINT_FAIL")

        assert result.deployer == ""
        assert result.name == "Token"

    async def test_das_enrichment(self, mock_infra):
        """DAS fills in name/symbol when DexScreener has none."""
        mock_infra["dex"].pairs_to_metadata.return_value = _mock_query_meta(
            name="", symbol="", deployer="",
        )

        das = {
            "content": {
                "metadata": {"name": "DAS_Token", "symbol": "DAS"},
                "json_uri": "https://arweave.net/xxx",
                "links": {"image": "https://img.example.com/logo.png"},
            },
            "creators": [{"address": "DAS_DEPLOYER", "verified": True}],
        }

        with (
            patch("lineage_agent.lineage_detector._get_deployer_cached",
                  new_callable=AsyncMock, side_effect=RuntimeError("fail")),
            patch("lineage_agent.lineage_detector._get_asset_cached",
                  new_callable=AsyncMock, return_value=das),
        ):
            result = await resolve_token_identity("MINT_DAS")

        assert result.name == "DAS_Token"
        assert result.symbol == "DAS"
        assert result.deployer == "DAS_DEPLOYER"
        assert result.image_uri == "https://img.example.com/logo.png"
        assert result.metadata_uri == "https://arweave.net/xxx"

    async def test_jupiter_price_fallback(self, mock_infra):
        """Jupiter price fills in when DexScreener has no price."""
        mock_infra["dex"].pairs_to_metadata.return_value = _mock_query_meta(price_usd=None)
        mock_infra["jup"].get_price = AsyncMock(return_value=0.00123)

        result = await resolve_token_identity("MINT_JUP")
        assert result.price_usd == 0.00123

    async def test_jupiter_price_not_override_dexscreener(self, mock_infra):
        """When DexScreener already has price, Jupiter doesn't override."""
        mock_infra["dex"].pairs_to_metadata.return_value = _mock_query_meta(price_usd=0.005)
        mock_infra["jup"].get_price = AsyncMock(return_value=0.00123)

        result = await resolve_token_identity("MINT_PRICE")
        assert result.price_usd == 0.005

    async def test_force_refresh_clears_caches(self, mock_infra):
        """force_refresh=True should call cache_delete for relevant keys."""
        mock_cache_delete = AsyncMock()
        with patch("lineage_agent.data_sources._clients.cache_delete", new=mock_cache_delete):
            await resolve_token_identity("MINT_REFRESH", force_refresh=True)

        assert mock_cache_delete.call_count >= 3

    async def test_all_enrichments_fail_gracefully(self, mock_infra):
        """All 3 concurrent fetches fail → still returns a valid TokenIdentity."""
        mock_infra["dex"].pairs_to_metadata.return_value = _mock_query_meta(
            name="Fallback", symbol="FB",
        )
        mock_infra["jup"].get_price = AsyncMock(side_effect=RuntimeError("fail"))

        with (
            patch("lineage_agent.lineage_detector._get_deployer_cached",
                  new_callable=AsyncMock, side_effect=RuntimeError("fail")),
            patch("lineage_agent.lineage_detector._get_asset_cached",
                  new_callable=AsyncMock, side_effect=RuntimeError("fail")),
        ):
            result = await resolve_token_identity("MINT_ALL_FAIL")

        assert result.mint == "MINT_ALL_FAIL"
        assert result.name == "Fallback"

    async def test_created_at_from_deployer_resolution(self, mock_infra):
        """Deployer resolution returns created_at → applied to identity."""
        ts = datetime(2024, 6, 15, 10, 0, 0, tzinfo=timezone.utc)
        mock_infra["dex"].pairs_to_metadata.return_value = _mock_query_meta(created_at=None)

        with patch(
            "lineage_agent.lineage_detector._get_deployer_cached",
            new_callable=AsyncMock,
            return_value=("DEP_X", ts),
        ):
            result = await resolve_token_identity("MINT_TS")

        assert result.created_at == ts
        assert result.deployer == "DEP_X"
