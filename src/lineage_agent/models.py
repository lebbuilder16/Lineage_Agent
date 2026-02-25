"""
Pydantic models used throughout the Meme Lineage Agent.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

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
    token_standard: str = Field("", description="Token standard from DAS (Fungible, FungibleAsset, etc.)")


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
    deployer: str = ""
    metadata_uri: str = ""
    created_at: Optional[datetime] = None
    market_cap_usd: Optional[float] = None
    liquidity_usd: Optional[float] = None
    evidence: SimilarityEvidence = Field(default_factory=SimilarityEvidence)
    # Multi-generation graph fields
    parent_mint: str = Field("", description="Mint of the direct parent (empty = child of root)")
    generation: int = Field(1, ge=1, description="Generation depth from root (root=0, direct copy=1, copy-of-copy=2…)")


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
    # ── Forensic intelligence signals ──────────────────────────────────────
    zombie_alert: Optional[ZombieAlert] = Field(
        None, description="Resurrection / zombie token detection"
    )
    death_clock: Optional[DeathClockForecast] = Field(
        None, description="Deployer rug timing forecast"
    )
    operator_fingerprint: Optional[OperatorFingerprint] = Field(
        None, description="Cross-wallet operator identity fingerprint"
    )
    liquidity_arch: Optional[LiquidityArchReport] = Field(
        None, description="Cross-DEX liquidity architecture analysis"
    )
    factory_rhythm: Optional[FactoryRhythmReport] = Field(
        None, description="Scripted deployment rhythm detection"
    )
    narrative_timing: Optional[NarrativeTimingReport] = Field(
        None, description="Narrative cycle lifecycle positioning"
    )
    # ── New intelligence signals ────────────────────────────────────────────
    deployer_profile: Optional[DeployerProfile] = Field(
        None, description="Historical deployer behaviour profile"
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
    metadata_uri: str = ""
    price_usd: Optional[float] = None
    market_cap_usd: Optional[float] = None
    liquidity_usd: Optional[float] = None
    dex_url: str = ""
    # Earliest pairCreatedAt across all DexScreener pairs for this mint.
    # Used as fallback when on-chain DAS / sig-walk returns no timestamp.
    pair_created_at: Optional[datetime] = None


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


# ---------------------------------------------------------------------------
# Forensic signal: Zombie Token (resurrection detection)
# ---------------------------------------------------------------------------
class ZombieAlert(BaseModel):
    """A dead token that has been relaunched by the same (or similar) operator."""

    original_mint: str
    original_name: str
    original_rugged_at: Optional[datetime] = None
    original_liq_peak_usd: Optional[float] = None
    resurrection_mint: str
    image_similarity: float = Field(ge=0.0, le=1.0)
    same_deployer: bool
    confidence: Literal["confirmed", "probable", "possible"]


# ---------------------------------------------------------------------------
# Forensic signal: Death Clock (deployer rug timing forecast)
# ---------------------------------------------------------------------------
class DeathClockForecast(BaseModel):
    """Statistical forecast of when a token may be rugged, based on deployer history."""

    deployer: str
    historical_rug_count: int
    median_rug_hours: float
    stdev_rug_hours: float
    elapsed_hours: float
    risk_level: Literal["low", "medium", "high", "critical", "insufficient_data"]
    predicted_window_start: Optional[datetime] = None
    predicted_window_end: Optional[datetime] = None
    confidence_note: str = ""


# ---------------------------------------------------------------------------
# Forensic signal: Operator Fingerprint (cross-wallet identity)
# ---------------------------------------------------------------------------
class OperatorFingerprint(BaseModel):
    """Same metadata DNA detected across multiple deployer wallets."""

    fingerprint: str
    linked_wallets: list[str]
    upload_service: str
    description_pattern: str
    confidence: Literal["confirmed", "probable"]
    # Tokens launched by each linked wallet, keyed by wallet address
    linked_wallet_tokens: dict[str, list[DeployerTokenSummary]] = Field(
        default_factory=dict,
        description="Tokens launched by each linked wallet (from intelligence_events)",
    )


# ---------------------------------------------------------------------------
# Forensic signal: Liquidity Architecture (cross-DEX authenticity)
# ---------------------------------------------------------------------------
class LiquidityArchReport(BaseModel):
    """Analysis of how liquidity is distributed across DEX pools."""

    total_liquidity_usd: float
    pool_count: int
    pools: dict[str, float]
    concentration_hhi: float = Field(ge=0.0, le=1.0)
    liq_to_volume_ratio: Optional[float] = None
    authenticity_score: float = Field(ge=0.0, le=1.0)
    flags: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Forensic signal: Factory Rhythm (scripted deployment detection)
# ---------------------------------------------------------------------------
class FactoryRhythmReport(BaseModel):
    """Detects statistically regular token deployment patterns (bot/script)."""

    tokens_launched: int
    median_interval_hours: float
    regularity_score: float = Field(ge=0.0, le=1.0)
    naming_pattern: Literal["incremental", "themed", "random"]
    factory_score: float = Field(ge=0.0, le=1.0)
    is_factory: bool


# ---------------------------------------------------------------------------
# Forensic signal: Narrative Timing Index (lifecycle positioning)
# ---------------------------------------------------------------------------
class NarrativeTimingReport(BaseModel):
    """Positions this token within the historical lifecycle of its narrative category."""

    narrative: str
    sample_size: int
    status: Literal["early", "rising", "peak", "late", "insufficient_data"]
    cycle_percentile: Optional[float] = None
    momentum_score: Optional[float] = None
    days_since_peak: Optional[int] = None
    peak_date: Optional[datetime] = None
    interpretation: Optional[str] = None


# ---------------------------------------------------------------------------
# Forensic signal: Deployer Intelligence (historical operator behaviour)
# ---------------------------------------------------------------------------
class DeployerTokenSummary(BaseModel):
    """One token deployed by a wallet — condensed for the profile view."""

    mint: str
    name: str = ""
    symbol: str = ""
    created_at: Optional[datetime] = None
    rugged_at: Optional[datetime] = None
    mcap_usd: Optional[float] = None
    narrative: str = ""


class DeployerProfile(BaseModel):
    """Historical behaviour profile for a deployer wallet."""

    address: str
    total_tokens_launched: int
    rug_count: int
    rug_rate_pct: float = Field(ge=0.0, le=100.0)
    avg_lifespan_days: Optional[float] = None
    active_tokens: int
    preferred_narrative: str = ""
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    tokens: list[DeployerTokenSummary] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "low"


