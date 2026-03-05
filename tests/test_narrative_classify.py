"""Tests for the LLM-enhanced narrative classifier (Feature 1)."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from lineage_agent.utils import classify_narrative, classify_narrative_llm, _narrative_llm_cache


# ---------------------------------------------------------------------------
# classify_narrative (sync / keyword) — regression tests
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("name,symbol,expected", [
    ("Baby Pepe 2.0", "BPEPE", "pepe"),
    ("DOGE KING",     "DOGEKING", "doge"),
    ("Shiba Inu",     "SHIB",  "inu"),
    ("AI Agent GPT",  "AIGPT", "ai"),
    ("Trump Maga",    "MAGA",  "trump"),
    ("Cat Token",     "CAT",   "cat"),
    ("Totally Random XYZ", "XYZ", "other"),
])
def test_classify_narrative_keyword(name, symbol, expected):
    """Keyword path returns precise categories without any external call."""
    assert classify_narrative(name, symbol) == expected


# ---------------------------------------------------------------------------
# classify_narrative_llm — fast path (no Claude call when keyword matches)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_classify_narrative_llm_fast_path_no_llm_call():
    """When the keyword path succeeds, the LLM is never called."""
    with patch("lineage_agent.utils.os.getenv", return_value="fake-key"), \
         patch("lineage_agent.utils.anthropic", create=True) as mock_anthropic:
        result = await classify_narrative_llm("Pepe Moon", "PEPEMOON")
    assert result == "pepe"
    mock_anthropic.AsyncAnthropic.assert_not_called()


# ---------------------------------------------------------------------------
# classify_narrative_llm — LLM slow path (called only for "other" tokens)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_classify_narrative_llm_calls_claude_for_other():
    """Only tokens that return 'other' from keyword matching call Claude."""
    # Clear cache to ensure a fresh call
    _narrative_llm_cache.pop("Totally Unknown Token:UNKNOWN", None)

    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="goat")]
    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(return_value=mock_response)

    # We patch at the utils import site so no real anthropic import is needed
    mock_anthropic_module = MagicMock()
    mock_anthropic_module.AsyncAnthropic = MagicMock(return_value=mock_client)

    with patch("lineage_agent.utils.os.getenv", return_value="fake-api-key"), \
         patch.dict("sys.modules", {"anthropic": mock_anthropic_module}):
        result = await classify_narrative_llm("Totally Unknown Token", "UNKNOWN")

    assert result == "goat"
    mock_client.messages.create.assert_called_once()


@pytest.mark.asyncio
async def test_classify_narrative_llm_cache_prevents_second_call():
    """Cache hit for (name, symbol) prevents a second LLM call."""
    _narrative_llm_cache["CachedToken:CACHED"] = "bear"

    mock_client = AsyncMock()
    mock_anthropic_module = MagicMock()
    mock_anthropic_module.AsyncAnthropic = MagicMock(return_value=mock_client)
    with patch.dict("sys.modules", {"anthropic": mock_anthropic_module}), \
         patch("lineage_agent.utils.os.getenv", return_value="fake-key"):
        result1 = await classify_narrative_llm("CachedToken", "CACHED")
        result2 = await classify_narrative_llm("CachedToken", "CACHED")

    assert result1 == "bear"
    assert result2 == "bear"
    mock_client.messages.create.assert_not_called()


@pytest.mark.asyncio
async def test_classify_narrative_llm_no_api_key_returns_other(caplog):
    """Without ANTHROPIC_API_KEY the function returns 'other' and logs a warning."""
    _narrative_llm_cache.pop("NarrativelessToken:NONE", None)

    import logging
    with patch("lineage_agent.utils.os.getenv", return_value=""), \
         caplog.at_level(logging.WARNING, logger="lineage_agent.utils"):
        result = await classify_narrative_llm("NarrativelessToken", "NONE")

    assert result == "other"
    assert "ANTHROPIC_API_KEY" in caplog.text


@pytest.mark.asyncio
async def test_classify_narrative_llm_llm_failure_returns_other(caplog):
    """When the LLM call raises, 'other' is returned and the error is logged (not silent)."""
    _narrative_llm_cache.pop("ErrorXYZToken:ERRXYZ", None)

    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(side_effect=RuntimeError("network error"))
    mock_anthropic_module = MagicMock()
    mock_anthropic_module.AsyncAnthropic = MagicMock(return_value=mock_client)

    import logging
    with patch("lineage_agent.utils.os.getenv", return_value="fake-key"), \
         patch.dict("sys.modules", {"anthropic": mock_anthropic_module}), \
         caplog.at_level(logging.WARNING, logger="lineage_agent.utils"):
        result = await classify_narrative_llm("ErrorXYZToken", "ERRXYZ")

    assert result == "other"
    assert "LLM call failed" in caplog.text


@pytest.mark.asyncio
async def test_classify_narrative_llm_unknown_llm_response_returns_other():
    """When Claude returns an unexpected category, 'other' is used as safe default."""
    _narrative_llm_cache.pop("WeirdXYZToken:WXYZ", None)

    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="absolutely_not_a_category")]
    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(return_value=mock_response)
    mock_anthropic_module = MagicMock()
    mock_anthropic_module.AsyncAnthropic = MagicMock(return_value=mock_client)

    with patch("lineage_agent.utils.os.getenv", return_value="fake-key"), \
         patch.dict("sys.modules", {"anthropic": mock_anthropic_module}):
        result = await classify_narrative_llm("WeirdXYZToken", "WXYZ")

    assert result == "other"
