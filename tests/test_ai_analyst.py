"""Tests for src/lineage_agent/ai_analyst.py

Strategy:
- _build_prompt: feed simple Namespace objects to verify sections are rendered
- _parse_response: test happy-path, markdown fences, bad JSON fallback
- analyze_token: mock anthropic client to test integration + error paths
"""

from __future__ import annotations

import json
import types
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lineage_agent.ai_analyst import _build_prompt, _parse_response, analyze_token


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _ns(**kwargs):
    """Create a SimpleNamespace with given attributes."""
    return types.SimpleNamespace(**kwargs)


MINT = "7dmpjtmtkRNumctHAGbTrP4MQPHjX59M54aZAbvzpump"


# ─────────────────────────────────────────────────────────────────────────────
# _build_prompt
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildPrompt:
    def test_no_data_returns_just_mint(self):
        prompt = _build_prompt(MINT, None, None, None)
        assert MINT in prompt
        # No sections generated
        assert "LINEAGE" not in prompt
        assert "BUNDLE" not in prompt
        assert "SOL FLOW" not in prompt

    def test_lineage_section_rendered(self):
        root = _ns(name="TestToken", symbol="TST", deployer="ABC123deployer1234", created_at="2025-01-01T00:00:00")
        derivative = _ns(
            generation=1,
            name="CloneToken",
            symbol="CLN",
            deployer="XYZ789deployer9876",
            created_at="2025-01-01T00:10:00",
            evidence=_ns(composite_score=0.92),
        )
        lineage = _ns(
            root=root,
            query_is_root=True,
            derivatives=[derivative],
            confidence=0.85,
            zombie_alert=None,
            death_clock=None,
            deployer_profile=None,
        )
        prompt = _build_prompt(MINT, lineage, None, None)
        assert "LINEAGE ANALYSIS" in prompt
        assert "TestToken" in prompt
        assert "TST" in prompt
        assert "Clones detected: 1" in prompt
        assert "CloneToken" in prompt
        assert "Lineage confidence: 85%" in prompt

    def test_lineage_zombie_alert(self):
        lineage = _ns(
            root=None,
            query_is_root=None,
            derivatives=[],
            confidence=None,
            zombie_alert=_ns(original_mint="AAABBBCCCDDDEEE"),
            death_clock=None,
            deployer_profile=None,
        )
        prompt = _build_prompt(MINT, lineage, None, None)
        assert "ZOMBIE ALERT" in prompt
        assert "AAABBBCCC" in prompt

    def test_lineage_death_clock(self):
        lineage = _ns(
            root=None,
            query_is_root=None,
            derivatives=[],
            confidence=None,
            zombie_alert=None,
            death_clock=_ns(risk_level="critical", median_rug_hours=4.0, elapsed_hours=3.2),
            deployer_profile=None,
        )
        prompt = _build_prompt(MINT, lineage, None, None)
        assert "Death clock" in prompt
        assert "critical" in prompt

    def test_bundle_section_rendered(self):
        bundle = _ns(
            overall_verdict="coordinated_dump_unknown_team",
            launch_slot=12345678,
            bundle_wallets=[],
            total_sol_spent_by_bundle=15.5,
            coordinated_sell_detected=True,
            confirmed_team_wallets=["WALLET_A" * 4],
            suspected_team_wallets=[],
            coordinated_dump_wallets=["WALLET_B" * 4],
            common_prefund_source=None,
            common_sink_wallets=[],
            evidence_chain=["All 3 wallets sold within 50 slots of each other"],
        )
        prompt = _build_prompt(MINT, None, bundle, None)
        assert "BUNDLE FORENSICS" in prompt
        assert "coordinated_dump_unknown_team" in prompt
        assert "15.5000 SOL" in prompt
        assert "Evidence chain" in prompt

    def test_sol_flow_section_rendered(self):
        edge = _ns(
            hop=0,
            from_address="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            to_address="BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
            amount_sol=10.5,
            to_label="Binance",
        )
        sol_flow = _ns(
            total_extracted_sol=10.5,
            total_extracted_usd=1500.0,
            hop_count=1,
            terminal_wallets=["BBBBBBBBBBBBBBB"],
            known_cex_detected=True,
            cross_chain_exits=[],
            flows=[edge],
        )
        prompt = _build_prompt(MINT, None, None, sol_flow)
        assert "SOL FLOW TRACE" in prompt
        assert "10.5000 SOL" in prompt
        assert "Binance" in prompt
        assert "Known CEX detected: True" in prompt


