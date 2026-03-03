---
description: Deep-dive into Lineage Agent's 13 forensic intelligence signals
---

# Features

Lineage Agent computes 13 independent signals across three layers — **Identity**, **Financial**, and **Lifecycle** — then synthesises them with an AI layer. All signals run concurrently after family reconstruction.

---

## Identity Signals

### 🧬 Metadata DNA Fingerprint

Each token deployment leaves a metadata "DNA" signature derived from the image storage endpoint, Metaplex description structure, and auxiliary URI patterns. These are hashed into a 32-character hex fingerprint.

When multiple deployer wallets share the same fingerprint, Lineage Agent infers a **single human operator** behind them — enabling family detection even when the operator changes wallets deliberately.

| Confidence | Condition |
|------------|-----------|
| `confirmed` | Exact fingerprint match |
| `probable` | Partial pattern match |

---

### 🌳 Family Tree Reconstruction

Tokens are grouped into families via a **5-dimensional similarity engine**:

$$S(A, B) = \sum_{i=1}^{5} w_i \cdot s_i(A, B)$$

| Dimension | Algorithm | Weight |
|-----------|-----------|--------|
| Name | Levenshtein ratio (case-normalised) | 25% |
| Symbol | Levenshtein ratio (uppercase) | 15% |
| Image | pHash 8×8 DCT, Hamming distance | 25% |
| Deployer | Exact match or OperatorFingerprint | 20% |
| Temporal | Linear decay by creation lag | 15% |

The **root token** is the member with the earliest on-chain creation timestamp. Generation numbers are assigned via BFS from the root (generation 0 = root, generation 1 = direct clone, etc.).

---

### 🤝 Cartel Detection

Identifies **inter-operator coordination** — multiple distinct operators acting collectively — using 8 edge types in a coordination graph:

| Edge Type | Signal |
|-----------|--------|
| `dna_match` | Shared DNA fingerprint |
| `sol_transfer` | Direct SOL transfer between deployers (> 0.1 SOL) |
| `timing_sync` | Same-narrative launches within 30 minutes |
| `phash_cluster` | Near-identical logos across operators |
| `cross_holding` | Deployer B holds tokens from operator A |
| `funding_link` | Pre-deployment SOL funding within 72h |
| `shared_lp` | Same wallet provides initial liquidity |
| `sniper_ring` | Coordinated early buys across different deployers |

Community detection uses the **Louvain algorithm** with edge weights derived from signal strength. Community identity is stable (`sha256(sorted_wallets)[:12]`).

---

### 🏭 Factory Rhythm

Detects operators running **scripted batch deployment** campaigns:

- Median inter-deployment interval + standard deviation
- Naming pattern: `incremental` / `themed` / `random`
- Narrative taxonomy (20+ categories: pepe, ai, cat, dog, political, trump…)
- `is_factory = true` when regularity exceeds empirical thresholds

---

## Financial Signals

### 💰 Bundle Detection (Jito, 5-Phase Pipeline)

Jito bundles allow multiple transactions to be included atomically in a single Solana slot (~400ms). The 5-phase pipeline:

**Phase 1 — Window Detection**
Wallets that bought within 20 slots (~8s) of pool creation. Capped at 15 wallets.

**Phase 2 — Pre-Sell Behaviour**
Wallet age, dormancy period, funding source (traced 72h before launch), prior bundle participations.

**Phase 3 — Post-Sell Tracing**
BFS up to 2 hops after sell transactions. Identifies deployment wallet, CEX addresses, cross-chain bridges.

**Phase 4 — Cross-Wallet Coordination**
Common funder detection, simultaneous sell timing (≤ 80 seconds), common sink (≥ 2 wallets routing to same destination).

**Phase 5 — Verdict**

| Verdict | Meaning |
|---------|---------|
| `confirmed_team_extraction` | Direct wallet linkage to deployer proven |
| `suspected_team_extraction` | Strong circumstantial convergence |
| `coordinated_dump_unknown_team` | Coordination proven, operator unknown |
| `early_buyers_no_link_proven` | Timing consistent, no coordination evidence |

---

### 🌊 SOL Flow Trace (BFS Multi-Hop)

Traces post-rug capital flows across the Solana transaction graph:

- **Min transfer:** 0.1 SOL (filters dust/fees)
- **Max depth:** 3 hops from the initial rug transaction
- **CEX detection:** hardcoded frozenset of known exchange addresses
- **Cross-chain detection:** Wormholescan API — identifies capital exiting via Wormhole, Allbridge, etc.

