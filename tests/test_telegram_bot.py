"""Tests for the Telegram bot handlers (mocked Telegram + detect_lineage)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lineage_agent.models import (
    DerivativeInfo,
    LineageResult,
    SimilarityEvidence,
    TokenMetadata,
    TokenSearchResult,
)
from lineage_agent.telegram_bot import lineage_cmd, search_cmd, start

# Valid base58 mint for tests (44 chars, no 0/O/I/l)
_VALID_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
_VALID_MINT2 = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"


def _make_update(text: str = "", args: list[str] | None = None):
    """Create a minimal mock Update + Context."""
    update = MagicMock()
    update.message = MagicMock()
    update.message.reply_text = AsyncMock()

    context = MagicMock()
    context.args = args or []
    return update, context


# ------------------------------------------------------------------
# /start
# ------------------------------------------------------------------


class TestStart:

    @pytest.mark.asyncio
    async def test_start_sends_welcome(self):
        update, context = _make_update()
        await start(update, context)
        update.message.reply_text.assert_called_once()
        text = update.message.reply_text.call_args[0][0]
        assert "Meme Lineage Agent" in text
        assert "/lineage" in text
        assert "/search" in text


# ------------------------------------------------------------------
# /lineage
# ------------------------------------------------------------------


class TestLineageCmd:

    @pytest.mark.asyncio
    async def test_no_args(self):
        update, context = _make_update(args=[])
        await lineage_cmd(update, context)
        update.message.reply_text.assert_called_once()
        text = update.message.reply_text.call_args[0][0]
        assert "Usage" in text

    @pytest.mark.asyncio
    async def test_invalid_mint(self):
        """Non-base58 addresses should be rejected immediately."""
        update, context = _make_update(args=["0OIlBadMint"])
        await lineage_cmd(update, context)
        update.message.reply_text.assert_called_once()
        text = update.message.reply_text.call_args[0][0]
        assert "Invalid" in text

    @pytest.mark.asyncio
    async def test_success(self):
        fake_result = LineageResult(
            mint=_VALID_MINT,
            query_token=TokenMetadata(
                mint=_VALID_MINT,
                name="TestToken",
            ),
            root=TokenMetadata(
                mint=_VALID_MINT,
                name="TestToken",
                symbol="TT",
            ),
            confidence=0.92,
            derivatives=[
                DerivativeInfo(
                    mint="DerivMint1",
                    name="Clone1",
                    evidence=SimilarityEvidence(composite_score=0.75),
                    liquidity_usd=5000.0,
                ),
            ],
            family_size=2,
        )

        update, context = _make_update(args=[_VALID_MINT])

        with patch(
            "lineage_agent.telegram_bot.detect_lineage",
            new_callable=AsyncMock,
            return_value=fake_result,
        ):
            await lineage_cmd(update, context)

        # First call = "Analyzing lineage…", second = the result
        assert update.message.reply_text.call_count == 2
        result_text = update.message.reply_text.call_args_list[1][0][0]
        assert "Lineage Card" in result_text
        assert "TestToken" in result_text
        assert "92%" in result_text
        assert "Clone1" in result_text

    @pytest.mark.asyncio
    async def test_error(self):
        """Internal errors should return a generic message, not the traceback."""
        update, context = _make_update(args=[_VALID_MINT])

        with patch(
            "lineage_agent.telegram_bot.detect_lineage",
            new_callable=AsyncMock,
            side_effect=RuntimeError("RPC timeout"),
        ):
            await lineage_cmd(update, context)

        # "Analyzing…" + error message
        assert update.message.reply_text.call_count == 2
        error_text = update.message.reply_text.call_args_list[1][0][0]
        assert "Something went wrong" in error_text
        assert "RPC timeout" not in error_text

    @pytest.mark.asyncio
    async def test_no_derivatives(self):
        fake_result = LineageResult(
            mint=_VALID_MINT,
            root=TokenMetadata(mint=_VALID_MINT, name="Alone"),
            confidence=1.0,
            derivatives=[],
            family_size=1,
        )
        update, context = _make_update(args=[_VALID_MINT])

        with patch(
            "lineage_agent.telegram_bot.detect_lineage",
            new_callable=AsyncMock,
            return_value=fake_result,
        ):
            await lineage_cmd(update, context)

        result_text = update.message.reply_text.call_args_list[1][0][0]
        assert "No derivatives" in result_text

    @pytest.mark.asyncio
    async def test_more_than_five_derivatives(self):
        derivs = [
            DerivativeInfo(
                mint=f"Deriv{i}",
                name=f"Clone{i}",
                evidence=SimilarityEvidence(composite_score=0.5),
            )
            for i in range(8)
        ]
        fake_result = LineageResult(
            mint=_VALID_MINT,
            root=TokenMetadata(mint=_VALID_MINT, name="Root"),
            confidence=0.8,
            derivatives=derivs,
            family_size=9,
        )
        update, context = _make_update(args=[_VALID_MINT])

        with patch(
            "lineage_agent.telegram_bot.detect_lineage",
            new_callable=AsyncMock,
            return_value=fake_result,
        ):
            await lineage_cmd(update, context)

        result_text = update.message.reply_text.call_args_list[1][0][0]
        assert "and 3 more" in result_text


# ------------------------------------------------------------------
# /search
# ------------------------------------------------------------------


class TestSearchCmd:

    @pytest.mark.asyncio
    async def test_no_args(self):
        update, context = _make_update(args=[])
        await search_cmd(update, context)
        text = update.message.reply_text.call_args[0][0]
        assert "Usage" in text

    @pytest.mark.asyncio
    async def test_success(self):
        fake_results = [
            TokenSearchResult(
                mint="MintA",
                name="AlphaToken",
                symbol="ALPHA",
                market_cap_usd=1_000_000.0,
            ),
            TokenSearchResult(
                mint="MintB",
                name="BetaToken",
                symbol="BETA",
            ),
        ]
        update, context = _make_update(args=["alpha"])

        with patch(
            "lineage_agent.telegram_bot.search_tokens",
            new_callable=AsyncMock,
            return_value=fake_results,
        ):
            await search_cmd(update, context)

        text = update.message.reply_text.call_args[0][0]
        assert "AlphaToken" in text
        assert "BetaToken" in text

    @pytest.mark.asyncio
    async def test_no_results(self):
        update, context = _make_update(args=["nonexistent"])

        with patch(
            "lineage_agent.telegram_bot.search_tokens",
            new_callable=AsyncMock,
            return_value=[],
        ):
            await search_cmd(update, context)

        text = update.message.reply_text.call_args[0][0]
        assert "No tokens found" in text

    @pytest.mark.asyncio
    async def test_error(self):
        """Internal errors should return a generic message."""
        update, context = _make_update(args=["crash"])

        with patch(
            "lineage_agent.telegram_bot.search_tokens",
            new_callable=AsyncMock,
            side_effect=RuntimeError("API down"),
        ):
            await search_cmd(update, context)

        text = update.message.reply_text.call_args[0][0]
        assert "Something went wrong" in text
        assert "API down" not in text

    @pytest.mark.asyncio
    async def test_multi_word_query(self):
        """Multiple words should be joined into one query string."""
        update, context = _make_update(args=["baby", "doge", "coin"])

        with patch(
            "lineage_agent.telegram_bot.search_tokens",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_search:
            await search_cmd(update, context)

        mock_search.assert_called_once_with("baby doge coin")
