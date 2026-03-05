"""Tests for /compare endpoint (Feature 3)."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from datetime import datetime, timezone

from lineage_agent.models import LineageResult, TokenMetadata


def _make_meta(mint: str, name: str, symbol: str, deployer: str, image: str = "") -> TokenMetadata:
    return TokenMetadata(
        mint=mint,
        name=name,
        symbol=symbol,
        deployer=deployer,
        image_uri=image,
        created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
        market_cap_usd=100_000.0,
        liquidity_usd=5_000.0,
    )


def _make_lineage(meta: TokenMetadata) -> LineageResult:
    return LineageResult(
        mint=meta.mint,
        root=meta,
        confidence=0.9,
        derivatives=[],
        family_size=1,
        query_token=meta,
        same_deployer=False,
        name_similarity=1.0,
        symbol_similarity=1.0,
        image_similarity=-1.0,
        deployer_score=1.0,
        temporal_score=0.5,
        composite_score=0.9,
        weighted_score=0.9,
        is_derivative=False,
        risk_flag=False,
    )


MINT_A = "So11111111111111111111111111111111111111112"
MINT_B = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"

META_A = _make_meta(MINT_A, "Pepe Token", "PEPE", "DeployerAAA111111111111111111111111111111111")
META_B = _make_meta(MINT_B, "Pepe Coin",  "PEPE2", "DeployerBBB111111111111111111111111111111111")
META_SAME_DEP = _make_meta(MINT_B, "Pepe2", "PEP2", "DeployerAAA111111111111111111111111111111111")

LIN_A = _make_lineage(META_A)
LIN_B = _make_lineage(META_B)
LIN_B_SAME_DEP = _make_lineage(META_SAME_DEP)


@pytest.fixture
def client():
    # Import here to avoid module-level side effects in other tests
    from lineage_agent.api import app
    return TestClient(app)


@pytest.mark.asyncio
async def test_compare_returns_token_compare_result():
    """GET /compare returns a valid TokenCompareResult payload."""
    with patch("lineage_agent.api.detect_lineage", side_effect=[LIN_A, LIN_B]), \
         patch("lineage_agent.similarity.compute_image_similarity", new_callable=AsyncMock, return_value=-1.0):
        from lineage_agent.api import compare_tokens
        from fastapi import Request
        req = MagicMock(spec=Request)
        req.app = MagicMock()
        result = await compare_tokens.__wrapped__(req, mint_a=MINT_A, mint_b=MINT_B)

    assert result.mint_a == MINT_A
    assert result.mint_b == MINT_B
    assert result.name_similarity >= 0.0
    assert result.symbol_similarity >= 0.0
    assert result.image_similarity == -1.0
    assert result.verdict in ("identical_operator", "clone", "related", "unrelated")


@pytest.mark.asyncio
async def test_compare_same_deployer_escalates_verdict():
    """Same-deployer tokens receive at least 'related' verdict."""
    with patch("lineage_agent.api.detect_lineage", side_effect=[LIN_A, LIN_B_SAME_DEP]), \
         patch("lineage_agent.similarity.compute_image_similarity", new_callable=AsyncMock, return_value=-1.0):
        from lineage_agent.api import compare_tokens
        from fastapi import Request
        req = MagicMock(spec=Request)
        req.app = MagicMock()
        result = await compare_tokens.__wrapped__(req, mint_a=MINT_A, mint_b=MINT_B)

    assert result.same_deployer is True
    assert result.verdict in ("identical_operator", "clone", "related")


@pytest.mark.asyncio
async def test_compare_same_mint_raises_400():
    """Using the same mint for both params returns HTTP 400."""
    from lineage_agent.api import compare_tokens
    from fastapi import HTTPException, Request
    req = MagicMock(spec=Request)
    req.app = MagicMock()
    with pytest.raises(HTTPException) as exc_info:
        await compare_tokens.__wrapped__(req, mint_a=MINT_A, mint_b=MINT_A)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_compare_invalid_mint_raises_400():
    from lineage_agent.api import compare_tokens
    from fastapi import HTTPException, Request
    req = MagicMock(spec=Request)
    req.app = MagicMock()
    with pytest.raises(HTTPException) as exc_info:
        await compare_tokens.__wrapped__(req, mint_a="not-valid!", mint_b=MINT_B)
    assert exc_info.value.status_code == 400
