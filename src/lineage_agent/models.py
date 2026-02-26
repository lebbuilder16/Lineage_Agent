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
    query_is_root: bool = Field(
        False,
        description="True when the scanned token IS the root (original). False means it is a clone.",
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
    # ── New intelligence signals ────────────────────────────────────────────
    deployer_profile: Optional[DeployerProfile] = Field(
        None, description="Historical deployer behaviour profile"
    )
    operator_impact: Optional[OperatorImpactReport] = Field(
        None, description="Cross-wallet operator damage ledger (Initiative 1)"
    )
    sol_flow: Optional[SolFlowReport] = Field(
        None, description="Post-rug SOL capital flow trace (Initiative 2)"
    )
    cartel_report: Optional[CartelReport] = Field(
        None, description="Operator cartel community detection (Initiative 3)"
    )
    insider_sell: Optional[InsiderSellReport] = Field(
        None, description="Silent drain via insider token selling (Initiative 4)"
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
    risk_level: Literal["low", "medium", "high", "critical", "first_rug", "insufficient_data"]
    predicted_window_start: Optional[datetime] = None
    predicted_window_end: Optional[datetime] = None
    confidence_note: str = ""
    sample_count: int = Field(0, description="Number of historical rug samples used")
    confidence_level: Literal["low", "medium", "high"] = Field(
        "low", description="Statistical confidence in the prediction"
    )


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


# ---------------------------------------------------------------------------
# New Initiative 1: Operator Impact Report
# ---------------------------------------------------------------------------

class OperatorImpactReport(BaseModel):
    """Cross-wallet damage ledger for an operator sharing a metadata DNA fingerprint."""

    fingerprint: str = Field(..., description="The 32-char hex DNA fingerprint")
    linked_wallets: list[str] = Field(..., description="All deployer wallets sharing this fingerprint")
    total_tokens_launched: int
    total_rug_count: int
    rug_rate_pct: float = Field(ge=0.0, le=100.0)
    estimated_extracted_usd: float = Field(
        ge=0.0, description="Conservative 15% of rugged mcap estimate"
    )
    is_estimated: bool = Field(
        True, description="True if extraction figure is a 15% heuristic, False if from on-chain trace"
    )
    active_tokens: list[str] = Field(default_factory=list, description="Mints still not rugged")
    narrative_sequence: list[str] = Field(
        default_factory=list,
        description="Narratives exploited, in chronological order of first appearance",
    )
    is_campaign_active: bool = Field(
        default=False, description="True if any wallet had activity in the last 6 hours"
    )
    peak_concurrent_tokens: int = Field(
        default=0, description="Max tokens live simultaneously within a 24h window"
    )
    first_activity: Optional[datetime] = None
    last_activity: Optional[datetime] = None
    wallet_profiles: list[DeployerProfile] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "low"


# ---------------------------------------------------------------------------
# New Initiative 2: Follow The SOL
# ---------------------------------------------------------------------------

class SolFlowEdge(BaseModel):
    """A single SOL transfer edge in the post-rug capital flow graph."""

    from_address: str
    to_address: str
    amount_sol: float = Field(ge=0.0)
    hop: int = Field(ge=0, description="0 = direct from deployer, 1 = one hop away, etc.")
    signature: str = Field(default="", description="Transaction signature")
    block_time: Optional[datetime] = None
    # Identity resolution (populated by classify_address)
    from_label: Optional[str] = Field(None, description="Human-readable label for from_address")
    to_label: Optional[str] = Field(None, description="Human-readable label for to_address")
    entity_type: Optional[str] = Field(None, description="Entity type of to_address (cex, dex, bridge, …)")


class CrossChainExit(BaseModel):
    """A detected cross-chain capital exit via a bridge program."""

    from_address: str = Field(description="Solana wallet that triggered the bridge transaction")
    bridge_name: str = Field(description="Human-readable bridge name (e.g. Wormhole Token Bridge)")
    dest_chain: str = Field(description="Destination chain name (e.g. Ethereum)")
    dest_address: str = Field(default="", description="Destination wallet address on the target chain")
    amount_sol: float = Field(ge=0.0, description="SOL amount sent into the bridge")
    tx_signature: str = Field(default="", description="Solana transaction signature")


class SolFlowReport(BaseModel):
    """Multi-hop SOL capital flow trace for a rugged token."""

    mint: str
    deployer: str
    total_extracted_sol: float = Field(ge=0.0, description="Direct SOL outflows from deployer (hop 0)")
    total_extracted_usd: Optional[float] = Field(None, description="USD value at time of extraction (SOL × market price)")
    flows: list[SolFlowEdge] = Field(default_factory=list)
    terminal_wallets: list[str] = Field(
        default_factory=list,
        description="Final destination wallets never seen as senders",
    )
    known_cex_detected: bool = Field(
        default=False, description="True if any known CEX hot wallet is a recipient"
    )
    hop_count: int = Field(default=1, ge=1, description="Deepest hop reached")
    analysis_timestamp: datetime
    rug_timestamp: Optional[datetime] = Field(
        None, description="Earliest block_time of hop-0 flows (first moment of extraction)"
    )
    cross_chain_exits: list[CrossChainExit] = Field(
        default_factory=list, description="Detected cross-chain bridge exits"
    )


# ---------------------------------------------------------------------------
# New Initiative 3: Cartel Graph
# ---------------------------------------------------------------------------

class CartelEdge(BaseModel):
    """A coordination signal edge between two operator wallets."""

    wallet_a: str
    wallet_b: str
    signal_type: Literal[
        "dna_match", "sol_transfer", "timing_sync", "phash_cluster", "cross_holding",
        "funding_link", "shared_lp", "sniper_ring",
    ]
    signal_strength: float = Field(ge=0.0, le=1.0)
    evidence: dict = Field(default_factory=dict)


class CartelCommunity(BaseModel):
    """A detected cartel cluster — operators with 2+ coordinating signals."""

    community_id: str = Field(..., description="Stable 12-char hex ID derived from wallet set")
    wallets: list[str]
    total_tokens_launched: int
    total_rugs: int
    estimated_extracted_usd: float = Field(ge=0.0)
    active_since: Optional[datetime] = None
    strongest_signal: str = ""
    edges: list[CartelEdge] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "low"


class CartelReport(BaseModel):
    """Cartel graph result for a token's deployer."""

    mint: str
    deployer_community: Optional[CartelCommunity] = None


class FinancialGraphSummary(BaseModel):
    """Summary of financial coordination signals for a deployer."""

    deployer: str
    funding_links: int = Field(0, description="Pre-deploy SOL funding edges found")
    shared_lp_count: int = Field(0, description="Shared LP provider edges found")
    sniper_ring_count: int = Field(0, description="Sniper ring edges found")
    metadata_edges: int = Field(0, description="Original metadata/timing signal edges")
    financial_score: float = Field(
        0.0,
        ge=0.0,
        description=(
            "Composite score: funding×30 + shared_lp×25 + sniper×20 "
            "+ coordinated_launches×15 + metadata×10"
        ),
    )
    edges: list[CartelEdge] = Field(default_factory=list)
    connected_deployers: list[str] = Field(
        default_factory=list,
        description="Other deployer wallets linked via financial signals",
    )


# ---------------------------------------------------------------------------
# Insider sell / silent drain detection
# ---------------------------------------------------------------------------

class InsiderSellEvent(BaseModel):
    """A single wallet's selling activity for a specific mint."""

    wallet: str = Field(..., description="Wallet address (deployer or linked)")
    role: Literal["deployer", "linked"] = Field(
        "deployer", description="Relationship to the token deployer"
    )
    balance_now: float = Field(
        0.0, description="Current token balance for this mint (raw UI amount)"
    )
    exited: bool = Field(
        False, description="True when balance_now == 0 (fully exited position)"
    )


class InsiderSellReport(BaseModel):
    """Silent drain detection: deployer/linked wallet token selling pressure."""

    mint: str

    # ── Market signals from DexScreener (zero extra network calls) ──────
    sell_pressure_1h: Optional[float] = Field(
        None, description="sells/(buys+sells) over last 1 h, 0–1"
    )
    sell_pressure_6h: Optional[float] = Field(
        None, description="sells/(buys+sells) over last 6 h, 0–1"
    )
    sell_pressure_24h: Optional[float] = Field(
        None, description="sells/(buys+sells) over last 24 h, 0–1"
    )
    price_change_1h: Optional[float] = Field(
        None, description="Price % change over last 1 h"
    )
    price_change_6h: Optional[float] = Field(
        None, description="Price % change over last 6 h"
    )
    price_change_24h: Optional[float] = Field(
        None, description="Price % change over last 24 h"
    )
    volume_spike_ratio: Optional[float] = Field(
        None,
        description=(
            "1 h volume divided by average hourly volume (24 h vol / 24). "
            ">3 = burst selling spike."
        ),
    )

    # ── On-chain confirmation (1 RPC call per wallet) ────────────────────
    deployer_exited: Optional[bool] = Field(
        None,
        description="True when the deployer's token balance for this mint is 0",
    )
    wallet_events: list[InsiderSellEvent] = Field(
        default_factory=list,
        description="Per-wallet balance snapshot (deployer + up to 3 linked)",
    )

    # ── Verdict ──────────────────────────────────────────────────────────
    flags: list[str] = Field(
        default_factory=list,
        description=(
            "INSIDER_DUMP_CONFIRMED, ELEVATED_SELL_PRESSURE, "
            "PRICE_CRASH, SELL_BURST, DEPLOYER_EXITED"
        ),
    )
    risk_score: float = Field(
        0.0, ge=0.0, le=1.0,
        description="0 = clean, 1.0 = confirmed insider dump"
    )
    verdict: Literal["clean", "suspicious", "insider_dump"] = Field(
        "clean",
        description="clean | suspicious | insider_dump",
    )
