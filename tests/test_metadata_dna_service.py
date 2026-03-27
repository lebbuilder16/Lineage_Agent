"""Tests for lineage_agent.metadata_dna_service."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# _is_confirmed_linked_wallet_rug
# ---------------------------------------------------------------------------

class TestIsConfirmedLinkedWalletRug:
    def test_empty_mechanism_returns_true(self):
        from lineage_agent.metadata_dna_service import _is_confirmed_linked_wallet_rug
        assert _is_confirmed_linked_wallet_rug({}) is True

    def test_unconfirmed_mechanism_returns_false(self):
        from lineage_agent.metadata_dna_service import _is_confirmed_linked_wallet_rug
        row = {"rug_mechanism": "unknown_mechanism", "evidence_level": "strong"}
        assert _is_confirmed_linked_wallet_rug(row) is False

    def test_dex_rug_with_strong_evidence_returns_true(self):
        from lineage_agent.metadata_dna_service import _is_confirmed_linked_wallet_rug
        row = {"rug_mechanism": "dex_liquidity_rug", "evidence_level": "strong"}
        assert _is_confirmed_linked_wallet_rug(row) is True

    def test_dex_rug_with_moderate_evidence_returns_true(self):
        from lineage_agent.metadata_dna_service import _is_confirmed_linked_wallet_rug
        row = {"rug_mechanism": "dex_liquidity_rug", "evidence_level": "moderate"}
        assert _is_confirmed_linked_wallet_rug(row) is True

    def test_dex_rug_with_weak_evidence_returns_false(self):
        from lineage_agent.metadata_dna_service import _is_confirmed_linked_wallet_rug
        row = {"rug_mechanism": "dex_liquidity_rug", "evidence_level": "weak"}
        assert _is_confirmed_linked_wallet_rug(row) is False

    def test_dex_rug_with_no_evidence_returns_true(self):
        from lineage_agent.metadata_dna_service import _is_confirmed_linked_wallet_rug
        # Empty evidence_level => returns True (we don't know, assume rugged)
        row = {"rug_mechanism": "dex_liquidity_rug", "evidence_level": ""}
        assert _is_confirmed_linked_wallet_rug(row) is True

    def test_pre_dex_rug_mechanism_returns_true(self):
        from lineage_agent.metadata_dna_service import _is_confirmed_linked_wallet_rug
        row = {"rug_mechanism": "pre_dex_extraction_rug", "evidence_level": "strong"}
        assert _is_confirmed_linked_wallet_rug(row) is True

    def test_none_values_treated_as_empty_string(self):
        from lineage_agent.metadata_dna_service import _is_confirmed_linked_wallet_rug
        row = {"rug_mechanism": None, "evidence_level": None}
        assert _is_confirmed_linked_wallet_rug(row) is True


# ---------------------------------------------------------------------------
# _detect_service
# ---------------------------------------------------------------------------

class TestDetectService:
    def test_arweave_uri(self):
        from lineage_agent.metadata_dna_service import _detect_service
        assert _detect_service("https://arweave.net/abc123") == "arweave"

    def test_ipfs_uri(self):
        from lineage_agent.metadata_dna_service import _detect_service
        assert _detect_service("https://ipfs.io/ipfs/QmABC") == "ipfs"

    def test_cloudflare_uri(self):
        from lineage_agent.metadata_dna_service import _detect_service
        assert _detect_service("https://cloudflare-ipfs.com/ipfs/QmXYZ") == "cloudflare"

    def test_pumpfun_uri(self):
        from lineage_agent.metadata_dna_service import _detect_service
        assert _detect_service("https://pump.fun/token/metadata") == "pumpfun"

    def test_unknown_uri(self):
        from lineage_agent.metadata_dna_service import _detect_service
        assert _detect_service("https://example.com/metadata.json") == "other"

    def test_pinata_uri(self):
        from lineage_agent.metadata_dna_service import _detect_service
        assert _detect_service("https://gateway.pinata.cloud/ipfs/QmABC") == "pinata"


# ---------------------------------------------------------------------------
# _normalise_uri
# ---------------------------------------------------------------------------

class TestNormaliseUri:
    def test_http_passthrough(self):
        from lineage_agent.metadata_dna_service import _normalise_uri
        uri = "https://example.com/meta.json"
        assert _normalise_uri(uri) == uri

    def test_ipfs_scheme(self):
        from lineage_agent.metadata_dna_service import _normalise_uri
        result = _normalise_uri("ipfs://QmABC123")
        assert "ipfs.io/ipfs/" in result
        assert "QmABC123" in result

    def test_arweave_scheme(self):
        from lineage_agent.metadata_dna_service import _normalise_uri
        result = _normalise_uri("ar://TXID123456")
        assert "arweave.net" in result
        assert "TXID123456" in result

    def test_bare_arweave_tx_id(self):
        from lineage_agent.metadata_dna_service import _normalise_uri
        # 43-char base64url string
        tx_id = "A" * 43
        result = _normalise_uri(tx_id)
        assert result is not None
        assert "arweave.net" in result

    def test_pumpfun_without_http(self):
        from lineage_agent.metadata_dna_service import _normalise_uri
        result = _normalise_uri("pump.fun/coin/MINT/metadata")
        assert result is not None
        assert result.startswith("https://")

    def test_unknown_uri_returns_none(self):
        from lineage_agent.metadata_dna_service import _normalise_uri
        assert _normalise_uri("completely_invalid") is None

    def test_strips_whitespace(self):
        from lineage_agent.metadata_dna_service import _normalise_uri
        uri = "  https://example.com/meta.json  "
        result = _normalise_uri(uri)
        assert result == "https://example.com/meta.json"


# ---------------------------------------------------------------------------
# build_operator_fingerprint
# ---------------------------------------------------------------------------

class TestBuildOperatorFingerprint:
    async def test_returns_none_for_empty_list(self):
        from lineage_agent.metadata_dna_service import build_operator_fingerprint
        result = await build_operator_fingerprint([])
        assert result is None

    async def test_returns_none_for_single_entry(self):
        from lineage_agent.metadata_dna_service import build_operator_fingerprint
        result = await build_operator_fingerprint([
            ("MINT1111111111111111111", "DEPLOYER111111111111111", "https://example.com/meta.json")
        ])
        assert result is None

    async def test_returns_none_for_empty_deployers(self):
        from lineage_agent.metadata_dna_service import build_operator_fingerprint
        result = await build_operator_fingerprint([
            ("MINT1", "", "https://example.com/meta.json"),
            ("MINT2", "", "https://example.com/meta2.json"),
        ])
        assert result is None

    async def test_returns_none_when_fingerprints_differ(self):
        """Two deployers with different metadata → different fingerprints → None."""
        from lineage_agent.metadata_dna_service import build_operator_fingerprint

        async def fake_fp(mint, uri):
            # Return different fingerprints for different URIs
            return (f"fp_{mint}", "desc")

        with patch("lineage_agent.metadata_dna_service._get_fingerprint", side_effect=fake_fp):
            with patch("lineage_agent.metadata_dna_service.operator_mapping_upsert", AsyncMock()):
                result = await build_operator_fingerprint([
                    ("MINT1111111111111111111", "DEPLOYER111111111111111", "https://ex.com/1.json"),
                    ("MINT2222222222222222222", "DEPLOYER222222222222222", "https://ex.com/2.json"),
                ])
        assert result is None

    async def test_returns_fingerprint_when_deployers_share_metadata(self):
        """Two deployers sharing the same fingerprint → OperatorFingerprint returned."""
        from lineage_agent.metadata_dna_service import build_operator_fingerprint

        shared_fp = "abc123shared"

        async def fake_fp(mint, uri):
            return (shared_fp, "buy our token on discord.gg/shared")

        with patch("lineage_agent.metadata_dna_service._get_fingerprint", side_effect=fake_fp):
            with patch("lineage_agent.metadata_dna_service.operator_mapping_upsert", AsyncMock()):
                with patch("lineage_agent.metadata_dna_service._fetch_linked_wallet_tokens",
                           AsyncMock(return_value={})):
                    result = await build_operator_fingerprint([
                        ("MINT1111111111111111111", "DEPLOY1111111111111111", "https://ex.com/1.json"),
                        ("MINT2222222222222222222", "DEPLOY2222222222222222", "https://ex.com/2.json"),
                    ])

        assert result is not None
        assert result.fingerprint == shared_fp
        assert len(result.linked_wallets) == 2

    async def test_filters_out_system_addresses(self):
        """System program addresses are filtered before fingerprint processing."""
        from lineage_agent.metadata_dna_service import build_operator_fingerprint

        system_addr = "11111111111111111111111111111111"  # In _SYSTEM_ADDRESSES

        result = await build_operator_fingerprint([
            ("MINT1", system_addr, "https://ex.com/1.json"),
            ("MINT2", system_addr, "https://ex.com/2.json"),
        ])
        # After filtering system addresses, < 2 valid entries → None
        assert result is None


# ---------------------------------------------------------------------------
# _get_fingerprint
# ---------------------------------------------------------------------------

class TestGetFingerprint:
    async def test_returns_none_for_empty_uri(self):
        from lineage_agent.metadata_dna_service import _get_fingerprint
        result = await _get_fingerprint("MINT123", "")
        assert result is None

    async def test_returns_cached_value(self):
        from lineage_agent.metadata_dna_service import _get_fingerprint

        # Cache contains valid "fp|desc" format
        with patch("lineage_agent.metadata_dna_service.cache_get",
                   AsyncMock(return_value="myfp|mydesc|")):
            result = await _get_fingerprint("MINT123", "https://example.com/meta.json")

        assert result is not None
        assert result[0] == "myfp"
        assert result[1] == "mydesc"

    async def test_returns_none_when_fetch_fails(self):
        from lineage_agent.metadata_dna_service import _get_fingerprint

        import httpx

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("timeout"))

        with patch("lineage_agent.metadata_dna_service.cache_get", AsyncMock(return_value=None)):
            with patch("lineage_agent.metadata_dna_service.get_img_client", return_value=mock_client):
                result = await _get_fingerprint("MINT123", "https://example.com/meta.json")

        assert result is None

    async def test_returns_none_for_empty_description(self):
        from lineage_agent.metadata_dna_service import _get_fingerprint

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value={"description": ""})

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("lineage_agent.metadata_dna_service.cache_get", AsyncMock(return_value=None)):
            with patch("lineage_agent.metadata_dna_service.get_img_client", return_value=mock_client):
                with patch("lineage_agent.metadata_dna_service.cache_set", AsyncMock()):
                    result = await _get_fingerprint("MINT123", "https://example.com/meta.json")

        assert result is None

    async def test_computes_fingerprint_from_description(self):
        from lineage_agent.metadata_dna_service import _get_fingerprint

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value={
            "description": "Buy our amazing token and get rich"
        })

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("lineage_agent.metadata_dna_service.cache_get", AsyncMock(return_value=None)):
            with patch("lineage_agent.metadata_dna_service.get_img_client", return_value=mock_client):
                with patch("lineage_agent.metadata_dna_service.cache_set", AsyncMock()):
                    result = await _get_fingerprint("MINT123", "https://example.com/meta.json")

        assert result is not None
        fp, desc = result
        assert len(fp) == 32  # sha256[:32]
        assert "buy" in desc.lower()

    async def test_uses_campaign_tags_for_fingerprint(self):
        from lineage_agent.metadata_dna_service import _get_fingerprint

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value={
            "description": "Join our Discord at discord.gg/supersecret"
        })

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("lineage_agent.metadata_dna_service.cache_get", AsyncMock(return_value=None)):
            with patch("lineage_agent.metadata_dna_service.get_img_client", return_value=mock_client):
                with patch("lineage_agent.metadata_dna_service.cache_set", AsyncMock()):
                    result = await _get_fingerprint("MINT123", "https://arweave.net/abc")

        assert result is not None
        fp, desc = result
        assert len(fp) == 32


# ---------------------------------------------------------------------------
# _fetch_linked_wallet_tokens
# ---------------------------------------------------------------------------

class TestFetchLinkedWalletTokens:
    async def test_empty_wallets_returns_empty(self):
        from lineage_agent.metadata_dna_service import _fetch_linked_wallet_tokens
        result = await _fetch_linked_wallet_tokens([])
        assert result == {}

    async def test_skips_system_addresses(self):
        from lineage_agent.metadata_dna_service import _fetch_linked_wallet_tokens

        system_addr = "11111111111111111111111111111111"

        with patch("lineage_agent.metadata_dna_service.event_query", AsyncMock(return_value=[])):
            result = await _fetch_linked_wallet_tokens([system_addr])

        assert system_addr not in result

    async def test_fetches_tokens_for_wallet(self):
        from lineage_agent.metadata_dna_service import _fetch_linked_wallet_tokens

        wallet = "WALLET11111111111111111111111111111111111"
        mock_events = [
            {
                "mint": "MINT111111111111111111111111111111111111",
                "name": "TestToken",
                "symbol": "TT",
                "narrative": "meme",
                "mcap_usd": 50000.0,
                "created_at": "2024-01-01T00:00:00+00:00",
            }
        ]

        async def fake_event_query(**kwargs):
            where = kwargs.get("where", "")
            if "token_created" in where:
                return mock_events
            if "token_rugged" in where:
                return []
            return []

        with patch("lineage_agent.metadata_dna_service.event_query", side_effect=fake_event_query):
            with patch("lineage_agent.metadata_dna_service.normalize_legacy_rug_events", AsyncMock()):
                result = await _fetch_linked_wallet_tokens([wallet])

        assert wallet in result
        assert len(result[wallet]) == 1
        assert result[wallet][0].symbol == "TT"

    async def test_handles_query_exception(self):
        from lineage_agent.metadata_dna_service import _fetch_linked_wallet_tokens

        wallet = "ERRWALLET11111111111111111111111111111111"

        with patch("lineage_agent.metadata_dna_service.event_query",
                   AsyncMock(side_effect=Exception("DB error"))):
            result = await _fetch_linked_wallet_tokens([wallet])

        # Exception is swallowed, wallet not in result
        assert wallet not in result
