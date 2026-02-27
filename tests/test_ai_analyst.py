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

from lineage_agent.ai_analyst import (
    _build_prompt,
    _extract_deployer,
    _parse_response,
    _rule_based_fallback,
    _sanity_check,
    analyze_token,
)


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
            bundle = _ns(
                overall_verdict="classic_rug",
                launch_slot=0,
                bundle_wallets=["wallet1"],
                total_sol_spent_by_bundle=5.0,
                coordinated_sell_detected=True,
                confirmed_team_wallets=[],
                suspected_team_wallets=[],
                coordinated_dump_wallets=[],
                common_prefund_source=None,
                common_sink_wallets=[],
                evidence_chain=[],
            )
            result = await analyze_token(MINT, lineage_result=lineage, bundle_report=bundle)

        assert result is not None
        assert result["risk_score"] == 87  # sanity check allows high score when bundle data present
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
        # P3-B: rule-based fallback is returned instead of None on API error
        assert result is not None
        assert result.get("is_fallback") is True
        assert result.get("model") == "rule_based_fallback"

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
        # P3-B: rule-based fallback is returned instead of None on rate-limit
        assert result is not None
        assert result.get("is_fallback") is True
        assert result.get("model") == "rule_based_fallback"

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


# ─────────────────────────────────────────────────────────────────────────────
# _build_prompt — deployer history section (P1-B)
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildPromptDeployerHistory:
    def test_no_history_no_section(self):
        prompt = _build_prompt(MINT, None, None, None, deployer_history=None)
        assert "DEPLOYER TRACK RECORD" not in prompt

    def test_empty_history_no_section(self):
        prompt = _build_prompt(MINT, None, None, None, deployer_history=[])
        assert "DEPLOYER TRACK RECORD" not in prompt

    def test_history_section_rendered(self):
        history = [
            {"name": "ScamToken", "mint": "SCAM111111111111111111111", "mcap_usd": 42000, "rugged_at": "2025-12-01"},
            {"name": "FakeInu",   "mint": "FAKE222222222222222222222", "mcap_usd": None,  "rugged_at": "2025-11-15"},
        ]
        prompt = _build_prompt(MINT, None, None, None, deployer_history=history)
        assert "DEPLOYER TRACK RECORD" in prompt
        assert "ScamToken" in prompt
        assert "FakeInu" in prompt
        assert "mcap=$42,000" in prompt
        # name with no mcap should still appear without error (mint sliced to 12 chars)
        assert "FAKE22222222" in prompt


# ─────────────────────────────────────────────────────────────────────────────
# _sanity_check (P0-A)
# ─────────────────────────────────────────────────────────────────────────────

class TestSanityCheck:
    def _result(self, score=50, confidence="high"):
        return {
            "risk_score": score,
            "confidence": confidence,
            "key_findings": ["existing finding"],
        }

    def test_no_score_returns_unchanged(self):
        result = {"confidence": "high", "key_findings": []}
        out = _sanity_check(result, None, None, None)
        assert out == result

    def test_high_score_no_evidence_capped(self):
        result = _sanity_check(self._result(score=87), lineage=None, bundle=None, sol_flow=None)
        assert result["risk_score"] == 55
        assert result["confidence"] == "low"
        assert any("CAVEAT" in f for f in result["key_findings"])

    def test_high_score_with_bundle_passes_through(self):
        bundle = _ns(overall_verdict="classic_rug")
        result = _sanity_check(self._result(score=87), lineage=None, bundle=bundle, sol_flow=None)
        assert result["risk_score"] == 87  # not capped

    def test_high_score_with_sol_flow_passes_through(self):
        sol_flow = _ns(total_extracted_sol=5.0)
        result = _sanity_check(self._result(score=87), lineage=None, bundle=None, sol_flow=sol_flow)
        assert result["risk_score"] == 87  # not capped

    def test_low_score_raised_on_serial_rugger(self):
        deployer_profile = _ns(total_tokens_deployed=10, rug_count=8)  # 80% rug rate
        lineage = _ns(deployer_profile=deployer_profile)
        result = _sanity_check(self._result(score=20), lineage=lineage, bundle=None, sol_flow=None)
        assert result["risk_score"] == 45  # 20 + 25
        assert any("CAVEAT" in f for f in result["key_findings"])

    def test_low_score_low_rug_rate_unchanged(self):
        deployer_profile = _ns(total_tokens_deployed=10, rug_count=2)  # 20% rug rate
        lineage = _ns(deployer_profile=deployer_profile)
        result = _sanity_check(self._result(score=20), lineage=lineage, bundle=None, sol_flow=None)
        assert result["risk_score"] == 20  # unchanged

    def test_caveats_prepended_to_existing_findings(self):
        result = _sanity_check(self._result(score=87), lineage=None, bundle=None, sol_flow=None)
        assert result["key_findings"][0].startswith("[CAVEAT]")
        assert "existing finding" in result["key_findings"]


