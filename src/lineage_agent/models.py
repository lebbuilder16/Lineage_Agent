"""
Pydantic models used throughout the Meme Lineage Agent.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# RFC 9457 Problem Details for HTTP APIs
# ---------------------------------------------------------------------------
class ProblemDetail(BaseModel):
    """RFC 9457 structured error response.

    Serialises to ``application/problem+json``.
    """

    type: str = "about:blank"
    title: str
    status: int
    detail: str = ""
    instance: str = ""

    model_config = {"extra": "allow"}


# ---------------------------------------------------------------------------
# Shared forensic context enums
# ---------------------------------------------------------------------------
class LifecycleStage(str, Enum):
    """Minimal token lifecycle stages used to gate downstream signals."""

    UNKNOWN = "unknown"
    LAUNCHPAD_CURVE_ONLY = "launchpad_curve_only"
    MIGRATION_PENDING = "migration_pending"
    DEX_LISTED = "dex_listed"


class MarketSurface(str, Enum):
    """Observed market surface for the token."""

    NO_MARKET_OBSERVED = "no_market_observed"
    LAUNCHPAD_CURVE_ONLY = "launchpad_curve_only"
    DEX_POOL_OBSERVED = "dex_pool_observed"
    CONFLICTING = "conflicting"


class DataApplicability(str, Enum):
    """Whether a signal is valid for the token's current context."""

    OBSERVED = "observed"
    UNAVAILABLE = "unavailable"
    NOT_APPLICABLE = "not_applicable"
    CONFLICTING = "conflicting"


class EvidenceLevel(str, Enum):
    """Strength of evidence behind a forensic conclusion."""

    NONE = "none"
    WEAK = "weak"
    MODERATE = "moderate"
    STRONG = "strong"


class RugMechanism(str, Enum):
    """Typed negative-outcome classes used by rug analytics."""

    UNKNOWN = "unknown"
    DEX_LIQUIDITY_RUG = "dex_liquidity_rug"
    LIQUIDITY_DRAIN_RUG = "liquidity_drain_rug"
    PRE_DEX_EXTRACTION_RUG = "pre_dex_extraction_rug"
    MARKET_DUMP = "market_dump"
    UNPROVEN_ABANDONMENT = "unproven_abandonment"
    DEAD_TOKEN = "dead_token"


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
    pair_created_at: Optional[datetime] = Field(
        None,
        description=(
            "Earliest DexScreener pairCreatedAt — when the token was first listed on a DEX. "
            "Distinct from created_at which reflects the on-chain mint initialisation. "
            "When pair_created_at >> created_at the token was stealth pre-minted."
        ),
    )
    launch_platform: Optional[str] = Field(
        None,
        description="Detected launch platform (moonshot, pumpfun, letsbonk, believe) when known",
    )
    lifecycle_stage: LifecycleStage = Field(
        LifecycleStage.UNKNOWN,
        description="Minimal lifecycle stage used to validate downstream forensic signals",
    )
    market_surface: MarketSurface = Field(
        MarketSurface.NO_MARKET_OBSERVED,
        description="Observed market surface for this token at scan time",
    )
    reason_codes: list[str] = Field(
        default_factory=list,
        description="Short deterministic reasons explaining platform/stage classification",
    )
    evidence_level: EvidenceLevel = Field(
        EvidenceLevel.WEAK,
        description="Strength of evidence supporting the market context classification",
    )
    # DexScreener market signals — populated by pairs_to_metadata
    volume_24h_usd: Optional[float] = Field(None, description="24h trading volume in USD")
    txns_24h_buys: Optional[int] = Field(None, description="24h buy transaction count")
    txns_24h_sells: Optional[int] = Field(None, description="24h sell transaction count")
    price_change_24h: Optional[float] = Field(None, description="24h price change %")
    price_change_1h: Optional[float] = Field(None, description="1h price change %")
    boost_count: Optional[int] = Field(None, description="DexScreener active boost count")
    socials: list[dict] = Field(default_factory=list, description="Social links [{type, url}]")


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
    evidence: SimilarityEvidence = Field(default_factory=lambda: SimilarityEvidence())
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
    bundle_report: Optional["BundleExtractionReport"] = Field(
        None, description="Bundle wallet forensic analysis — pre+post sell behavior with verified extraction (Initiative 5)"
    )

    # ── Platform / lifecycle context ─────────────────────────────────────
    is_bonding_curve: bool = Field(
        default=False,
        description="True when token is on a bonding curve launchpad (Moonshot, PumpFun, LetsBonk).",
    )
    platform: Optional[str] = Field(
        default=None,
        description="Launchpad platform identifier ('moonshot', 'pump-fun', 'letsbonk') or None for DEX direct.",
    )
    scanned_at: Optional[datetime] = Field(
        None, description="UTC timestamp of when this analysis was computed (not when served from cache)"
    )