# ─────────────────────────────────────────────────────────────────────────────
# _parse_response
# ─────────────────────────────────────────────────────────────────────────────

class TestParseResponse:
    def _valid_payload(self) -> dict:
        return {
            "risk_score": 82,
            "confidence": "high",
            "rug_pattern": "coordinated_bundle",
            "verdict_summary": "Coordinated bundle dump: 3 wallets sold within 50 slots.",
            "narrative": {
                "observation": "Three wallets bought in slot 12345 and sold within 50 slots.",
                "pattern": "Classic coordinated bundle exit by pre-funded team wallets.",
                "risk": "Retail holders left holding worthless tokens after team exit.",
            },
            "key_findings": ["[COORDINATION] All 3 wallets sold within 50 slots.", "[IDENTITY] Common pre-funder detected."],
            "wallet_classifications": {"AAABBBCCCDDD": "bundle_wallet"},
            "operator_hypothesis": "Probably the same team as token X.",
        }

    def test_clean_json(self):
        payload = self._valid_payload()
        result = _parse_response(json.dumps(payload), MINT)
        assert result["risk_score"] == 82
        assert result["confidence"] == "high"
        assert result["mint"] == MINT
        assert "analyzed_at" in result
        assert "verdict_summary" in result
        assert isinstance(result["narrative"], dict)
        assert "observation" in result["narrative"]

    def test_json_with_markdown_fences(self):
        payload = self._valid_payload()
        raw = f"```json\n{json.dumps(payload)}\n```"
        result = _parse_response(raw, MINT)
        assert result["risk_score"] == 82
        assert result.get("parse_error") is None  # No parse error

    def test_json_with_plain_fences(self):
        payload = self._valid_payload()
        raw = f"```\n{json.dumps(payload)}\n```"
        result = _parse_response(raw, MINT)
        assert result["risk_score"] == 82

    def test_bad_json_fallback(self):
        result = _parse_response("This is not JSON at all", MINT)
        assert result["parse_error"] is True
        assert result["confidence"] == "low"
        assert result["rug_pattern"] == "unknown"
        assert result["risk_score"] is None
        assert isinstance(result["narrative"], dict)
        assert "This is not JSON" in result["narrative"]["observation"]

    def test_model_and_mint_injected(self):
        payload = self._valid_payload()
        result = _parse_response(json.dumps(payload), MINT)
        assert result["mint"] == MINT
        assert result["model"] != "" and result["model"] is not None


# ─────────────────────────────────────────────────────────────────────────────
# analyze_token — integration (mocked)
# ─────────────────────────────────────────────────────────────────────────────

