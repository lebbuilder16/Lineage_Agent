"""Unit tests for Pydantic models."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from lineage_agent.models import (
    DerivativeInfo,
    LineageResult,
    SimilarityEvidence,
    TokenMetadata,
    TokenSearchResult,
)


class TestTokenMetadata:
    def test_minimal(self):
        t = TokenMetadata(mint="abc123")
        assert t.mint == "abc123"
        assert t.name == ""
        assert t.symbol == ""
        assert t.deployer == ""
        assert t.created_at is None
        assert t.price_usd is None

    def test_full(self):
        t = TokenMetadata(
            mint="abc123",
            name="TestToken",
            symbol="TST",
            image_uri="https://img.example.com/t.png",
            deployer="deployer_addr",
            created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
            market_cap_usd=1_000_000.0,
            liquidity_usd=500_000.0,
            price_usd=0.01,
            dex_url="https://dex.example.com",
        )
        assert t.name == "TestToken"
        assert t.market_cap_usd == 1_000_000.0


class TestSimilarityEvidence:
    def test_defaults(self):
        e = SimilarityEvidence()
        assert e.name_score == 0.0
        assert e.composite_score == 0.0

    def test_valid_ranges(self):
        e = SimilarityEvidence(
            name_score=0.5,
            symbol_score=1.0,
            image_score=0.0,
            deployer_score=0.8,
            temporal_score=0.3,
            composite_score=0.6,
        )
        assert e.composite_score == 0.6

    def test_out_of_range_rejected(self):
        with pytest.raises(ValidationError):
            SimilarityEvidence(name_score=1.5)

        with pytest.raises(ValidationError):
            SimilarityEvidence(composite_score=-0.1)


class TestDerivativeInfo:
    def test_minimal(self):
        d = DerivativeInfo(mint="mintaddr")
        assert d.mint == "mintaddr"
        assert d.evidence.composite_score == 0.0


class TestLineageResult:
    def test_minimal(self):
        r = LineageResult(mint="queryMint")
        assert r.mint == "queryMint"
        assert r.root is None
        assert r.derivatives == []
        assert r.family_size == 0

    def test_with_data(self):
        root = TokenMetadata(mint="rootMint", name="Root")
        r = LineageResult(
            mint="queryMint",
            root=root,
            confidence=0.85,
            derivatives=[DerivativeInfo(mint="deriv1")],
            family_size=2,
        )
        assert r.confidence == 0.85
        assert len(r.derivatives) == 1

    def test_confidence_out_of_range(self):
        with pytest.raises(ValidationError):
            LineageResult(mint="m", confidence=1.5)


class TestTokenSearchResult:
    def test_minimal(self):
        r = TokenSearchResult(mint="m")
        assert r.mint == "m"
        assert r.name == ""
