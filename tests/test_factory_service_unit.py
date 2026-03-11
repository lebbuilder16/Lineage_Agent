"""Focused unit tests for lineage_agent.factory_service."""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from lineage_agent.models import EvidenceLevel, LifecycleStage, MarketSurface, TokenMetadata


class TestRecordTokenCreation:
    async def test_records_token_with_phash_and_extra_json(self):
        from lineage_agent.factory_service import record_token_creation

        token = TokenMetadata(
            mint="mint-1",
            deployer="deployer-1",
            name="Pepe One",
            symbol="PEPE1",
            image_uri="https://example.com/image.png",
            created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
            market_cap_usd=1234.0,
            liquidity_usd=456.0,
            launch_platform="pumpfun",
            lifecycle_stage=LifecycleStage.DEX_LISTED,
            market_surface=MarketSurface.DEX_POOL_OBSERVED,
            reason_codes=["seeded"],
            evidence_level=EvidenceLevel.STRONG,
        )

        mock_insert = AsyncMock()

        with patch("lineage_agent.factory_service._compute_phash", AsyncMock(return_value="deadbeefcafebabe")):
            with patch("lineage_agent.factory_service.classify_narrative_llm", AsyncMock(return_value="meme")):
                with patch("lineage_agent.factory_service.event_insert", mock_insert):
                    await record_token_creation(token)

        kwargs = mock_insert.await_args.kwargs
        assert kwargs["event_type"] == "token_created"
        assert kwargs["phash"] == "deadbeefcafebabe"
        assert "deadbeefcafebabe" in kwargs["extra_json"]
        assert kwargs["created_at"] == token.created_at.isoformat()

    async def test_phash_failures_are_swallowed(self):
        from lineage_agent.factory_service import record_token_creation

        token = TokenMetadata(mint="mint-2", deployer="deployer-2", name="Pepe", symbol="PEPE", image_uri="x")
        mock_insert = AsyncMock()

        with patch("lineage_agent.factory_service._compute_phash", AsyncMock(side_effect=RuntimeError("boom"))):
            with patch("lineage_agent.factory_service.classify_narrative_llm", AsyncMock(return_value="meme")):
                with patch("lineage_agent.factory_service.event_insert", mock_insert):
                    await record_token_creation(token)

        kwargs = mock_insert.await_args.kwargs
        assert kwargs["phash"] is None
        assert kwargs["extra_json"] is None

    async def test_event_insert_failures_are_swallowed(self):
        from lineage_agent.factory_service import record_token_creation

        token = TokenMetadata(mint="mint-3", deployer="deployer-3", name="Pepe", symbol="PEPE")

        with patch("lineage_agent.factory_service.classify_narrative_llm", AsyncMock(return_value="meme")):
            with patch("lineage_agent.factory_service.event_insert", AsyncMock(side_effect=RuntimeError("db down"))):
                await record_token_creation(token)


class TestComputePhash:
    async def test_returns_none_for_non_200_response(self):
        from lineage_agent.factory_service import _compute_phash

        client = MagicMock()
        client.get = AsyncMock(return_value=SimpleNamespace(status_code=404, content=b""))

        with patch("lineage_agent.factory_service.get_img_client", return_value=client):
            result = await _compute_phash("https://example.com/image.png")

        assert result is None

    async def test_returns_hex_for_successful_response(self):
        from lineage_agent.factory_service import _compute_phash

        client = MagicMock()
        client.get = AsyncMock(return_value=SimpleNamespace(status_code=200, content=b"img"))
        fake_image = MagicMock()
        fake_image.convert.return_value = fake_image
        fake_hash = SimpleNamespace(hash=[[True, False], [False, True]])

        fake_image_module = ModuleType("PIL.Image")
        fake_image_module.open = MagicMock(return_value=fake_image)
        fake_pil_module = ModuleType("PIL")
        fake_pil_module.Image = fake_image_module
        fake_imagehash_module = ModuleType("imagehash")
        fake_imagehash_module.phash = MagicMock(return_value=fake_hash)

        with patch("lineage_agent.factory_service.get_img_client", return_value=client):
            with patch.dict(sys.modules, {
                "PIL": fake_pil_module,
                "PIL.Image": fake_image_module,
                "imagehash": fake_imagehash_module,
            }):
                result = await _compute_phash("https://example.com/image.png")

        assert result == "0000000000000009"

    async def test_returns_none_on_unexpected_exception(self):
        from lineage_agent.factory_service import _compute_phash

        client = MagicMock()
        client.get = AsyncMock(side_effect=RuntimeError("network"))

        with patch("lineage_agent.factory_service.get_img_client", return_value=client):
            result = await _compute_phash("https://example.com/image.png")

        assert result is None


class TestAnalyzeFactoryRhythm:
    async def test_returns_none_when_all_timestamps_invalid(self):
        from lineage_agent.factory_service import analyze_factory_rhythm

        rows = [
            {"created_at": "bad", "name": "Alpha", "mcap_usd": 100.0},
            {"created_at": None, "name": "Beta", "mcap_usd": 100.0},
            {"created_at": "still-bad", "name": "Gamma", "mcap_usd": 100.0},
        ]

        with patch("lineage_agent.factory_service.event_query", AsyncMock(return_value=rows)):
            with patch("lineage_agent.factory_service._parse_dt", side_effect=[None, None, None]):
                result = await analyze_factory_rhythm("deployer")

        assert result is None

    async def test_builds_report_with_themed_names_and_low_mcap_sample(self):
        from lineage_agent.factory_service import analyze_factory_rhythm

        base = datetime(2024, 1, 1, tzinfo=timezone.utc)
        rows = [
            {"created_at": (base + timedelta(hours=0)).isoformat(), "name": "Frog Alpha", "mcap_usd": 100.0},
            {"created_at": (base + timedelta(hours=2)).isoformat(), "name": "Frog Beta", "mcap_usd": 110.0},
            {"created_at": (base + timedelta(hours=4)).isoformat(), "name": "Frog Gamma", "mcap_usd": None},
        ]

        with patch("lineage_agent.factory_service.event_query", AsyncMock(return_value=rows)):
            result = await analyze_factory_rhythm("deployer")

        assert result is not None
        assert result.naming_pattern == "themed"
        assert result.tokens_launched == 3
        assert result.median_interval_hours == 2.0


class TestNamingHelpers:
    def test_detect_naming_pattern_incremental(self):
        from lineage_agent.factory_service import _detect_naming_pattern

        assert _detect_naming_pattern(["TOKEN1", "TOKEN2", "TOKEN3"]) == "incremental"

    def test_detect_naming_pattern_themed(self):
        from lineage_agent.factory_service import _detect_naming_pattern

        assert _detect_naming_pattern(["Dog King", "Dog Queen", "Dog Baron"]) == "themed"

    def test_detect_naming_pattern_random(self):
        from lineage_agent.factory_service import _detect_naming_pattern

        assert _detect_naming_pattern(["Apple", "Rocket", "Stone"]) == "random"

    def test_longest_common_prefix_empty(self):
        from lineage_agent.factory_service import _longest_common_prefix

        assert _longest_common_prefix([]) == ""

    def test_longest_common_prefix_no_match(self):
        from lineage_agent.factory_service import _longest_common_prefix

        assert _longest_common_prefix(["alpha", "beta"]) == ""