# ---------------------------------------------------------------------------
# Bundle wallet tracking  (Initiative 5)
# ---------------------------------------------------------------------------

class BundleWallet(BaseModel):
    """A wallet that participated in the launch bundle."""

    address: str
    sol_spent: float = Field(0.0, description="SOL spent buying the token at launch")
    funded_by_deployer: bool = Field(
        False,
        description="True when deployer sent SOL to this wallet within 72 h before launch",
    )
    sol_returned_to_deployer: float = Field(
        0.0, description="SOL this wallet sent back to the deployer after selling"
    )
    exited: bool = Field(
        False, description="True when current token balance == 0 (fully sold out)"
    )
    current_token_balance: Optional[float] = Field(
        None, description="Current token balance (UI amount)"
    )


class BundleReport(BaseModel):
    """Bundle wallet analysis: early coordinated buyers at token launch."""

    mint: str
    deployer: str

    bundle_wallets: list[BundleWallet] = Field(
        default_factory=list,
        description="All wallets detected in the launch bundle",
    )
    total_sol_spent_by_bundle: float = Field(
        0.0, description="Total SOL deployed by all bundle wallets at launch"
    )
    total_sol_returned_to_deployer: float = Field(
        0.0, description="Total SOL confirmed flowing back to deployer post-sell"
    )
    total_usd_extracted: Optional[float] = Field(
        None, description="USD equivalent of SOL extracted (at time of analysis)"
    )
    confirmed_linked_wallets: int = Field(
        0, description="Number of bundle wallets confirmed linked to the deployer"
    )
    verdict: Literal["clean", "suspected_bundle", "confirmed_bundle"] = Field(
        "clean",
        description="clean | suspected_bundle | confirmed_bundle",
    )
    launch_slot: Optional[int] = Field(
        None, description="Solana slot number of the token launch"
    )


# ---------------------------------------------------------------------------
# Initiative 5 — Forensic Bundle Analysis (pre+post sell behavior)
# ---------------------------------------------------------------------------

class BundleWalletVerdict(str, Enum):
    """Per-wallet attribution verdict — confirmed only when on-chain proof exists."""
    CONFIRMED_TEAM   = "confirmed_team"    # direct on-chain link to deployer
    SUSPECTED_TEAM   = "suspected_team"    # indirect / circumstantial link
    COORDINATED_DUMP = "coordinated_dump"  # coordinated but no deployer link
    EARLY_BUYER      = "early_buyer"       # no signals — genuine buyer


class FundDestination(BaseModel):
    """A SOL destination detected in post-sell outflow tracing."""
    destination: str
    lamports: int = Field(0, ge=0)
    hop: int = Field(0, ge=0, description="0 = direct, 1 = one hop from sell wallet")
    link_to_deployer: bool = Field(False, description="Destination is deployer or deployer-linked")
    seen_in_other_bundles: bool = Field(False, description="Same destination seen from ≥2 bundle wallets")