class TestAnalyzeToken:
    def _make_mock_response(self, payload: dict):
        """Build a minimal mock of anthropic message response."""
        content_item = MagicMock()
        content_item.text = json.dumps(payload)
        usage = MagicMock()
        usage.input_tokens = 500
        usage.output_tokens = 200
        msg = MagicMock()
        msg.content = [content_item]
        msg.usage = usage
        return msg

    @pytest.mark.asyncio
    async def test_returns_none_when_no_data(self):
        result = await analyze_token(MINT)
        assert result is None

    @pytest.mark.asyncio
    async def test_successful_call(self):
        payload = {
            "risk_score": 87,
            "confidence": "high",
            "rug_pattern": "serial_clone",
            "verdict_summary": "Serial clone: 5 tokens in 4 minutes via vortexdeployer.com.",
            "narrative": {
                "observation": "Five tokens named 'TestToken' deployed in 4 minutes.",
                "pattern": "Automated clone-farming via shared metadata platform.",
                "risk": "Each clone targets retail buyers before the previous collapses.",
            },
            "key_findings": ["[DEPLOYMENT] 5 clones in 4 minutes.", "[IDENTITY] Shared metadata URI."],
            "wallet_classifications": {},
            "operator_hypothesis": "Automated clone-farming platform.",
        }
        mock_response = self._make_mock_response(payload)

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        with patch("lineage_agent.ai_analyst._get_client", return_value=mock_client):
            lineage = _ns(
                root=_ns(name="TestToken", symbol="TST", deployer="A" * 44, created_at="2025-01-01"),
                query_is_root=True,
                derivatives=[],
                confidence=0.9,
                zombie_alert=None,
                death_clock=None,
                deployer_profile=None,
            )
            result = await analyze_token(MINT, lineage_result=lineage)

        assert result is not None
        assert result["risk_score"] == 87
        assert result["rug_pattern"] == "serial_clone"
        assert result["mint"] == MINT

    @pytest.mark.asyncio
    async def test_returns_none_on_missing_api_key(self):
        with patch("lineage_agent.ai_analyst._get_client", side_effect=RuntimeError("ANTHROPIC_API_KEY not set")):
            lineage = _ns(
                root=None, query_is_root=None, derivatives=[], confidence=0.5,
                zombie_alert=None, death_clock=None, deployer_profile=None,
            )
            result = await analyze_token(MINT, lineage_result=lineage)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_api_error(self):
        """Any unexpected exception from anthropic should return None (not raise)."""
        class FakeAPIError(Exception):
            pass

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=FakeAPIError("something broke"))

        with patch("lineage_agent.ai_analyst._get_client", return_value=mock_client):
            bundle = _ns(
                overall_verdict="classic_rug",
                launch_slot=0,
                bundle_wallets=[],
                total_sol_spent_by_bundle=0,
                coordinated_sell_detected=False,
                confirmed_team_wallets=[],
                suspected_team_wallets=[],
                coordinated_dump_wallets=[],
                common_prefund_source=None,
                common_sink_wallets=[],
                evidence_chain=[],
            )
            result = await analyze_token(MINT, bundle_report=bundle)
        assert result is None

    @pytest.mark.asyncio
    async def test_rate_limit_returns_none(self):
        class RateLimitError(Exception):
            pass

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=RateLimitError("429"))

        with patch("lineage_agent.ai_analyst._get_client", return_value=mock_client):
            sol_flow = _ns(
                total_extracted_sol=10.0,
                total_extracted_usd=1200.0,
                hop_count=1,
                terminal_wallets=[],
                known_cex_detected=False,
                cross_chain_exits=[],
                flows=[],
            )
            result = await analyze_token(MINT, sol_flow_report=sol_flow)
        assert result is None

    @pytest.mark.asyncio
    async def test_parse_error_still_returns_result(self):
        """If Claude returns malformed JSON, we still return the fallback dict."""
        content_item = MagicMock()
        content_item.text = "I cannot comply with this request."
        usage = MagicMock()
        usage.input_tokens = 100
        usage.output_tokens = 10
        msg = MagicMock()
        msg.content = [content_item]
        msg.usage = usage

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=msg)

        with patch("lineage_agent.ai_analyst._get_client", return_value=mock_client):
            lineage = _ns(
                root=None, query_is_root=None, derivatives=[], confidence=0.5,
                zombie_alert=None, death_clock=None, deployer_profile=None,
            )
            result = await analyze_token(MINT, lineage_result=lineage)

        # Should return the fallback parse response, not None
        assert result is not None
        assert result.get("parse_error") is True


# ─────────────────────────────────────────────────────────────────────────────
# get_cached_bundle_report in bundle_tracker_service
# ─────────────────────────────────────────────────────────────────────────────

class TestGetCachedBundleReport:
    @pytest.mark.asyncio
    async def test_returns_none_on_cache_miss(self):
        with patch(
            "lineage_agent.bundle_tracker_service.bundle_report_query",
            new_callable=AsyncMock,
            return_value=None,
        ):
            from lineage_agent.bundle_tracker_service import get_cached_bundle_report
            result = await get_cached_bundle_report(MINT)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_exception(self):
        with patch(
            "lineage_agent.bundle_tracker_service.bundle_report_query",
            new_callable=AsyncMock,
            side_effect=Exception("DB error"),
        ):
            from lineage_agent.bundle_tracker_service import get_cached_bundle_report
            result = await get_cached_bundle_report(MINT)
        assert result is None
