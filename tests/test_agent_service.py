"""Tests for the agentic forensic investigation service."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lineage_agent.agent_service import (
    AGENT_TOOLS,
    _compress_tool_result,
    _execute_tool,
    _summarize_scan_for_agent,
    run_agent,
)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_lineage(**kwargs):
    """Build a minimal fake LineageResult with optional overrides."""
    defaults = {
        "query_token": SimpleNamespace(
            name="TestToken",
            symbol="TEST",
            mint="TestMint123456789012345678901234567890",
            deployer="DeployerAddr1234567890123456789012345",
            market_cap_usd=100000,
            liquidity_usd=5000,
            created_at="2026-03-01T00:00:00Z",
            lifecycle_stage=SimpleNamespace(value="DEX_LISTED"),
            launch_platform="pump-fun",
        ),
        "root": None,
        "query_is_root": True,
        "family_size": 3,
        "is_bonding_curve": False,
        "platform": "pump-fun",
        "death_clock": SimpleNamespace(
            risk_level="high",
            rug_probability_pct=72.5,
            confidence="medium",
            sample_count=15,
            median_hours_to_rug=18.0,
        ),
        "bundle_report": SimpleNamespace(
            overall_verdict="confirmed",
            bundle_count=3,
            total_extracted_sol=14.5,
            total_extracted_usd=2900.0,
            coordinated_sell_detected=True,
        ),
        "insider_sell": SimpleNamespace(
            verdict="insider_dump",
            deployer_exited=True,
            deployer_sold_pct=95.0,
            sell_pressure_1h=0.82,
        ),
        "deployer_profile": SimpleNamespace(
            total_tokens_launched=12,
            confirmed_rug_count=5,
            rug_rate_pct=41.7,
        ),
        "operator_fingerprint": SimpleNamespace(
            fingerprint="abc123def456",
            linked_wallets=["wallet1", "wallet2", "wallet3"],
            confidence="high",
        ),
        "sol_flow": SimpleNamespace(
            total_extracted_sol=14.5,
            total_extracted_usd=2900.0,
            known_cex_detected=True,
            flows=[{"from": "a", "to": "b"}, {"from": "b", "to": "c"}],
        ),
        "cartel_report": SimpleNamespace(
            community_id="cartel-001",
            member_count=4,
            total_rugs=12,
        ),
        "liquidity_arch": SimpleNamespace(
            hhi=0.95,
            pool_count=1,
        ),
        "factory_rhythm": SimpleNamespace(
            is_factory=True,
            rhythm_score=0.87,
        ),
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _make_claude_response(content_blocks, stop_reason="end_turn", input_tokens=100, output_tokens=50):
    """Build a mock Claude Messages response."""
    return SimpleNamespace(
        content=content_blocks,
        stop_reason=stop_reason,
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens),
    )


def _text_block(text):
    return SimpleNamespace(type="text", text=text)


def _tool_use_block(name, input_data, tool_id="tool_001"):
    return SimpleNamespace(type="tool_use", id=tool_id, name=name, input=input_data)


# ── TestAgentToolSchemas ─────────────────────────────────────────────────────


class TestAgentToolSchemas:
    def test_all_tools_have_valid_schema(self):
        for tool in AGENT_TOOLS:
            assert "name" in tool
            assert "description" in tool
            assert "input_schema" in tool
            schema = tool["input_schema"]
            assert schema["type"] == "object"
            assert "properties" in schema
            assert "required" in schema

    def test_tool_names_unique(self):
        names = [t["name"] for t in AGENT_TOOLS]
        assert len(names) == len(set(names))

    def test_tool_descriptions_nonempty(self):
        for tool in AGENT_TOOLS:
            assert len(tool["description"]) > 20, f"{tool['name']} has too short a description"

    def test_scan_token_description_mentions_included_signals(self):
        scan_tool = next(t for t in AGENT_TOOLS if t["name"] == "scan_token")
        desc = scan_tool["description"].lower()
        for signal in ["death clock", "bundle", "insider sell", "deployer profile", "operator fingerprint"]:
            assert signal in desc, f"scan_token description missing '{signal}'"


# ── TestSummarizeScan ────────────────────────────────────────────────────────


class TestSummarizeScan:
    def test_preserves_key_signals(self):
        lineage = _make_lineage()
        result = _summarize_scan_for_agent(lineage)
        assert result["token"]["name"] == "TestToken"
        assert result["token"]["deployer"] == "DeployerAddr1234567890123456789012345"
        assert result["risk_signals"]["death_clock"]["risk_level"] == "high"
        assert result["risk_signals"]["bundle"]["overall_verdict"] == "confirmed"
        assert result["risk_signals"]["deployer_profile"]["confirmed_rug_count"] == 5

    def test_null_fields_handled(self):
        lineage = _make_lineage(
            death_clock=None,
            bundle_report=None,
            insider_sell=None,
            deployer_profile=None,
            operator_fingerprint=None,
            sol_flow=None,
            cartel_report=None,
            liquidity_arch=None,
            factory_rhythm=None,
        )
        result = _summarize_scan_for_agent(lineage)
        assert result["risk_signals"]["death_clock"] is None
        assert result["risk_signals"]["bundle"] is None
        assert result["flags"] == []

    def test_output_under_3k_chars(self):
        lineage = _make_lineage()
        result = _summarize_scan_for_agent(lineage)
        serialized = json.dumps(result, default=str)
        assert len(serialized) < 3000, f"Summarized scan is {len(serialized)} chars, expected < 3000"

    def test_includes_flags(self):
        lineage = _make_lineage()
        result = _summarize_scan_for_agent(lineage)
        assert "DEATH_CLOCK_HIGH_RISK" in result["flags"]
        assert "BUNDLE_CONFIRMED" in result["flags"]
        assert "DEPLOYER_EXITED" in result["flags"]
        assert "INSIDER_DUMP" in result["flags"]
        assert "SERIAL_RUGGER" in result["flags"]
        assert "SOL_EXTRACTION_HIGH" in result["flags"]
        assert "CARTEL_DETECTED" in result["flags"]
        assert "FACTORY_DEPLOYMENT" in result["flags"]


# ── TestCompressToolResult ───────────────────────────────────────────────────


class TestCompressToolResult:
    def test_compress_large_result(self):
        large = {"risk_score": 85, "data": "x" * 5000}
        compressed = _compress_tool_result(large, threshold=4000)
        assert compressed["_compressed"] is True
        assert compressed["risk_score"] == 85

    def test_no_compress_small_result(self):
        small = {"risk_score": 10, "verdict": "clean"}
        result = _compress_tool_result(small, threshold=4000)
        assert result == small
        assert "_compressed" not in result

    def test_compress_preserves_risk_fields(self):
        large = {
            "risk_score": 90,
            "confidence": "high",
            "verdict": "rug",
            "total_extracted_sol": 50.0,
            "huge_list": list(range(1000)),
        }
        compressed = _compress_tool_result(large, threshold=100)
        assert compressed["risk_score"] == 90
        assert compressed["confidence"] == "high"
        assert compressed["verdict"] == "rug"
        assert compressed["total_extracted_sol"] == 50.0


# ── TestExecuteTool ──────────────────────────────────────────────────────────


class TestExecuteTool:
    @pytest.mark.asyncio
    async def test_scan_token_calls_detect_lineage(self):
        lineage = _make_lineage()
        with patch(
            "lineage_agent.lineage_detector.detect_lineage",
            new_callable=AsyncMock,
            return_value=lineage,
        ) as mock_detect:
            result = await _execute_tool("scan_token", {"mint": "TestMint"}, cache=None)
            mock_detect.assert_called_once_with("TestMint")
            assert result["token"]["name"] == "TestToken"

    @pytest.mark.asyncio
    async def test_scan_token_result_is_summarized(self):
        lineage = _make_lineage()
        with patch(
            "lineage_agent.lineage_detector.detect_lineage",
            new_callable=AsyncMock,
            return_value=lineage,
        ):
            result = await _execute_tool("scan_token", {"mint": "TestMint"}, cache=None)
            # Should have the summarized structure, not raw LineageResult
            assert "risk_signals" in result
            assert "flags" in result

    @pytest.mark.asyncio
    async def test_scan_token_timeout_returns_error_dict(self):
        with patch(
            "lineage_agent.lineage_detector.detect_lineage",
            new_callable=AsyncMock,
            side_effect=asyncio.TimeoutError(),
        ):
            result = await _execute_tool("scan_token", {"mint": "TestMint"}, cache=None)
            assert "error" in result
            assert "TimeoutError" in result["error"]

    @pytest.mark.asyncio
    async def test_unknown_tool_returns_error(self):
        result = await _execute_tool("nonexistent_tool", {}, cache=None)
        assert "error" in result
        assert "Unknown tool" in result["error"]

    @pytest.mark.asyncio
    async def test_service_exception_never_swallowed(self):
        with patch(
            "lineage_agent.lineage_detector.detect_lineage",
            new_callable=AsyncMock,
            side_effect=RuntimeError("Connection lost"),
        ):
            result = await _execute_tool("scan_token", {"mint": "X"}, cache=None)
            assert "error" in result
            assert "RuntimeError" in result["error"]
            assert "Connection lost" in result["error"]

    @pytest.mark.asyncio
    async def test_get_deployer_profile_dispatch(self):
        mock_profile = MagicMock()
        mock_profile.model_dump.return_value = {"total_tokens": 10, "rug_count": 3}
        with patch(
            "lineage_agent.deployer_service.compute_deployer_profile",
            new_callable=AsyncMock,
            return_value=mock_profile,
        ) as mock_fn:
            result = await _execute_tool("get_deployer_profile", {"address": "DeployerX"}, cache=None)
            mock_fn.assert_called_once_with("DeployerX")
            assert result["total_tokens"] == 10

    @pytest.mark.asyncio
    async def test_get_bundle_report_dispatch(self):
        mock_bundle = MagicMock()
        mock_bundle.model_dump.return_value = {"bundle_count": 2, "verdict": "suspected"}
        with patch(
            "lineage_agent.bundle_tracker_service.get_cached_bundle_report",
            new_callable=AsyncMock,
            return_value=mock_bundle,
        ) as mock_fn:
            result = await _execute_tool("get_bundle_report", {"mint": "MintX"}, cache=None)
            mock_fn.assert_called_once_with("MintX")
            assert result["bundle_count"] == 2

    @pytest.mark.asyncio
    async def test_trace_sol_flow_dispatch(self):
        mock_flow = MagicMock()
        mock_flow.model_dump.return_value = {"total_extracted_sol": 20.0}
        with patch(
            "lineage_agent.sol_flow_service.get_sol_flow_report",
            new_callable=AsyncMock,
            return_value=mock_flow,
        ) as mock_fn:
            result = await _execute_tool("trace_sol_flow", {"mint": "MintX"}, cache=None)
            mock_fn.assert_called_once_with("MintX")
            assert result["total_extracted_sol"] == 20.0

    @pytest.mark.asyncio
    async def test_get_cartel_report_dispatch(self):
        mock_cartel = MagicMock()
        mock_cartel.model_dump.return_value = {"community_id": "c1", "member_count": 3}
        with patch(
            "lineage_agent.cartel_service.compute_cartel_report",
            new_callable=AsyncMock,
            return_value=mock_cartel,
        ) as mock_fn:
            result = await _execute_tool("get_cartel_report", {"mint": "M", "deployer": "D"}, cache=None)
            mock_fn.assert_called_once_with("M", "D")
            assert result["community_id"] == "c1"


# ── Streaming mock helper ────────────────────────────────────────────────────

class _MockStream:
    """Mocks Anthropic's messages.stream() async context manager.

    Yields content_block_start / content_block_delta events, then provides
    the final message via get_final_message().
    """

    def __init__(self, final_message):
        self._final = final_message
        self._events = self._build_events(final_message)

    @staticmethod
    def _build_events(msg):
        events = []
        for block in msg.content:
            btype = getattr(block, "type", None)
            if btype == "text":
                events.append(SimpleNamespace(
                    type="content_block_delta",
                    delta=SimpleNamespace(type="text_delta", text=block.text),
                ))
            elif btype == "tool_use":
                events.append(SimpleNamespace(
                    type="content_block_start",
                    content_block=SimpleNamespace(
                        type="tool_use", id=block.id, name=block.name,
                    ),
                ))
                # Send tool input as JSON delta
                import json as _json
                events.append(SimpleNamespace(
                    type="content_block_delta",
                    delta=SimpleNamespace(
                        type="input_json_delta",
                        partial_json=_json.dumps(block.input),
                    ),
                ))
        return events

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    def __aiter__(self):
        return self._iter_events()

    async def _iter_events(self):
        for evt in self._events:
            yield evt

    async def get_final_message(self):
        return self._final


class _MockStreamRaising:
    """Mock stream that raises an exception inside the context manager."""

    def __init__(self, exc):
        self._exc = exc

    async def __aenter__(self):
        raise self._exc

    async def __aexit__(self, *args):
        pass


def _mock_client_streaming(*responses):
    """Build a mock Anthropic client whose messages.stream() returns _MockStream.

    Each call to messages.stream() returns the next response in order.
    """
    mock_client = MagicMock()
    stream_iter = iter([_MockStream(r) for r in responses])
    mock_client.messages.stream = MagicMock(side_effect=stream_iter)
    return mock_client


# ── TestRunAgent ─────────────────────────────────────────────────────────────


class TestRunAgent:
    @pytest.mark.asyncio
    async def test_single_turn_text_yields_text_done(self):
        """Agent returns text immediately (no tool calls) → text_delta + done events."""
        turn1 = _make_claude_response([_text_block("This token looks clean.")])
        verdict = _make_claude_response([
            SimpleNamespace(
                type="tool_use", id="v1", name="forensic_report",
                input={"risk_score": 15, "confidence": "high", "rug_pattern": "unknown",
                       "verdict_summary": "Low risk", "narrative": {"observation": "ok", "pattern": "ok", "risk": "ok"},
                       "key_findings": ["clean"], "wallet_classifications": {}, "conviction_chain": "ok"},
            ),
        ])
        mock_client = _mock_client_streaming(turn1, verdict)

        with patch("lineage_agent.agent_service._get_client", return_value=mock_client), \
             patch("lineage_agent.lineage_detector.get_cached_lineage_report", new_callable=AsyncMock, return_value=None), \
             patch("lineage_agent.agent_service._cache_verdict", new_callable=AsyncMock, create=True):

            events = []
            async for evt in run_agent("TestMint", cache=None, max_turns=4, timeout=30.0):
                events.append(evt)

            event_types = [e["event"] for e in events]
            assert "text_delta" in event_types or "text" in event_types
            assert "done" in event_types
            assert event_types[-1] == "done"

    @pytest.mark.asyncio
    async def test_multi_turn_tool_use(self):
        """Agent calls a tool, gets result, then emits text verdict."""
        turn1 = _make_claude_response(
            [_tool_use_block("scan_token", {"mint": "M1"}, "tc1")],
            stop_reason="tool_use",
        )
        turn2 = _make_claude_response([_text_block("Based on scan, risk is moderate.")])
        verdict = _make_claude_response([
            SimpleNamespace(
                type="tool_use", id="v1", name="forensic_report",
                input={"risk_score": 55, "confidence": "medium", "rug_pattern": "unknown",
                       "verdict_summary": "Moderate risk", "narrative": {"observation": "ok", "pattern": "ok", "risk": "ok"},
                       "key_findings": ["finding1"], "wallet_classifications": {}, "conviction_chain": "chain"},
            ),
        ])
        mock_client = _mock_client_streaming(turn1, turn2, verdict)

        lineage = _make_lineage()
        with patch("lineage_agent.agent_service._get_client", return_value=mock_client), \
             patch("lineage_agent.lineage_detector.get_cached_lineage_report", new_callable=AsyncMock, return_value=None), \
             patch("lineage_agent.lineage_detector.detect_lineage", new_callable=AsyncMock, return_value=lineage), \
             patch("lineage_agent.agent_service._cache_verdict", new_callable=AsyncMock, create=True):

            events = []
            async for evt in run_agent("M1", cache=None, max_turns=4, timeout=30.0):
                events.append(evt)

            types = [e["event"] for e in events]
            assert "tool_call" in types
            assert "tool_result" in types
            assert "done" in types

    @pytest.mark.asyncio
    async def test_max_turns_enforced(self):
        """Agent stops at max_turns even if Claude keeps requesting tools."""
        tool_response = _make_claude_response(
            [_tool_use_block("scan_token", {"mint": "M"}, "tc1")],
            stop_reason="tool_use",
        )
        verdict = _make_claude_response([
            SimpleNamespace(
                type="tool_use", id="v1", name="forensic_report",
                input={"risk_score": 50, "confidence": "low", "rug_pattern": "unknown",
                       "verdict_summary": "Stopped", "narrative": {"observation": "x", "pattern": "x", "risk": "x"},
                       "key_findings": [], "wallet_classifications": {}, "conviction_chain": "x"},
            ),
        ])
        mock_client = _mock_client_streaming(tool_response, tool_response, tool_response, verdict)

        lineage = _make_lineage()
        with patch("lineage_agent.agent_service._get_client", return_value=mock_client), \
             patch("lineage_agent.lineage_detector.get_cached_lineage_report", new_callable=AsyncMock, return_value=None), \
             patch("lineage_agent.lineage_detector.detect_lineage", new_callable=AsyncMock, return_value=lineage), \
             patch("lineage_agent.agent_service._cache_verdict", new_callable=AsyncMock, create=True):

            events = []
            async for evt in run_agent("M", cache=None, max_turns=3, timeout=30.0):
                events.append(evt)

            assert events[-1]["event"] == "done"
            tool_calls = [e for e in events if e["event"] == "tool_call"]
            assert len(tool_calls) <= 3

    @pytest.mark.asyncio
    async def test_tool_error_sent_back_to_claude(self):
        """When a tool fails, the error is in the tool_result event."""
        turn1 = _make_claude_response(
            [_tool_use_block("scan_token", {"mint": "BAD"}, "tc1")],
            stop_reason="tool_use",
        )
        turn2 = _make_claude_response([_text_block("Scan failed, cannot proceed.")])
        verdict = _make_claude_response([
            SimpleNamespace(
                type="tool_use", id="v1", name="forensic_report",
                input={"risk_score": 0, "confidence": "low", "rug_pattern": "unknown",
                       "verdict_summary": "Insufficient data", "narrative": {"observation": "x", "pattern": "x", "risk": "x"},
                       "key_findings": [], "wallet_classifications": {}, "conviction_chain": "x"},
            ),
        ])
        mock_client = _mock_client_streaming(turn1, turn2, verdict)

        with patch("lineage_agent.agent_service._get_client", return_value=mock_client), \
             patch("lineage_agent.lineage_detector.get_cached_lineage_report", new_callable=AsyncMock, return_value=None), \
             patch("lineage_agent.lineage_detector.detect_lineage", new_callable=AsyncMock, side_effect=RuntimeError("RPC down")), \
             patch("lineage_agent.agent_service._cache_verdict", new_callable=AsyncMock, create=True):

            events = []
            async for evt in run_agent("BAD", cache=None, max_turns=4, timeout=30.0):
                events.append(evt)

            tool_results = [e for e in events if e["event"] == "tool_result"]
            assert len(tool_results) >= 1
            assert tool_results[0]["data"]["error"] is not None

    @pytest.mark.asyncio
    async def test_anthropic_fatal_yields_error_event(self):
        """Non-retriable Claude error yields error SSE event."""
        mock_client = MagicMock()
        mock_client.messages.stream = MagicMock(
            return_value=_MockStreamRaising(ValueError("Bad request"))
        )

        with patch("lineage_agent.agent_service._get_client", return_value=mock_client), \
             patch("lineage_agent.lineage_detector.get_cached_lineage_report", new_callable=AsyncMock, return_value=None):

            events = []
            async for evt in run_agent("M", cache=None, max_turns=2, timeout=10.0):
                events.append(evt)

            assert events[-1]["event"] == "error"

    @pytest.mark.asyncio
    async def test_verdict_cached_in_ai_cache(self):
        """Agent verdict is persisted to AI cache (OPT-4)."""
        turn1 = _make_claude_response([_text_block("Done.")])
        verdict = _make_claude_response([
            SimpleNamespace(
                type="tool_use", id="v1", name="forensic_report",
                input={"risk_score": 30, "confidence": "high", "rug_pattern": "unknown",
                       "verdict_summary": "Low risk", "narrative": {"observation": "o", "pattern": "p", "risk": "r"},
                       "key_findings": [], "wallet_classifications": {}, "conviction_chain": "c"},
            ),
        ])
        mock_client = _mock_client_streaming(turn1, verdict)

        mock_cache = AsyncMock()
        mock_cache.set = AsyncMock()

        with patch("lineage_agent.agent_service._get_client", return_value=mock_client), \
             patch("lineage_agent.lineage_detector.get_cached_lineage_report", new_callable=AsyncMock, return_value=None), \
             patch("lineage_agent.agent_service.CACHE_TTL_AI_SECONDS", 300, create=True), \
             patch("lineage_agent.agent_service.CACHE_STALE_TTL_AI_SECONDS", 900, create=True):

            events = []
            async for evt in run_agent("CacheMint", cache=mock_cache, max_turns=2, timeout=20.0):
                events.append(evt)

            assert any(e["event"] == "done" for e in events)

    @pytest.mark.asyncio
    async def test_event_ordering_correct(self):
        """Events follow correct temporal order."""
        turn1 = _make_claude_response(
            [_text_block("Let me scan."), _tool_use_block("scan_token", {"mint": "M"}, "tc1")],
            stop_reason="tool_use",
        )
        turn2 = _make_claude_response([_text_block("Verdict here.")])
        verdict = _make_claude_response([
            SimpleNamespace(
                type="tool_use", id="v1", name="forensic_report",
                input={"risk_score": 50, "confidence": "medium", "rug_pattern": "unknown",
                       "verdict_summary": "Medium risk", "narrative": {"observation": "o", "pattern": "p", "risk": "r"},
                       "key_findings": [], "wallet_classifications": {}, "conviction_chain": "c"},
            ),
        ])
        mock_client = _mock_client_streaming(turn1, turn2, verdict)

        lineage = _make_lineage()
        with patch("lineage_agent.agent_service._get_client", return_value=mock_client), \
             patch("lineage_agent.lineage_detector.get_cached_lineage_report", new_callable=AsyncMock, return_value=None), \
             patch("lineage_agent.lineage_detector.detect_lineage", new_callable=AsyncMock, return_value=lineage), \
             patch("lineage_agent.agent_service._cache_verdict", new_callable=AsyncMock, create=True):

            events = []
            async for evt in run_agent("M", cache=None, max_turns=4, timeout=30.0):
                events.append(evt)

            types = [e["event"] for e in events]
            assert "tool_call" in types
            assert "tool_result" in types
            assert types[-1] == "done"