# ─────────────────────────────────────────────────────────────────────────────
# _extract_deployer (P1-B helper)
# ─────────────────────────────────────────────────────────────────────────────

class TestExtractDeployer:
    def test_none_lineage_returns_none(self):
        assert _extract_deployer(None) is None

    def test_lineage_with_root_returns_deployer(self):
        lineage = _ns(root=_ns(deployer="ROOTDEPLOYERADDR"), query_token=None)
        assert _extract_deployer(lineage) == "ROOTDEPLOYERADDR"

    def test_lineage_with_query_token_preferred(self):
        lineage = _ns(
            query_token=_ns(deployer="QUERYTOKENDEPLOYER"),
            root=_ns(deployer="ROOTDEPLOYER"),
        )
        assert _extract_deployer(lineage) == "QUERYTOKENDEPLOYER"

    def test_no_deployer_field_returns_none(self):
        lineage = _ns(root=_ns(deployer=None), query_token=None)
        assert _extract_deployer(lineage) is None


# ─────────────────────────────────────────────────────────────────────────────
# _rule_based_fallback (P3-B)
# ─────────────────────────────────────────────────────────────────────────────

class TestRuleBasedFallback:
    def test_all_none_returns_none(self):
        assert _rule_based_fallback(MINT) is None

    def test_bundle_only_confirmed_rug(self):
        bundle = _ns(overall_verdict="confirmed_coordinated_dump")
        result = _rule_based_fallback(MINT, bundle=bundle)
        assert result is not None
        assert result["is_fallback"] is True
        assert result["model"] == "rule_based_fallback"
        assert result["risk_score"] >= 80
        assert any("BUNDLE" in f for f in result["key_findings"])

    def test_sol_flow_high_extraction(self):
        sol_flow = _ns(total_extracted_sol=15.0)
        result = _rule_based_fallback(MINT, sol_flow=sol_flow)
        assert result is not None
        assert result["risk_score"] >= 85
        assert any("FINANCIAL" in f for f in result["key_findings"])

    def test_sol_flow_low_extraction(self):
        sol_flow = _ns(total_extracted_sol=0.5)
        result = _rule_based_fallback(MINT, sol_flow=sol_flow)
        assert result is not None
        assert result["risk_score"] < 50  # low-extraction → moderate/low signal

    def test_lineage_with_many_clones(self):
        lineage = _ns(
            derivatives=[_ns() for _ in range(15)],
            deployer_profile=None,
            zombie_alert=None,
        )
        result = _rule_based_fallback(MINT, lineage=lineage)
        assert result is not None
        assert any("IDENTITY" in f for f in result["key_findings"])

    def test_zombie_alert_included(self):
        lineage = _ns(
            derivatives=[],
            deployer_profile=None,
            zombie_alert=_ns(original_mint="ORIG1234"),
        )
        result = _rule_based_fallback(MINT, lineage=lineage)
        assert result is not None
        assert any("Zombie" in f or "zombie" in f.lower() for f in result["key_findings"])

    def test_result_structure_complete(self):
        bundle = _ns(overall_verdict="suspected_coordination")
        result = _rule_based_fallback(MINT, bundle=bundle)
        for key in ("mint", "model", "analyzed_at", "risk_score", "confidence",
                    "rug_pattern", "verdict_summary", "narrative", "key_findings",
                    "wallet_classifications", "operator_hypothesis", "is_fallback"):
            assert key in result, f"Missing key: {key}"
        assert result["mint"] == MINT
        assert result["confidence"] == "low"
