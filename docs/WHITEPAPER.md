# Meme Lineage Agent: Agentic Multi-Signal Forensics for Solana Token Families

**Version 1.0 — March 2026**

> *"The problem is not that scammers copy tokens. The problem is that nobody can prove it."*

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Introduction: The Memecoin Identity Problem](#2-introduction-the-memecoin-identity-problem)
3. [Background and Related Work](#3-background-and-related-work)
4. [System Architecture](#4-system-architecture)
5. [Token Similarity Engine](#5-token-similarity-engine)
6. [Forensic Intelligence Signals](#6-forensic-intelligence-signals)
7. [Heuristic Pre-Scoring](#7-heuristic-pre-scoring)
8. [AI Analysis Layer](#8-ai-analysis-layer)
9. [Data Model and Output Schema](#9-data-model-and-output-schema)
10. [Evaluation and Limitations](#10-evaluation-and-limitations)
11. [Threat Model and Adversarial Robustness](#11-threat-model-and-adversarial-robustness)
12. [Conclusion and Roadmap](#12-conclusion-and-roadmap)
13. [References](#13-references)

---

## 1. Abstract

The Solana blockchain hosts over one million new token launches per month, the majority created through permissionless launchpads such as PumpFun. This volume has enabled a systematic exploitation pattern: operators deploy a recognisable token (name, logo, ticker), accumulate significant liquidity, extract capital via rug pull or coordinated dump, then redeploy near-identical tokens targeting the same audience — exploiting both community memory and search-engine proximity. Existing tooling identifies individual scam tokens in isolation but lacks the capability to reconstruct operator identity, cross-token lineage, and forward-looking risk derived from historical behaviour.

**Meme Lineage Agent (MLA)** is an agentic forensic platform that groups Solana tokens into *family trees*, maps the human operators behind them across wallet boundaries, and delivers risk assessments combining 13 independent on-chain signals with a two-tier large language model (LLM) reasoning layer. The system operates without privileged data access, relying exclusively on public Solana RPC, DexScreener, and Jupiter endpoints.

Key contributions:

- A five-dimensional similarity engine (name, symbol, image perceptual hash, deployer, temporal) enabling cross-wallet family reconstruction
- Thirteen independent forensic signals spanning identity attribution, financial flow, and token lifecycle
- A heuristic pre-scoring mechanism that deterministically routes queries to an appropriate LLM tier before inference
- A structured `conviction_chain` output field enforcing causal deduction chains rather than summary-style verdicts
- A deployable open-source implementation (FastAPI + Next.js) with sub-60-second full analysis latency

The system is available at [https://lineage-agent.fly.dev](https://lineage-agent.fly.dev). Business model to be announced.

---

## 2. Introduction: The Memecoin Identity Problem

### 2.1 Scale of the Problem

Between January 2024 and March 2026, an estimated 18 million tokens were created on Solana, with approximately 1.1 million new deployments per month at peak velocity [1]. The overwhelming majority are short-lived: median lifespan under 48 hours, median peak liquidity under $10,000. Within this long tail, a measurable subset — operators running what we term *serial clone campaigns* — account for a disproportionate share of documented retail losses.

The mechanism is consistent:

1. **Seed**: Deploy a token with high narrative resonance (political, meme, AI-themed).
2. **Accumulate**: Drive organic and manufactured volume via coordinated early buys (Jito bundles).
3. **Extract**: Drain liquidity pool or silently sell team wallets over hours/days.
4. **Repeat**: Redeploy a near-identical token — same logo with minor pixel modification, same ticker, recycled description — targeting traders who search for the original.

By the third or fourth generation, the family tree can contain 20+ tokens, with each deployment incorporating lessons from the previous rug's forensic exposure. The operator's effective anonymity is maintained by cycling deployer wallets while preserving metadata signatures detectable only via cross-transaction analysis.

### 2.2 Why Existing Tools Fail

Current Solana analytics tools address this problem inadequately for three structural reasons:

**Single-token scope.** Most risk tools (RugCheck, DeFiLlama risk scores, GoPlus) evaluate a token in isolation. A token may score "low risk" on its first deployment because the deployer wallet has no prior rug history — by design.

**No operator attribution.** The concept of an *operator* — one human controlling multiple wallets across multiple token campaigns — is absent from existing schemas. Wallet-level analysis cannot capture cross-wallet coordination unless the operator makes a direct SOL transfer, which sophisticated actors avoid.

**Reactive not predictive.** Tools that identify "rug pull" do so after the liquidity withdrawal. The forensic value decays rapidly as the operator moves to the next token. MLA introduces the *Death Clock* signal, which provides a probabilistic window of the next rug based on the operator's historical rhythm.

### 2.3 Our Approach

MLA reframes the problem: rather than scoring a token, it scores an **operator's campaign** and places the query token within its family context. The family tree is the primary output; the AI risk score is derived from it.

---

## 3. Background and Related Work

### 3.1 Existing Analytics Platforms

| Platform | Strength | Gap |
|---|---|---|
| **DexScreener** | Real-time pair data, volume, price | No lineage, no deployer history |
| **RugCheck** | Static risk score, holder concentration | Single-token, post-hoc |
| **Birdeye** | Price alerts, portfolio tracking | No operator attribution |
| **BubbleMaps** | Holder clustering visualisation | Holdings only, not deployments |
| **Solscan / Explorer** | Raw transaction data | Requires manual forensic work |
| **Metabase on-chain analytics** | SQL over historical data | No real-time, no ML layer |

No existing public tool performs multi-signal, cross-wallet, real-time operator attribution for Solana memecoins.

### 3.2 Academic Precedents

Pump-and-dump detection on Ethereum has been studied by Victor & Weintraud [2] and Hamrick et al. [3], with graph-based wallet clustering as the primary method. Solana's account model and the PumpFun bonding curve mechanism introduce unique forensic surfaces not covered by EVM literature: Jito bundle detection, PDA-derived pool addresses, and the `getTokenAccountsByOwner` RPC method enabling zero-cost deployer balance probing.

LLM-assisted blockchain forensics is an emerging area [4], with prior work focusing on smart contract auditing (Ethereum) rather than token operator attribution. MLA uses LLMs not for code analysis but for **causal deduction across heterogeneous structured signals** — a qualitatively different task.

### 3.3 Perceptual Hashing for Token Logo Analysis

Logo similarity via perceptual hash (pHash) has precedent in copyright detection [5] and NFT plagiarism tools, but its application to memecoin clone detection is novel. Standard pHash operates on 8×8 DCT coefficients (64-bit fingerprint), with Hamming distance as a similarity measure. A threshold of ≤8 bits differing (≥87.5% similarity) empirically captures modified logos while rejecting false positives from unrelated tokens with similar dominant colours.

---

## 4. System Architecture

### 4.1 Overview

MLA is composed of a Python/FastAPI backend, a Next.js frontend, and an SQLite persistence layer. All forensic computation occurs in the backend; the frontend renders the lineage graph (ReactFlow), financial flows (D3), and AI narrative.

```
┌──────────────────── Client Request ─────────────────────┐
│  REST API  ·  WebSocket  ·  SSE Stream  ·  Telegram Bot  │
└───────────────────────────┬─────────────────────────────┘
                            │
                ┌───────────▼────────────┐
                │   detect_lineage()      │
                │   (lineage_detector.py) │
                └───────────┬────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
  DexScreener API    Solana JSON-RPC      Jupiter API
  (pairs, metadata)  (deployer, timestamps) (SOL price)
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │  Enriched token data
                ┌───────────▼──────────────┐
                │  Similarity Engine        │
                │  5D scoring (similarity.py)│
                └───────────┬──────────────┘
                            │  Family graph
                ┌───────────▼──────────────┐
                │  Forensic Signal Layer    │
                │  13 concurrent signals    │
                └───────────┬──────────────┘
                            │  Structured signals
                ┌───────────▼──────────────┐
                │  Heuristic Pre-Scorer     │
                │  _heuristic_score()       │
                └───────────┬──────────────┘
                            │  score 0–100
              ┌─────────────▼──────────────┐
              │     AI Analysis Layer       │
              │  Haiku (score<55)           │
              │  Sonnet (score≥55)          │
              └─────────────┬──────────────┘
                            │
              ┌─────────────▼──────────────┐
              │   SQLite Cache              │
              │   TTL 300s  key:lineage:v4  │
              └────────────────────────────┘
```

### 4.2 Analysis Pipeline (8 Steps)

The core `detect_lineage` function executes an ordered, partially concurrent pipeline:

| Step | Operation | Concurrency |
|---|---|---|
| 1 | Fetch DexScreener pairs for query token | Sequential |
| 2 | Enrich query token: deployer RPC + DAS getAsset + Jupiter price | Concurrent (3 tasks) |
| 3 | Search candidate tokens: name + symbol + deployer strategies | Concurrent (3 strategies) |
| 4 | Enrich candidates: deployer + creation timestamp on-chain | Concurrent (N tasks, batched) |
| 5 | Compute pairwise 5D similarity scores | Sequential |
| 6 | Select root token (earliest by creation time within cluster) | Sequential |
| 7 | Assign family generations (BFS from root) | Sequential |
| 8 | Compute 13 forensic signals | Concurrent (13 tasks) |

### 4.3 Caching Strategy

Results are cached in SQLite with a two-tier strategy:

- **Lineage cache** (`lineage:v4:{mint}`, TTL configurable, default 300s): full `LineageResult` JSON
- **AI cache** (`ai:v2:{mint}`, TTL 300s): Claude output specifically, to avoid redundant LLM calls

Cache invalidation is version-keyed: incrementing the version suffix (`v4`, `v2`) globally invalidates all entries without database migration.

### 4.4 Circuit Breakers

Each external dependency (DexScreener, Helius RPC, Anthropic) is wrapped in a circuit breaker with configurable failure thresholds. This prevents cascade failures from a single flaky upstream from degrading the entire analysis pipeline. Health state is exposed via `/health`.

---

## 5. Token Similarity Engine

### 5.1 Five-Dimensional Scoring

Token similarity is computed as a weighted sum of five independent dimensions:

$$S(A, B) = \sum_{i=1}^{5} w_i \cdot s_i(A, B)$$

| Dimension | Algorithm | Default Weight | Detection Threshold |
|---|---|---|---|
| **Name** | Levenshtein ratio, case-normalised | 25% | ≥ 0.75 |
| **Symbol** | Levenshtein ratio, uppercase, exact=1.0 | 15% | ≥ 0.80 |
| **Image** | pHash 8×8 DCT, Hamming distance normalised | 25% | ≥ 0.85 |
| **Deployer** | Exact match (1.0) or OperatorFingerprint (0.8) | 20% | > 0.0 |
| **Temporal** | Linear decay by relative creation lag | 15% | — |

If a dimension's data is unavailable (e.g., no logo URI), its weight is redistributed proportionally across the remaining dimensions, preserving the sum-to-1 invariant.

### 5.2 Perceptual Hashing Implementation

Logo similarity uses the `imagehash` library with an 8×8 pHash. The resulting 64-bit fingerprint captures the low-frequency DCT coefficients of the image, making it invariant to:

- JPEG/PNG recompression
- Minor brightness/contrast adjustments
- Small pixel modifications in high-frequency regions

It is **not** invariant to cropping, rotation beyond ~5°, or colour palette inversion — known evasion vectors documented in Section 11.

Hamming distance $d \leq 8$ (threshold $\geq 0.875$ normalised) is used for detection. This threshold was set empirically to minimise false positives from unrelated tokens that share a dominant coloured background.

### 5.3 Root Selection

Within a detected family cluster, the root token is the member with the earliest on-chain creation timestamp. Generation numbers are then assigned via BFS from the root: direct derivatives of the root are generation 1, their derivatives are generation 2, and so on. This produces a directed acyclic graph (DAG) encoded in the `DerivativeInfo` model's `generation` and `parent_mint` fields.

### 5.4 Deployer Cross-Wallet Attribution

A key insight is that same-deployer detection is insufficient: sophisticated operators cycle deployer wallets. The `OperatorFingerprint` signal (Section 6.1) augments deployer matching by providing a 32-character hex identity derived from metadata upload patterns, bridging apparent wallet discontinuity.

---

## 6. Forensic Intelligence Signals

Thirteen signals are computed concurrently after family reconstruction using asyncio. Each signal is independently valuable; the AI layer synthesises them in Section 8.

### 6.1 Identity Signals

#### Operator DNA Fingerprint

Each token deployment leaves a metadata "DNA" signature derived from: the image storage service endpoint, the Metaplex description structure, and auxiliary URI patterns. These are hashed into a 32-character hex fingerprint.

When multiple deployer wallets share the same fingerprint, MLA infers a single human operator. Confidence levels are `confirmed` (exact fingerprint match) or `probable` (partial pattern match). This signal enables family detection even when the operator deliberately changes deployer wallets between campaigns.

#### Cartel Detection

Cartel detection identifies *inter-operator coordination* — multiple distinct operators acting collectively. Eight edge types are tracked between operator nodes in a coordination graph:

| Edge Type | Signal | Threshold |
|---|---|---|
| `dna_match` | Shared DNA fingerprint | Exact |
| `sol_transfer` | Direct SOL transfer between deployers | > 0.1 SOL |
| `timing_sync` | Same-narrative launches within window | ≤ 30 minutes |
| `phash_cluster` | Near-identical logos across operators | Hamming ≤ 8 bits |
| `cross_holding` | Deployer B holds tokens deployed by A | Any amount |
| `funding_link` | Pre-deployment SOL funding in window | 72h before launch |
| `shared_lp` | Same wallet provides initial liquidity | Same address |
| `sniper_ring` | Coordinated early buys across different deployers | Same slot window |

Community detection uses the Louvain algorithm [6] with edge weights derived from signal strength. Community identity is stable: `sha256(sorted_wallet_addresses)[:12]`. A composite financial score weights funding (×0.30), LP (×0.25), sniper (×0.20), timing (×0.15), and metadata (×0.10) signals.

#### Factory Rhythm

Operators running scripted campaigns deploy tokens at predictable intervals. The factory rhythm signal measures:

- Median inter-deployment interval (seconds)
- Standard deviation of intervals (regularity indicator)
- Naming pattern classification: `incremental`, `themed`, or `random`
- Narrative taxonomy membership (20+ categories: pepe, ai, cat, dog, political, trump, etc.)

The `is_factory` flag triggers when regularity exceeds empirical thresholds, indicating automated batch deployment rather than organic separate projects.

### 6.2 Financial Signals

#### Bundle Detection (5-Phase Jito Pipeline)

Jito bundles allow multiple transactions to be included atomically within a single Solana slot (~400ms). Bundle detection traces coordinated early buying across 5 phases:

**Phase 1 — Window Detection**: Identify wallets that bought within 20 slots (~8 seconds) of pool creation. Capped at `MAX_BUNDLE_WALLETS = 15` to avoid false positives from popular launches.

**Phase 2 — Pre-Sell Behaviour**: For each candidate wallet: wallet age, dormancy period (flagged if > 30 days inactive), funding source (traced 72h before launch), prior bundle participations in MLA's database.

**Phase 3 — Post-Sell Tracing**: BFS up to 2 hops after sell transactions. Destination identification: deployer wallet, CEX addresses (frozen set in constants), cross-chain bridge addresses.

**Phase 4 — Cross-Wallet Coordination**: Common funder detection, simultaneous sell timing (≤200 slots ≈ 80 seconds), common sink detection (≥2 wallets routing to same destination).

**Phase 5 — Verdict**: Attribution is conservative and evidence-bound:
- `confirmed_team_extraction`: direct wallet linkage to deployer proven
- `suspected_team_extraction`: strong circumstantial convergence
- `coordinated_dump_unknown_team`: coordination proven, operator identity not established
- `early_buyers_no_link_proven`: timing consistent with bundle but no coordination evidence

PumpFun PDA addresses are derived in pure Python without external SDKs, enabling deployment in any environment.

#### SOL Flow Trace (BFS Multi-Hop)

Post-rug capital flows are traced using a Breadth-First Search across the Solana transaction graph:

- **Minimum transfer threshold**: 0.1 SOL (100,000,000 lamports) — filters dust and fees
- **Maximum depth**: 3 hops from initial rug transaction
- **Terminal wallet identification**: destinations with high out-degree and no further tracked exits
- **CEX detection**: hardcoded frozenset of known exchange deposit addresses
- **Cross-chain detection**: Wormholescan API integration — identifies capital exiting Solana via bridge protocols (Wormhole, Allbridge, etc.)

The `rug_timestamp` field is set to the block time of the root hop-0 transaction, enabling correlation with price chart data.

#### Insider Sell Detection

Rug-by-LP-removal is the most detectable exit; insider sell (gradual team wallet liquidation) is historically harder to detect. MLA combines two data sources:

**Source 1 (zero RPC cost)**: DexScreener buy/sell transaction counts at 1h, 6h, 24h windows plus price change percentages. Sell pressure ratios are computed as `sells / (buys + sells)`.

**Source 2 (1 RPC call per wallet)**: `getTokenAccountsByOwner` balance probing for known deployer/team wallets.

Thresholds:
- Sell pressure suspicious: ≥ 55% | elevated: ≥ 65%
- Price crash suspicious: ≤ −30% | severe: ≤ −50%
- Volume spike: > 3× rolling hourly average

Verdict `insider_dump` requires: `deployer_exited = true` AND (`sell_pressure_24h ≥ 65%` OR `price_change_24h ≤ −50%`).

#### Operator Impact Report

A cross-wallet ledger aggregating financial damage attributed to an operator's full campaign history:

- **SOL extraction estimate**: tiered heuristic applied to peak market cap — 40% if < $5k, 30% if < $50k, 15% if < $500k, 8% if ≥ $500k
- **`is_campaign_active`**: activity detected within the last 6 hours
- **`peak_concurrent_tokens`**: maximum tokens simultaneously live (24-hour sliding window, computed with `bisect` for efficiency)
- **Narrative sequence**: chronological timeline of all known tokens in the operator's history

### 6.3 Lifecycle Signals

#### Death Clock

The Death Clock provides a probabilistic forecast of the time remaining until the next rug pull, based on the operator's documented rug history.

Algorithm:
1. Query `intelligence_events` for `token_rugged` events attributed to this deployer
2. Compute time-to-rug for each event: `rug_timestamp − creation_timestamp`
3. Forecast window: `[median − σ, median + σ]`, where σ is capped at `2 × median` to prevent absurd upper bounds
4. Single-sample mode (n=1): symmetric ±50% band around the single observation

Confidence tiers:
- `low`: n < 2 samples
- `medium`: 2 ≤ n < 5
- `high`: n ≥ 5

Risk levels: `low / medium / high / critical / first_rug / insufficient_data`

The `first_rug` level specifically flags cases where this is the deployer's first observed rug — historically indicative of a newly-created operator wallet, and therefore a high-priority monitoring target.

#### Zombie Token / Resurrection Detection

A zombie token is a previously-dead token (liquidity < $100) relaunched by the same or fingerprint-matched operator. Resurrection is confirmed when:

- The token's deployer matches a known operator OR perceptual hash similarity exceeds threshold
- The prior token is tagged `token_rugged` in the intelligence database

Confidence levels follow the same `confirmed / probable / possible` taxonomy used across MLA signals.

#### Rug Sweep (Background Monitor)

A background process running every 15 minutes scans all tokens meeting both conditions:

- Liquidity at creation time > $500 (meaningful initial deployment)
- Created within the last 48 hours (active monitoring window)

If current liquidity < $100 (`DEAD_LIQUIDITY_USD`), the token is marked as rugged in the DB, and `trace_sol_flow` is launched asynchronously (fire-and-forget) with bundle wallet addresses as additional BFS seeds.

#### Liquidity Architecture

Liquidity authenticity analysis using DexScreener data only (zero additional RPC calls):

- **HHI (Herfindahl-Hirschman Index)**: measures concentration of liquidity across trading pairs. Near-1.0 HHI on a single pool with no secondary markets indicates artificial liquidity.
- **Liquidity/Volume ratio**: anomalously high ratio suggests wash trading.
- **Flags**: `FRAGMENTED_LIQUIDITY`, `CRITICAL_LOW_VOLUME`, `POSSIBLE_DEPLOYER_LP_ONLY`

---

## 7. Heuristic Pre-Scoring

### 7.1 Purpose

Before invoking the LLM, MLA computes a deterministic integer score in [0, 100] from the 13 signal outputs. This score serves two functions:

1. **Model routing**: scores ≥ 55 route to Claude Sonnet 4.6 (higher capability, higher cost); scores < 55 use Claude Haiku 4.5
2. **Prompt anchoring**: the score is injected into the Claude prompt as a labelled weak signal, preventing the model from anchoring on it while providing useful calibration

### 7.2 Scoring Rules

| Signal Condition | Points |
|---|---|
| Bundle verdict: `confirmed_team_extraction` | +45 |
| Bundle verdict: `suspected_team_extraction` | +30 |
| Bundle verdict: `coordinated_dump_unknown_team` | +20 |
| Coordinated sell detected | +10 |
| Deployer rug count ≥ 5 | +25 |
| Deployer rug count ≥ 2 | +15 |
| Deployer rug count ≥ 1 | +8 |
| Number of derivatives × 3 (cap 15) | 0 to +15 |
| Zombie alert active | +15 |
| Insider sell verdict: `insider_dump` | +20 |
| Insider sell verdict: `suspicious` | +10 |
| `deployer_exited = true` | +15 |
| Death clock risk: `critical` | +15 |
| Death clock risk: `high` | +10 |
| `is_factory = true` | +10 |
| Cartel report present | +15 |
| Deployer rug rate ≥ 60% | +15 |
| Deployer rug rate ≥ 30% | +8 |
| SOL extracted ≥ 20 SOL | +20 |
| SOL extracted ≥ 5 SOL | +12 |
| SOL extracted ≥ 1 SOL | +6 |
| pHash cluster with rugged reuses | +10 |

The score is capped at 100. Points are additive but non-overlapping within each tier group (e.g., only the highest-matching bundle tier is applied).

### 7.3 Routing Rationale

The threshold of 55 was selected to balance cost and capability:

- Tokens with heuristic < 55 are statistically likely to have sparse signal — Haiku's lower reasoning capability is sufficient to produce a coherent "low risk" or "inconclusive" verdict.
- Tokens ≥ 55 have at least 2–3 corroborating signals and benefit from Sonnet's stronger multi-step deduction capability, particularly for the `conviction_chain` field.

A self-fulfilling prophecy bias is actively avoided: the score is presented to Claude as a "weak signal" with explicit instruction to reason from raw data first.

---

## 8. AI Analysis Layer

### 8.1 Architecture

Claude is invoked via the Anthropic `tool_use` API, which enforces structured output without post-processing regex. The `forensic_report` tool schema acts as a hard contract: Claude must emit a JSON object conforming to the schema or the call fails (retried up to 2 times with exponential backoff: 3s, 6s).

Parameters:
- `max_tokens = 2500`
- `temperature = 0` — deterministic output for caching and reproducibility
- `timeout = 55s` — below Fly.io's 60s request timeout
- Retry on: `RateLimitError`, `APITimeoutError`, `overloaded_error`

### 8.2 Analysis Scope Anchoring

A critical design decision: **the AI analysis is anchored exclusively to the query token**. Clone tokens in the family tree are provided as *enrichment context only* — the system prompt explicitly prohibits scoring them.

This is enforced via the `_SYSTEM_PROMPT` "ANALYSIS SCOPE" block and reinforced in `_build_prompt` by labelling headers:

```
=== ⚑ TOKEN BEING ANALYZED — YOUR PRIMARY SUBJECT ===
...query token data...

=== FAMILY CONTEXT (enrichment only — do NOT score these tokens) ===
...derivative tokens data...
```

Without this constraint, early prototypes produced verdicts averaging clone signals rather than analysing the query token specifically — a systematic error when the query token is the root of an otherwise-rugged family.

### 8.3 The `conviction_chain` Field

The `conviction_chain` field is the primary qualitative output innovation. Unlike a `verdict_summary` (one-sentence conclusion), it is a structured deductive chain:

**Constraint**: 2–3 sentences that must:
- Name ≥ 3 independent converging signals
- Articulate the causal or temporal chain between them
- Include the weakest assumption underlying the verdict
- Acknowledge conflicting signals where present

Example structural output:
> "Bundle forensics [FINANCIAL] confirm team extraction within 8 seconds of pool creation, converging with operator DNA fingerprint [IDENTITY] linking this wallet to 4 prior rugs; the death clock [LIFECYCLE] places current token within the 12–48h historical rug window. Weakest assumption: cross-wallet DNA match has `probable` rather than `confirmed` confidence — disputed if deployer intentionally mimicked a known operator's metadata style."

This format prevents hallucinated certainty: by requiring the weakest assumption to be named explicitly, the model is constrained from producing uniformly high-confidence verdicts regardless of signal quality.

### 8.4 Output Schema

```json
{
  "risk_score": 0,
  "confidence": "low | medium | high",
  "rug_pattern": "classic_rug | slow_rug | pump_dump | coordinated_bundle | factory_jito_bundle | serial_clone | insider_drain | unknown",
  "verdict_summary": "≤20-word summary about the query token",
  "narrative": {
    "observation": "2–3 sentences — converging red flags",
    "pattern": "Causal timeline: staging → accumulation → exit → destination",
    "risk": "Damage quantification + residual risk"
  },
  "key_findings": [
    "[DEPLOYMENT] ...",
    "[FINANCIAL] ...",
    "[IDENTITY] ..."
  ],
  "wallet_classifications": {
    "WALLET_12CHARS": "team_wallet | bundle_wallet | sink_wallet | cex | bridge"
  },
  "conviction_chain": "Causal deduction chain with named weakest assumption",
  "operator_hypothesis": "WHO + playbook + differentiator, or null"
}
```

### 8.5 Rule-Based Fallback

If the Anthropic API is unavailable (circuit open or timeout), `_rule_based_fallback()` produces a deterministic score from the same heuristic rules as `_heuristic_score`. The fallback result is cached with a reduced TTL (max 60 seconds) to ensure the next request attempts real AI analysis quickly. The `confidence` field is set to `low` on fallback results, and `verdict_summary` explicitly states the AI-unavailable condition.

---

## 9. Data Model and Output Schema

### 9.1 Primary Types

The `LineageResult` Pydantic v2 model is the canonical API output:

```
LineageResult
├── query_token: TokenMetadata
├── root: TokenMetadata
├── derivatives: list[DerivativeInfo]
│   └── (generation, parent_mint, SimilarityEvidence 5D)
├── zombie_alert: ZombieAlert?
├── death_clock: DeathClockForecast?
├── operator_fingerprint: OperatorFingerprint?
│   └── (fingerprint, linked_wallets, confidence, tokens_by_wallet)
├── liquidity_arch: LiquidityArchReport?
│   └── (hhi, liq_vol_ratio, authenticity_score, flags)
├── factory_rhythm: FactoryRhythmReport?
├── deployer_profile: DeployerProfile?
├── operator_impact: OperatorImpactReport?
├── sol_flow: SolFlowReport?
│   └── (flows: list[SolFlowEdge], cross_chain_exits, rug_timestamp)
├── cartel_report: CartelReport?
│   └── CartelCommunity → list[CartelEdge]
├── insider_sell: InsiderSellReport?
│   └── (sell_pressure_1h/6h/24h, price_changes, volume_spike)
└── bundle_report: BundleExtractionReport?
    └── bundle_wallets: list[BundleWalletAnalysis]
        ├── pre_sell: PreSellBehavior
        └── post_sell: PostSellBehavior
```

### 9.2 Verdict Taxonomy

| Model | Values |
|---|---|
| `BundleExtractionReport.overall_verdict` | `confirmed_team_extraction` · `suspected_team_extraction` · `coordinated_dump_unknown_team` · `early_buyers_no_link_proven` |
| `InsiderSellReport.verdict` | `clean` · `suspicious` · `insider_dump` |
| `ZombieAlert.confidence` | `confirmed` · `probable` · `possible` |
| `DeathClockForecast.risk_level` | `low` · `medium` · `high` · `critical` · `first_rug` · `insufficient_data` |
| `AIAnalysis.rug_pattern` | `classic_rug` · `slow_rug` · `pump_dump` · `coordinated_bundle` · `factory_jito_bundle` · `serial_clone` · `insider_drain` · `unknown` |

All verdicts are conservative by design: attribution increases in specificity only when evidence meets defined thresholds, never by inference gap-filling.

### 9.3 API Surface

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Uptime, version, circuit breaker states |
| `GET` | `/lineage?mint=` | Full forensic analysis (streaming via SSE) |
| `POST` | `/lineage/batch` | Batch analysis (up to 10 mints) |
| `GET` | `/analyze/{mint}/stream` | SSE stream with step-by-step progress |
| `GET` | `/search?q=` | Token search by name or symbol |
| `GET` | `/deployer/{address}` | Deployer historical profile |
| `GET` | `/operator/{fingerprint}` | Cross-wallet operator impact report |
| `GET` | `/lineage/{mint}/sol-trace` | SOL flow trace post-rug |
| `GET` | `/bundle/{mint}` | Bundle extraction analysis |
| `GET` | `/cartel/search` | Cartel community search |
| `GET` | `/cartel/{community_id}` | Cartel community detail |
| `GET` | `/cartel/{deployer}/financial` | Cartel financial graph |

---

## 10. Evaluation and Limitations

### 10.1 Observed Performance

Live analysis on token `5su44fkvYNM1...` (March 2026):
- Heuristic score: 90/100 → routed to Sonnet
- AI risk score: 82/100
- Total analysis latency: 33.9 seconds
- Signals triggered: bundle (confirmed), deployer history (≥5 rugs), death clock (critical), cartel link

The system correctly identified the token as belonging to a 7-member family with a shared operator DNA fingerprint across 3 distinct deployer wallets.

### 10.2 Known Limitations

**Ground truth deficit.** No public annotated dataset exists for Solana memecoin rug attribution. Evaluation is case-by-case; systematic precision/recall metrics remain work in progress.

**Death Clock cold start.** The signal requires at least 1 prior rug event. For first-time deployer wallets — which may themselves be new operator wallets — the signal outputs `first_rug` (elevated risk flag) or `insufficient_data`. Calibration improves with database accumulation.

**Image manipulation boundary.** pHash is ineffective against cropping, rotation > 5°, or colour channel inversion. A determined operator can evade logo similarity detection in under 60 seconds of image editing.

**BFS hop limit.** SOL flow tracing is capped at 3 hops. Capital laundered through a 4+ hop chain (e.g., through a DEX swap then a bridge then a mixer) may exit the tracked graph. In practice, observed rug extraction rarely requires more than 2 hops to reach a CEX or bridge — the operator is typically not evading on-chain forensics.

**Rate limits.** Helius RPC and DexScreener impose rate ceilings that constrain concurrency under high query volume. Current infrastructure handles ~50 simultaneous full analyses before degradation.

**No forward price signal.** MLA does not predict price movements or perform time-series forecasting. The `risk_score` is a forensic attribution score, not a financial signal.

---

## 11. Threat Model and Adversarial Robustness

### 11.1 Known Evasion Vectors

| Evasion Technique | MLA Signal Bypassed | Residual Detection |
|---|---|---|
| New deployer wallet per token | Same-wallet deployer matching | Operator DNA fingerprint, cartel funding_link |
| Image edited (hue shift, minor crop) | pHash threshold | Pattern mismatch flags, name/symbol similarity |
| Delayed rug (> 48h) | Rug sweep 48h window | Death Clock forecast still active |
| Non-Jito coordinated buy | Bundle detection (Jito-specific) | Insider sell, timing_sync if cross-operator |
| Wash trading to mask sell pressure | Volume spike detection muted | Liquidity/volume HHI anomaly |
| Bridge capital immediately | SOL flow 3-hop limit | Wormholescan integration; partial trace |
| Unique metadata per token | DNA fingerprint | Factory rhythm regularity still detectable |

### 11.2 Inherent Asymmetry

Detection has a structural advantage over evasion: each additional evasion measure (new wallet, new image, delayed timing) adds operational cost and complexity for the operator, while MLA adds the evasion attempt itself as a signal (e.g., a wallet created 10 minutes before a bundle buy is itself a strong signal).

The adversarial equilibrium favours detection as the intelligence database grows: the Death Clock becomes more accurate, cartel community graphs become denser, and DNA fingerprints accumulated from evasion attempts eventually re-link to known operators.

### 11.3 Privacy Considerations

MLA operates exclusively on public blockchain data. All wallet addresses, transaction hashes, and token metadata analysed are publicly accessible on Solana without authentication. No off-chain user data is collected or processed. Wallet address attribution (e.g., "team_wallet") is derived from on-chain evidence and is probabilistic, not deterministic identification of individuals.

---

## 12. Conclusion and Roadmap

### 12.1 Summary of Contributions

This paper presents Meme Lineage Agent, a system that addresses the following gap: existing Solana analytics tools evaluate tokens in isolation, while the most harmful exploitation patterns operate across token families and wallet boundaries.

Core contributions:
1. **Family reconstruction** via 5D similarity scoring with cross-wallet deployer attribution
2. **13-signal forensic layer** covering identity (DNA, cartel, factory), financial (bundle, SOL flow, insider sell, operator impact), and lifecycle (death clock, zombie, rug sweep, liquidity) dimensions
3. **Heuristic-gated AI** that routes to an appropriate LLM tier before inference, injecting the score as a calibration prior
4. **`conviction_chain`**: a structured deductive output that enforces evidential reasoning rather than summary generation, with explicit weakest-assumption disclosure

### 12.2 Roadmap

**Short term (Q2 2026)**
- Public annotated dataset of confirmed rug families for systematic precision/recall benchmarking
- `aria-current` navigation accessibility improvements + WCAG 2.2 AA audit
- Buyer-side wallet scoring: extend forensic attribution beyond deployers to regular purchasers in bundle rings

**Medium term (Q3–Q4 2026)**
- Fine-tuned open-source model trained on MLA's structured evidence format, replacing Claude dependency for standard cases
- DEX time-series integration: incorporate price chart momentum features into heuristic scoring
- Multi-chain extension: apply lineage reconstruction methodology to EVM chains (Base, Ethereum) where PumpFun analogues are emerging

**Long term**
- Real-time alert subscriptions: Telegram/webhook notifications when the Death Clock enters `critical` range for a monitored operator
- Decentralised intelligence layer: on-chain attestation of `token_rugged` events, enabling community-contributed evidence without centralised trust

---

## 13. References

[1] Dune Analytics, "PumpFun Token Launches by Month", 2024–2026. https://dune.com/

[2] Victor, F. & Weintraud, A., "Detecting and Quantifying Wash Trading on Decentralized Cryptocurrency Exchanges", *WWW '21*, 2021.

[3] Hamrick, J. et al., "An Examination of the Cryptocurrency Pump-and-Dump Ecosystem", *arXiv:1811.10109*, 2018.

[4] He, N. et al., "Large Language Models for Blockchain Security: A Systematic Literature Review", *arXiv:2403.14280*, 2024.

[5] Zauner, C., "Implementation and Benchmarking of Perceptual Image Hash Functions", *BUAS Thesis Report*, 2010.

[6] Blondel, V.D. et al., "Fast unfolding of communities in large networks", *J. Stat. Mech.*, P10008, 2008.

---

*Meme Lineage Agent is open source. Contributions, issue reports, and forensic case studies are welcome at [https://github.com/lebbuilder16/Lineage_Agent](https://github.com/lebbuilder16/Lineage_Agent).*

*This document describes MLA v3.x as of March 2026. The system is under active development; architectural details may evolve.*