class PreSellBehavior(BaseModel):
    """Behavior of a bundle wallet BEFORE selling its token position."""
    wallet_age_days: Optional[float] = Field(None, description="Days since first on-chain activity")
    is_dormant: bool = Field(False, description="True if wallet had no activity for >30 days before launch")
    prefund_source: Optional[str] = Field(None, description="Address that funded this wallet before launch")
    prefund_sol: float = Field(0.0, description="SOL received in funding transfer")
    prefund_hours_before_launch: Optional[float] = Field(None, description="Hours between funding and launch")
    prefund_source_is_deployer: bool = Field(False, description="Prefund source is the token deployer")
    prefund_source_is_known_funder: bool = Field(False, description="Prefund source also funded other bundle wallets")
    pre_launch_tx_count: int = Field(0, ge=0, description="Number of txs in 72h before launch")
    pre_launch_unique_tokens: int = Field(0, ge=0, description="Unique token mints interacted with before launch")
    prior_bundle_count: int = Field(0, ge=0, description="Times this wallet appeared in earlier bundles (any deployer)")
    same_deployer_prior_launches: int = Field(0, ge=0, description="Prior launches by same deployer where this wallet bundled")


class PostSellBehavior(BaseModel):
    """Behavior of a bundle wallet AFTER selling its token position."""
    sell_detected: bool = Field(False, description="On-chain full-exit sell confirmed")
    sell_slot: Optional[int] = Field(None, description="Slot of the detected sell transaction")
    sell_tx_signature: Optional[str] = Field(None, description="Signature of the sell transaction")
    sol_received_from_sell: float = Field(0.0, ge=0.0, description="SOL received when selling")
    fund_destinations: list[FundDestination] = Field(
        default_factory=list,
        description="SOL destinations traced ≤2 hops after sell, only post-sell txs",
    )
    direct_transfer_to_deployer: bool = Field(
        False, description="Wallet sent SOL directly to deployer after selling"
    )
    transfer_to_deployer_linked_wallet: bool = Field(
        False, description="Wallet sent SOL to a wallet also linked to deployer"
    )
    indirect_via_intermediary: bool = Field(
        False, description="Multi-hop path from this wallet back to deployer confirmed"
    )
    common_destination_with_other_bundles: bool = Field(
        False, description="≥2 bundle wallets sent SOL to the same destination"
    )


class BundleWalletAnalysis(BaseModel):
    """Complete forensic analysis of a single bundle wallet."""
    wallet: str = Field(..., description="Wallet public key")
    sol_spent: float = Field(0.0, ge=0.0, description="SOL spent buying token at launch")
    pre_sell: PreSellBehavior = Field(default_factory=lambda: PreSellBehavior())
    post_sell: PostSellBehavior = Field(default_factory=lambda: PostSellBehavior())
    red_flags: list[str] = Field(
        default_factory=list,
        description="Human-readable evidence flags that drove the verdict",
    )
    verdict: BundleWalletVerdict = Field(
        BundleWalletVerdict.EARLY_BUYER,
        description="Attribution verdict — only elevated when on-chain proof exists",
    )