The `rug_timestamp` matches the block time of the root hop-0 transaction, enabling correlation with price chart data.

---

### 📊 Insider Sell Detection

Combines two data sources to detect **gradual team wallet liquidation**:

- **DexScreener** buy/sell transaction counts at 1h / 6h / 24h windows
- **RPC probing** of deployer/team wallet token balances (`getTokenAccountsByOwner`)

| Threshold | Condition |
|-----------|-----------|
| `suspicious` | Sell pressure ≥ 55% OR price drop ≤ −30% |
| `insider_dump` | `deployer_exited = true` AND (sell pressure ≥ 65% OR price drop ≤ −50%) |

---

### 💥 Operator Impact Report

A cross-wallet ledger aggregating financial damage from an operator's full campaign history:

- Total SOL extraction estimate (tiered heuristic on peak market cap)
- `is_campaign_active` — activity within last 6 hours
- `peak_concurrent_tokens` — max tokens simultaneously live (24h sliding window)
- Chronological narrative sequence of all known tokens

---

### 💧 Liquidity Architecture

Authenticity analysis using DexScreener data only (zero extra RPC calls):

- **HHI** (Herfindahl-Hirschman Index) — measures concentration across pairs
- **Liquidity / Volume ratio** — anomalously high ratio signals wash trading
- **Flags:** `FRAGMENTED_LIQUIDITY`, `CRITICAL_LOW_VOLUME`, `POSSIBLE_DEPLOYER_LP_ONLY`

---

## Lifecycle Signals

### ⏰ Death Clock

Probabilistic forecast of **time remaining until next rug**, based on documented rug history:

1. Query `intelligence_events` for prior `token_rugged` events
2. Compute time-to-rug per event: `rug_timestamp − creation_timestamp`
3. Forecast: `[median − σ, median + σ]` (σ capped at 2× median)

| Risk Level | Condition |
|------------|-----------|
| `first_rug` | No prior rugs — newly created operator wallet |
| `low` | n < 2 historical samples |
| `medium` | 2–4 samples |
| `high` | 5–9 samples |
| `critical` | ≥ 10 samples, token in forecast window |

---

### 🧟 Zombie Detection

A **zombie token** is a previously-dead token relaunched by a fingerprint-matched operator. Resurrection is confirmed when:

- The deployer matches a known operator **OR** pHash similarity exceeds threshold
- The prior token is tagged `token_rugged` in the intelligence database

| Confidence | Condition |
|------------|-----------|
| `confirmed` | Same deployer + fingerprint match |
| `probable` | Fingerprint match only |
| `possible` | pHash similarity + timing correlation |

---

### 🔁 Rug Sweep (Background Monitor)

A background process running every **15 minutes** monitors all tokens that:

- Had liquidity > $500 at creation
- Were created within the last 48 hours

If current liquidity < $100, the token is marked as rugged and `trace_sol_flow` is launched automatically with bundle wallet addresses as extra BFS seeds.

---

## AI Analysis Layer

### Model Routing

The **heuristic pre-scorer** computes a deterministic score (0–100) from all 13 signals before calling the LLM:

| Score | Model | Rationale |
|-------|-------|-----------|
| < 55 | Claude Haiku 4.5 | Sparse signals — lower capability sufficient |
| ≥ 55 | Claude Sonnet 4.6 | Multiple signals — stronger multi-step deduction |

### The `conviction_chain` Field

The primary qualitative output innovation. Required format:

- **2–3 sentences** naming ≥ 3 independent converging signals
- Articulates the causal/temporal chain between them
- Names the **weakest assumption** underlying the verdict
- Acknowledges conflicting signals where present

Example:
> *"Bundle forensics [FINANCIAL] confirm team extraction within 8 seconds of pool creation, converging with operator DNA fingerprint [IDENTITY] linking this wallet to 4 prior rugs; the death clock [LIFECYCLE] places current token within the 12–48h historical rug window. Weakest assumption: cross-wallet DNA match has `probable` rather than `confirmed` confidence."*

### Rug Pattern Classification

| Pattern | Description |
|---------|-------------|
| `classic_rug` | LP removal in a single transaction |
| `slow_rug` | Gradual insider sell over days |
| `pump_dump` | Coordinated buy pressure then mass exit |
| `coordinated_bundle` | Jito bundle extraction — team confirmed |
| `factory_jito_bundle` | Automated factory + bundle combo |
| `serial_clone` | Repeat brand exploitation across generations |
| `insider_drain` | Deployer wallet liquidation |
| `unknown` | Insufficient evidence |
