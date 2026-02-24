"""
Pydantic models used throughout the Meme Lineage Agent.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Token metadata
# ---------------------------------------------------------------------------
class TokenMetadata(BaseModel):
    """On‑chain and off‑chain metadata for a single token."""

    mint: str = Field(..., description="Solana mint address")
    name: str = Field("", description="Human-readable token name")
    symbol: str = Field("", description="Ticker / symbol")
    image_uri: str = Field("", description="URL to the token logo")
    deployer: str = Field("", description="Address that deployed/created the token")
    created_at: Optional[datetime] = Field(
        None, description="On-chain creation timestamp"
    )
    market_cap_usd: Optional[float] = Field(
        None, description="Current market capitalisation in USD"
    )
    liquidity_usd: Optional[float] = Field(
        None, description="Total liquidity in USD"
    )
    price_usd: Optional[float] = Field(None, description="Current token price in USD")
    dex_url: str = Field("", description="DexScreener URL for this token")
    metadata_uri: str = Field("", description="Metaplex metadata URI (off-chain JSON)")


# ---------------------------------------------------------------------------
# Similarity evidence
# ---------------------------------------------------------------------------
class SimilarityEvidence(BaseModel):
    """Per-dimension similarity scores between two tokens."""

    name_score: float = Field(0.0, ge=0.0, le=1.0)
    symbol_score: float = Field(0.0, ge=0.0, le=1.0)
    image_score: float = Field(0.0, ge=0.0, le=1.0)
    deployer_score: float = Field(0.0, ge=0.0, le=1.0)
    temporal_score: float = Field(0.0, ge=0.0, le=1.0)
    composite_score: float = Field(0.0, ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# Derivative info
# ---------------------------------------------------------------------------
class DerivativeInfo(BaseModel):
    """Information about a single suspected derivative / clone."""

    mint: str
    name: str = ""
    symbol: str = ""
    image_uri: str = ""
    created_at: Optional[datetime] = None
    market_cap_usd: Optional[float] = None
    liquidity_usd: Optional[float] = None
    evidence: SimilarityEvidence = Field(default_factory=SimilarityEvidence)


# ---------------------------------------------------------------------------
# Lineage result  (the main output)
# ---------------------------------------------------------------------------
class LineageResult(BaseModel):
    """Full lineage detection result returned by ``detect_lineage``."""

    mint: str = Field(..., description="The queried mint address")
    root: Optional[TokenMetadata] = Field(
        None, description="The detected root / original token"
    )
    confidence: float = Field(
        0.0, ge=0.0, le=1.0, description="Confidence in root selection"
    )
    derivatives: list[DerivativeInfo] = Field(
        default_factory=list,
        description="Suspected clones / derivatives",
    )
    family_size: int = Field(0, description="Total family members (root + derivatives)")
    query_token: Optional[TokenMetadata] = Field(
        None, description="Metadata of the queried token"
    )


# ---------------------------------------------------------------------------
# Search result  (for /search endpoint)
# ---------------------------------------------------------------------------
class TokenSearchResult(BaseModel):
    """A token returned from a search query."""

    mint: str
    name: str = ""
    symbol: str = ""
    image_uri: str = ""
    price_usd: Optional[float] = None
    market_cap_usd: Optional[float] = None
    liquidity_usd: Optional[float] = None
    dex_url: str = ""


# ---------------------------------------------------------------------------
# Batch request / response (for POST /lineage/batch)
# ---------------------------------------------------------------------------
class BatchLineageRequest(BaseModel):
    """Request body for the batch lineage endpoint."""

    mints: list[str] = Field(
        ..., min_length=1, max_length=10, description="1-10 Solana mint addresses"
    )


class BatchLineageResponse(BaseModel):
    """Response for a batch lineage request."""

    results: dict[str, LineageResult | str] = Field(
        ...,
        description="Mapping mint → LineageResult on success or error string on failure",
    )