class BundleExtractionReport(BaseModel):
    """Forensic bundle extraction report — on-chain proof required before team attribution."""
    mint: str
    deployer: str
    launch_slot: Optional[int] = None

    bundle_wallets: list[BundleWalletAnalysis] = Field(
        default_factory=list,
        description="Per-wallet forensic breakdown",
    )

    # Categorised wallet lists (public keys)
    confirmed_team_wallets: list[str] = Field(
        default_factory=list,
        description="Wallets with direct on-chain deployer link",
    )
    suspected_team_wallets: list[str] = Field(
        default_factory=list,
        description="Wallets with indirect / circumstantial deployer link",
    )
    coordinated_dump_wallets: list[str] = Field(
        default_factory=list,
        description="Coordinated wallets without proved deployer link",
    )
    early_buyer_wallets: list[str] = Field(
        default_factory=list,
        description="Wallets with no adverse signals",
    )

    # Aggregates
    total_sol_spent_by_bundle: float = Field(0.0, ge=0.0)
    total_sol_extracted_confirmed: float = Field(
        0.0, ge=0.0,
        description="SOL confirmed returning to deployer-linked addresses",
    )
    total_usd_extracted: Optional[float] = Field(None, description="USD at time of analysis")

    # Cross-wallet patterns
    common_prefund_source: Optional[str] = Field(
        None, description="Address that funded multiple bundle wallets before launch"
    )
    factory_address: Optional[str] = Field(
        None,
        description=(
            "Wallet that funded ≥2 bundle wallets and/or the deployer — "
            "the orchestrating entity behind the launch"
        ),
    )
    factory_funded_deployer: bool = Field(
        False,
        description="factory_address also sent SOL to the deployer wallet before launch",
    )
    factory_sniper_wallets: list[str] = Field(
        default_factory=list,
        description="Bundle wallets confirmed funded by factory_address",
    )
    common_sink_wallets: list[str] = Field(
        default_factory=list,
        description="Destination wallets that received funds from ≥2 bundle wallets",
    )
    coordinated_sell_detected: bool = Field(
        False, description="≥3 bundle wallets sold within 5 slots of each other"
    )

    # Verdict and evidence
    overall_verdict: Literal[
        "confirmed_team_extraction",
        "suspected_team_extraction",
        "coordinated_dump_unknown_team",
        "early_buyers_no_link_proven",
    ] = Field(
        "early_buyers_no_link_proven",
        description="Global extraction verdict — requires concrete proof for higher severity",
    )
    evidence_chain: list[str] = Field(
        default_factory=list,
        description="Ordered list of on-chain evidence items supporting the verdict",
    )
    analysis_timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
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
class MarketSignals(BaseModel):
    """Live market health indicators used to adjust the Death Clock risk level."""

    liquidity_usd: Optional[float] = Field(None, description="Current liquidity in the main DEX pool (USD)")
    market_cap_usd: Optional[float] = Field(None, description="Current market cap (USD)")
    liq_to_mcap_ratio: Optional[float] = Field(
        None, ge=0.0, description="Liquidity / market-cap ratio (< 0.01 is suspicious)"
    )
    price_change_h1_pct: Optional[float] = Field(None, description="Price change over the last hour (%)")
    volume_h1_usd: Optional[float] = Field(None, description="1-hour trading volume (USD)")
    sell_pressure_pct: Optional[float] = Field(
        None, ge=0.0, le=100.0, description="% of transactions that are sells in the last hour"
    )
    volume_trend: Literal["declining", "stable", "rising"] = Field(
        "stable", description="Directionality of recent trading volume"
    )
    adjusted_risk_boost: float = Field(
        0.0, ge=0.0, le=3.0,
        description="Additive boost applied to the timing risk_level (0 = no change, 3 = max escalation)",
    )


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
    market_signals: Optional[MarketSignals] = Field(
        None, description="Live market signals that may elevate the risk level"
    )
    total_negative_outcome_count: int = Field(
        0, description="Total rug/negative outcomes for this deployer"
    )
    basis_breakdown: dict[str, int] = Field(
        default_factory=dict,
        description="Rug mechanism distribution (from confirmed predictive rugs)",
    )
    is_factory: bool = Field(
        False,
        description="True when the deployer exhibits factory-like launch rhythm (new wallet per token)",
    )
    prediction_basis: Literal["deployer", "operator", "insufficient"] = Field(
        "insufficient",
        description=(
            "'deployer' = samples from this wallet only; "
            "'operator' = aggregated from linked wallets sharing the same DNA fingerprint; "
            "'insufficient' = no usable samples found"
        ),
    )
    operator_sample_count: int = Field(
        0, description="Number of rug timing samples sourced from operator-network sibling deployers"
    )
    rug_probability_pct: Optional[float] = Field(
        None,
        description=(
            "Composite rug probability 0–99 combining timing position, "
            "statistical confidence and live market signals. Null when no prediction is possible."
        ),
    )
    deployer_profile_summary: Optional[str] = Field(
        None,
        description=(
            "Human-readable deployer context when timing prediction is unavailable. "
            "E.g. 'First-time deployer, 1 token launched, 0 rugs, wallet age 2h'."
        ),
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
    rug_mechanism: Optional[str] = None
    evidence_level: Optional[str] = None
    mcap_usd: Optional[float] = None
    narrative: str = ""


class DeployerProfile(BaseModel):
    """Historical behaviour profile for a deployer wallet."""

    address: str
    total_tokens_launched: int
    rug_count: int
    confirmed_rug_count: int = Field(0, description="Rugs with strong/moderate evidence")
    dead_token_count: int = Field(0, description="Tokens that faded on DEX without active extraction")
    negative_outcome_count: int = Field(0, description="Total negative outcomes (rugs + dead tokens)")
    rug_rate_pct: float = Field(ge=0.0, le=100.0)
    confirmed_rug_rate_pct: float = Field(0.0, ge=0.0, le=100.0)
    negative_outcome_rate_pct: float = Field(0.0, ge=0.0, le=100.0, description="(rugs + dead) / total")
    avg_lifespan_days: Optional[float] = None
    active_tokens: int
    rug_mechanism_counts: dict[str, int] = Field(default_factory=dict)
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
    total_confirmed_rug_count: int = Field(0, description="Rugs with strong/moderate evidence")
    total_dead_token_count: int = Field(0, description="Tokens that faded on DEX without active extraction")
    total_negative_outcome_count: int = Field(0, description="Total negative outcomes (rugs + dead)")
    rug_rate_pct: float = Field(ge=0.0, le=100.0)
    confirmed_rug_rate_pct: float = Field(0.0, ge=0.0, le=100.0)
    negative_outcome_rate_pct: float = Field(0.0, ge=0.0, le=100.0, description="(rugs + dead) / total")
    estimated_extracted_usd: float = Field(
        ge=0.0, description="Conservative 15% of rugged mcap estimate"
    )
    is_estimated: bool = Field(
        True, description="True if extraction figure is a 15% heuristic, False if from on-chain trace"
    )
    rug_mechanism_counts: dict[str, int] = Field(default_factory=dict)
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
    flow_context: Optional[str] = Field(
        None,
        description="Nature of this flow: 'protocol_fee', 'deployer_outflow', 'wallet_transfer', 'unknown'",
    )


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
    total_extracted_sol: float = Field(ge=0.0, description="Direct SOL outflows from deployer (hop 0) — does NOT imply theft; see extraction_context")
    total_extracted_usd: Optional[float] = Field(None, description="USD value at time of extraction (SOL × market price)")
    extraction_context: Optional[str] = Field(
        None,
        description=(
            "Contextual interpretation: "
            "'confirmed_extraction' (deployer exited + SOL moved), "
            "'suspicious_outflow' (high sell pressure + SOL moved), "
            "'deployer_operational' (deployer still holds tokens, SOL likely fees/costs), "
            "'protocol_fees_only' (all flows are from/to launchpad programs)"
        ),
    )
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
    liquidity_is_sol_denominated: bool = Field(
        default=True,
        description="False when all trading pairs use USDC/non-SOL as quote token. "
                    "When False, SOL flows represent infrastructure costs (rent, fees, launchpad), "
                    "not value extraction — actual extraction would appear via USDC.",
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
        "funding_link", "shared_lp", "sniper_ring", "factory_deploy", "factory_sniper",
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
    total_sol_extracted: float = Field(0.0, ge=0.0, description="Real SOL extracted from on-chain sol_flows")
    narrative: str = Field("", description="Human-readable cartel summary for the mobile app")
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
    balance_context: Optional[str] = Field(
        None,
        description="'zero_balance_expected_by_protocol' for bonding-curve pre-DEX tokens",
    )


class InsiderSellReport(BaseModel):
    """Silent drain detection: deployer/linked wallet token selling pressure."""

    mint: str
    launch_platform: Optional[str] = None
    lifecycle_stage: LifecycleStage = Field(default=LifecycleStage.UNKNOWN)
    market_surface: MarketSurface = Field(default=MarketSurface.NO_MARKET_OBSERVED)
    applicability: DataApplicability = Field(default=DataApplicability.UNAVAILABLE)
    evidence_level: EvidenceLevel = Field(default=EvidenceLevel.WEAK)
    reason_codes: list[str] = Field(default_factory=list)

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

    # ── On-chain activity fallback (when DexScreener txns unavailable) ───
    onchain_tx_count_1h: Optional[int] = Field(
        None, description="On-chain tx count for mint in last 1 h (RPC fallback)"
    )
    onchain_tx_count_6h: Optional[int] = Field(
        None, description="On-chain tx count for mint in last 6 h (RPC fallback)"
    )
    onchain_tx_count_24h: Optional[int] = Field(
        None, description="On-chain tx count for mint in last 24 h (RPC fallback)"
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

    # ── Data coverage ─────────────────────────────────────────────────────
    data_coverage: Literal["full", "partial", "onchain_only", "none"] = Field(
        "none",
        description=(
            "'full' = DexScreener txns + on-chain balance available; "
            "'partial' = some DexScreener data but incomplete txns; "
            "'onchain_only' = only RPC balance/activity, no market signals; "
            "'none' = no data could be retrieved"
        ),
    )
    data_coverage_note: Optional[str] = Field(
        None,
        description="Human-readable explanation of why data is limited (e.g. 'Token < 12h, DexScreener has no txn history yet')",
    )

    # ── Platform context ──────────────────────────────────────────────────
    is_bonding_curve: bool = Field(
        default=False,
        description=(
            "True when the token is on a bonding curve launchpad (Moonshot, PumpFun, LetsBonk). "
            "Sell pressure reflects normal user activity through the curve PDA, NOT deployer selling."
        ),
    )
    platform: Optional[str] = Field(
        default=None,
        description="Platform identifier: 'moonshot', 'pump-fun', 'letsbonk', or None for DEX direct.",
    )


# ---------------------------------------------------------------------------
# Token pair comparison
# ---------------------------------------------------------------------------

class TokenCompareResult(BaseModel):
    """Side-by-side similarity analysis between two tokens."""

    mint_a: str
    mint_b: str
    token_a: Optional[TokenMetadata] = None
    token_b: Optional[TokenMetadata] = None
    same_deployer: bool = False
    same_family: bool = Field(
        False,
        description="True if one token appears in the lineage derivatives of the other",
    )
    name_similarity: float = Field(0.0, ge=0.0, le=1.0)
    symbol_similarity: float = Field(0.0, ge=0.0, le=1.0)
    image_similarity: float = Field(
        -1.0,
        ge=-2.0,
        le=1.0,
        description="-1 = no image URL, -2 = image fetch failed/timed-out, [0,1] = similarity score",
    )
    temporal_score: float = Field(
        0.5,
        ge=0.0,
        le=1.0,
        description="Directional age signal: 1.0 = token_a is significantly older, 0.5 = same age / unknown, 0.0 = token_a is significantly newer",
    )
    metadata_uri_match: bool = Field(
        False, description="Both tokens share the exact same on-chain metadata URI"
    )
    image_url_match: bool = Field(
        False, description="Both tokens share the exact same image URL"
    )
    same_token_program: bool = Field(
        False,
        description="Both mints are owned by the same non-standard SPL program (custom token program)",
    )
    composite_score: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Weighted composite of name + symbol + image + temporal signals",
    )
    verdict: Literal["identical_operator", "clone", "related", "unrelated"] = "unrelated"
    verdict_reasons: list[str] = Field(
        default_factory=list,
        description="Human-readable explanations for the verdict",
    )


# ---------------------------------------------------------------------------
# Global statistics dashboard
# ---------------------------------------------------------------------------

class NarrativeCount(BaseModel):
    narrative: str
    count: int


class TopToken(BaseModel):
    """A token ranked by intelligence-event activity in the last 24 hours."""

    mint: str = Field(..., description="Solana mint address")
    name: str = Field("", description="Token name")
    symbol: str = Field("", description="Token symbol")
    narrative: Optional[str] = Field(None, description="Detected narrative/theme")
    mcap_usd: Optional[float] = Field(None, description="Market cap USD at last event")
    event_count: int = Field(1, description="Number of intelligence events in 24 h")
    created_at: Optional[str] = Field(None, description="ISO timestamp of first detection")
    image_uri: Optional[str] = Field(None, description="Token logo URL from DexScreener")


class GlobalStats(BaseModel):
    """Aggregate intelligence activity stats for the last 24 hours."""

    tokens_scanned_24h: int = Field(0, description="Distinct token mints recorded")
    tokens_rugged_24h: int = Field(0, description="Tokens confirmed rugged")
    rug_rate_24h_pct: float = Field(0.0, ge=0.0, le=100.0, description="rug / scanned × 100")
    tokens_negative_outcomes_24h: int = Field(
        0, description="Tokens with any negative outcome (rug + suspected) in 24 h"
    )
    negative_outcome_rate_24h_pct: float = Field(
        0.0, ge=0.0, le=100.0,
        description="negative outcomes / scanned × 100",
    )
    active_deployers_24h: int = Field(0, description="Distinct deployer wallets active")
    top_narratives: list[NarrativeCount] = Field(
        default_factory=list,
        description="Top 5 narratives by token count in the last 24 h",
    )
    db_events_total: int = Field(0, description="Total rows in intelligence_events table")
    last_updated: datetime = Field(
        default_factory=lambda: datetime.now(tz=timezone.utc)
    )


# ---------------------------------------------------------------------------
# Scan history & evolution tracking
# ---------------------------------------------------------------------------

class ScanSnapshot(BaseModel):
    """Compact representation of a single user-triggered scan for a token."""

    snapshot_id: int = Field(0, description="DB row id")
    user_id: int = Field(..., description="User who triggered the scan")
    mint: str = Field(..., description="Solana mint address scanned")
    scanned_at: datetime = Field(..., description="UTC timestamp of the scan")
    scan_number: int = Field(1, ge=1, description="1-indexed scan count for this (user, mint) pair")

    # ── Risk summary ───────────────────────────────────────────────────────
    risk_score: int = Field(0, ge=0, le=100, description="Heuristic risk score 0-100")
    flags: list[str] = Field(
        default_factory=list,
        description=(
            "Active signal flags at scan time: BUNDLE_CONFIRMED, BUNDLE_SUSPECTED, "
            "COORDINATED_DUMP, INSIDER_DUMP, INSIDER_SUSPICIOUS, ZOMBIE_ALERT, "
            "DEATH_CLOCK_CRITICAL, DEATH_CLOCK_HIGH, FACTORY_DETECTED, "
            "CARTEL_LINKED, SERIAL_RUGGER"
        ),
    )

    # ── Key metrics ────────────────────────────────────────────────────────
    family_size: int = Field(0, description="Total family members at scan time")
    rug_count: int = Field(0, description="Deployer rug count at scan time")
    confirmed_rug_count: int = Field(0, description="Confirmed rugs (strong/moderate evidence) at scan time")
    negative_outcome_count: int = Field(0, description="Total negative outcomes at scan time")
    death_clock_risk: str = Field("", description="Death Clock risk_level at scan time")
    bundle_verdict: str = Field("", description="Bundle overall_verdict at scan time")
    insider_verdict: str = Field("", description="Insider sell verdict at scan time")
    zombie_detected: bool = Field(False, description="Zombie alert detected at scan time")

    # ── Token identity ─────────────────────────────────────────────────────
    token_name: str = Field("", description="Token name at scan time")
    token_symbol: str = Field("", description="Token symbol at scan time")


class ScanDelta(BaseModel):
    """Evolution between two consecutive scans for the same (user, mint)."""

    mint: str
    current_scan: ScanSnapshot
    previous_scan: ScanSnapshot
    scan_number: int = Field(..., description="Current scan number (≥2)")

    # ── Score evolution ────────────────────────────────────────────────────
    risk_score_delta: int = Field(
        description="risk_score change: positive = worsened, negative = improved"
    )
    new_flags: list[str] = Field(
        default_factory=list,
        description="Flags present in current scan but not in previous",
    )
    resolved_flags: list[str] = Field(
        default_factory=list,
        description="Flags present in previous scan but absent in current (improvement signal)",
    )

    # ── Context evolution ──────────────────────────────────────────────────
    family_size_delta: int = Field(0, description="Change in derivative count")
    rug_count_delta: int = Field(0, description="Additional rugs by deployer since last scan")
    confirmed_rug_count_delta: int = Field(0, description="Additional confirmed rugs since last scan")

    # ── Verdict ────────────────────────────────────────────────────────────
    trend: Literal["worsening", "stable", "improving"] = Field(
        "stable",
        description=(
            "worsening: risk_delta>5 or new critical flags; "
            "improving: risk_delta<-5 or flags resolved; "
            "stable: otherwise"
        ),
    )

    # ── LLM narrative (populated on /history/{mint}/delta?narrate=true) ───
    narrative: Optional[str] = Field(
        None,
        description="1-2 sentence plain-English summary of what changed since the last scan",
    )
