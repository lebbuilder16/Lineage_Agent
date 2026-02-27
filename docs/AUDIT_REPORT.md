# Lineage Agent — Comprehensive Codebase Audit Report

**Date:** 2025-01-XX  
**Auditor:** GitHub Copilot (Claude Opus 4.6)  
**Codebase:** Lineage Agent v3.1.0 — Python/FastAPI + Next.js  
**Scope:** 8 features × 7 axes, full backend + frontend

---

## Table of Contents

1. [Feature 1 — Deployer Profile](#f1-deployer-profile)
2. [Feature 2 — Operator Impact](#f2-operator-impact)
3. [Feature 3 — SOL Flow Trace](#f3-sol-flow-trace)
4. [Feature 4 — Cartel Detection](#f4-cartel-detection)
5. [Feature 5 — Bundle Detection](#f5-bundle-detection)
6. [Feature 6 — Liquidity Architecture](#f6-liquidity-architecture)
7. [Feature 7 — Family Tree](#f7-family-tree)
8. [Feature 8 — Derivatives & Similarity Scoring](#f8-derivatives)
9. [Global Synthesis](#global-synthesis)

---

## F1: Deployer Profile

**Backend:** `deployer_service.py` (155 lines), `death_clock.py` (168 lines), `factory_service.py` (236 lines)  
**Frontend:** `deployer/[address]/page.tsx` (265 lines), `forensics/DeployerProfile.tsx`, `forensics/DeathClock.tsx`, `forensics/FactoryRhythm.tsx`  
**API:** `GET /deployer/{address}` (rate-limited 20/min)

### 1. Data Accuracy — ⚠️ MEDIUM RISK

| Finding | Severity | Detail |
|---------|----------|--------|
| **Rug count may overcount** | Medium | `_build_profile()` fetches `token_rugged` events by mint, but `rug_count = len(rugged_map)` counts distinct mints. However, the SQL queries `WHERE mint IN (...)` can miss if a rug event was recorded under a different deployer (re-deployment edge case). |
| **PumpFun deployer gap** | High | As discovered during the deployer fix: PumpFun tokens have `creators: []` in Metaplex metadata. The signature-walk fallback is used, but for tokens created *before* the fix was deployed, the deployer cache (v3→v4 migration) will still serve the old wrong deployer until the cache TTL expires or the entry is manually evicted. `_get_deployer_cached` filters `_NON_DEPLOYER_AUTHORITIES` on read, so cached PumpFun UA values *are* rejected — but the sig-walk fallback may still return a fee-payer (PumpFun bonding-curve program) rather than the actual user. |
| **`avg_lifespan_days` only counts rugged tokens** | Low | Non-rugged tokens are excluded from lifespan calculation. This is technically correct for "rug lifespan" but misleading as a generic "avg lifespan" label. |
| **`active_tokens = total - rug_count`** | Low | A token can be dead (zero liquidity) without a formal `token_rugged` event. Active count may be overstated. |

### 2. Error Handling — ✅ GOOD

- `compute_deployer_profile` catches all exceptions and returns `None` → no 500s.
- In-process TTL cache (`_profile_cache`) uses `asyncio.Lock` to prevent thundering herd.
- Death clock returns `insufficient_data` risk level when samples < 1, not a crash.

### 3. Inter-feature Coherence — ⚠️ MEDIUM

| Issue | Detail |
|-------|--------|
| **Duplicate `_parse_dt`** | Each of `deployer_service.py`, `death_clock.py`, `operator_impact_service.py` and `lineage_detector.py` has its own datetime parser. Subtle differences exist (e.g. `.replace("Z", "+00:00")` vs not, handling of `int`/`float` timestamps). Should be unified into a shared `utils.py`. |
| **Narrative taxonomy duplication** | `factory_service.py` defines `NARRATIVE_TAXONOMY` dict, while `lineage_detector.py._guess_narrative()` uses a separate keyword dict. Narratives may diverge (e.g. "political" in detector vs "trump" in factory). |

### 4. Code Clarity — ✅ GOOD

- Clean Pydantic models with `Field` descriptions.
- Docstrings on all public functions.
- Confidence level logic is transparent (5/2/1 threshold).

### 5. UI/UX — ✅ GOOD

- Deployer page shows skeleton loading states.
- Rug rate has a colour-coded progress bar (green → yellow → red).
- Token list sorted rugged-first, then by date desc.
- Missing: no link to Solscan/Explorer for the deployer address.

### 6. Analytical Value — ✅ GOOD

- Death Clock provides a statistical rug timing window with confidence bands.
- Factory Rhythm detection (regularity + naming pattern + mcap consistency) is a novel signal.
- Confidence levels (high/medium/low) on all forensic outputs.

### 7. Tests & Coverage — ⚠️ PARTIAL

- `test_forensic_services.py` covers Death Clock (3 tests), Factory Rhythm (3 tests), Deployer Profile (2 tests).
- **Missing:** No test for `_parse_dt` edge cases (int timestamps, malformed strings).
- **Missing:** No test for the in-process cache TTL expiration or lock contention.
- **Missing:** No test for `classify_narrative()` in factory_service.

**Feature Score: 7.0 / 10**

---

## F2: Operator Impact

**Backend:** `operator_impact_service.py` (167 lines), `metadata_dna_service.py` (287 lines)  
**Frontend:** `operator/[fingerprint]/page.tsx` (250 lines), `forensics/OperatorImpact.tsx`, `forensics/OperatorFingerprint.tsx`  
**API:** `GET /operator/{fingerprint}`

### 1. Data Accuracy — ⚠️ MEDIUM RISK

| Finding | Severity | Detail |
|---------|----------|--------|
| **Extraction estimate is a flat 15% heuristic** | Medium | `EXTRACTION_RATE = 0.15` applied to rugged `mcap_usd`. Real extraction depends on liquidity depth, not market cap. A 15% flat rate can overestimate by 10× for low-liq tokens or underestimate for high-liq ones. The `is_estimated` flag exists in the model but is hardcoded to `True` — no path ever sets it to `False`. |
| **`operator_mapping` persistence race** | Low | `operator_mapping_upsert` is called for each linked wallet in a loop without transaction batching. If the sweep and a lineage analysis run concurrently, stale mappings could persist. |
| **Peak concurrent calculation** | Low | Uses a 24h sliding window via `bisect.bisect_right` — correct algorithm, but counts all `token_created` events, including ones that may have been immediately rugged (lifespan < 1h). This inflates the "peak concurrent" figure. |

### 2. Error Handling — ✅ GOOD

- `asyncio.wait_for` with 20s timeout wrapping the entire computation.
- `asyncio.gather(*coros, return_exceptions=True)` for profile collection — individual wallet failures don't crash the aggregate.

### 3. Inter-feature Coherence — ✅ GOOD

- Operator Impact depends on `operator_fingerprint` result from `metadata_dna_service` → properly sequenced in `detect_lineage` (fingerprint computed first, then impact).
- `bootstrap_deployer_history` is called on linked wallets before the operator endpoint responds — ensures data freshness.

### 4. Code Clarity — ✅ GOOD

- Well-structured 10-step `_build_impact()` with numbered comments.
- Clear confidence ladder based on profile count and token count.

### 5. UI/UX — ✅ GOOD

- "CAMPAIGN ACTIVE" pulsing badge when `is_campaign_active` is true.
- Narrative sequence displayed as arrow chain (pepe → ai → cat).
- Each linked wallet has a "Profile →" link to the deployer page.
- **Missing:** No "Export to CSV" or "Download report" option.

### 6. Analytical Value — ✅ EXCELLENT

- Cross-wallet aggregation is the key differentiator.
- Campaign timeline (first_seen → last_seen) is actionable.
- Peak concurrent tokens metric reveals bot/factory patterns.

### 7. Tests & Coverage — ⚠️ PARTIAL

- `test_forensic_services.py::TestOperatorImpact` (2 tests): basic with seeded data + empty wallets.
- **Missing:** No test for confidence level transitions (high vs medium vs low).
- **Missing:** No test for `is_campaign_active` detection logic.
- **Missing:** No test for `_build_impact` timeout handling.

**Feature Score: 7.5 / 10**

---

## F3: SOL Flow Trace

**Backend:** `sol_flow_service.py` (380 lines), `bridge_tracker.py` (363 lines), `wallet_labels.py` (192 lines)  
**Frontend:** `sol-trace/[mint]/page.tsx` (546 lines)  
**API:** `GET /lineage/{mint}/sol-trace`

### 1. Data Accuracy — 🔴 HIGH RISK

| Finding | Severity | Detail |
|---------|----------|--------|
| **Balance-delta attribution is approximate** | High | `_parse_sol_flows()` uses `preBalances/postBalances` to infer SOL transfers. This captures net changes, not individual instructions. A wallet that receives 10 SOL and sends 3 SOL in the same tx shows a +7 SOL delta — invisible 3 SOL outflow. Parsed system-program transfers (available in `meta.innerInstructions`) would be more precise. |
| **`_MIN_TRANSFER_LAMPORTS = 100_000_000` (0.1 SOL)** | Medium | Small-value flows under 0.1 SOL are silently dropped. Rug operators increasingly use micro-transfers (0.01-0.05 SOL per hop) to evade tracing. This threshold should be configurable via env var. |
| **SOL price fetched once at analysis time** | Low | `jup.get_price(WSOL)` is called once and used for all USD conversions. If the trace runs over 20s during high volatility, the price may be stale. |
| **CEX address list is static and tiny** | Medium | Only 5 CEX hot wallets in `_CEX_ADDRESSES`. Major exchanges like FTX, KuCoin, Gate.io, MEXC are missing. The `wallet_labels.py` has a larger list but `_CEX_ADDRESSES` in `sol_flow_service.py` is a separate, smaller frozenset. These should be unified. |

### 2. Error Handling — ✅ GOOD

- 20s `asyncio.wait_for` timeout on the full trace.
- Per-wallet tracing failures don't crash the BFS — `return_exceptions=True`.
- Incremental persistence: `sol_flow_insert_batch` after each hop ensures partial results are saved.
- Bridge detection is `best-effort, never raises` (explicitly documented).

### 3. Inter-feature Coherence — ⚠️ MEDIUM

| Issue | Detail |
|-------|--------|
| **`_CEX_ADDRESSES` vs `wallet_labels.KNOWN_LABELS` divergence** | `sol_flow_service.py` checks `_CEX_ADDRESSES` (5 entries) for `known_cex_detected`, while `wallet_labels.py` has ~15+ CEX addresses. The `classify_address()` result populates edge labels but `known_cex_detected` flag uses the smaller set. |
| **Double deployer resolution** | SOL trace endpoint resolves deployer via `event_query` then `_resolve_deployer(mint)`. But the lineage enricher also runs `trace_sol_flow` with the deployer it already knows. No shared deployer cache reference — could produce different deployers for the same mint. |

### 4. Code Clarity — ✅ GOOD

- BFS algorithm is clear with `frontier`, `visited`, `hop` tracking.
- `_flows_to_report()` is a clean converter.
- Skip lists and CEX lists are well-documented.

### 5. UI/UX — ✅ EXCELLENT

- Interactive ReactFlow graph with hop-based layout.
- Flow replay timeline with play/pause and scrubber.
- Colour-coded nodes by entity type (deployer=red, CEX=orange, DEX=purple).
- Cross-chain exit card with bridge name and destination chain.
- SOL amount labels on edges with proportional stroke width.
- **Missing:** No "zoom to fit" button on initial load (relies on `fitView` prop).

### 6. Analytical Value — ✅ EXCELLENT

- Multi-hop BFS (up to 3 hops, configurable) reveals money trail.
- Terminal wallet identification (sinks that never send outbound).
- Cross-chain exit detection via Wormholescan API — unique signal.
- Rug timestamp derived from earliest hop-0 flow.

### 7. Tests & Coverage — 🔴 WEAK

- `test_forensic_services.py::TestSolFlowReport` (2 tests): null check + pre-seeded DB read.
- **No test for the actual BFS tracing** (`_run_trace`, `_trace_wallet`).
- **No test for `_parse_sol_flows`** balance-delta logic.
- **No test for bridge detection** (`detect_bridge_exits`).
- **No test for `wallet_labels.classify_address()`**.
- **No test for the sol-trace API endpoint** (only DB-read path tested).

**Feature Score: 6.5 / 10**

---

## F4: Cartel Detection

**Backend:** `cartel_service.py` (524 lines), `cartel_financial_service.py` (736 lines)  
**Frontend:** `cartel/[id]/page.tsx` (331 lines), `forensics/CartelReportCard.tsx`, `forensics/CartelGraph3D.tsx`, `forensics/CartelFinancialGraph.tsx`  
**API:** `GET /cartel/search`, `GET /cartel/{community_id}`, `GET /cartel/{deployer}/financial`

### 1. Data Accuracy — ⚠️ MEDIUM RISK

| Finding | Severity | Detail |
|---------|----------|--------|
| **`_signal_timing_sync` ISO string comparison** | Medium | `created_at >= ? AND created_at <= ?` compares ISO datetime strings lexicographically in SQLite. This works for UTC ISO format but will break for non-UTC offsets or non-zero-padded timestamps. All timestamps should be stored as Unix epoch integers for reliable comparison. |
| **pHash cluster fetch is unbounded** | High | `_signal_phash_cluster` queries `ALL event_type='token_created' WHERE deployer != ? AND extra_json IS NOT NULL` with `limit=5000`. On a mature database with 50k+ tokens this is a full table scan and O(n×m) hamming comparison. No index, no batching. |
| **Louvain fallback is hash-based** | Low | When `community_louvain.best_partition()` fails, the fallback uses `hash(frozenset(component)) % 100_000` as community ID. This is not stable across runs (Python hash salt). The `sha256(sorted_wallets)` used for `community_id` IS stable, but the partition mapping isn't. |

### 2. Error Handling — ✅ GOOD

- 15s timeout on community detection.
- Each signal detector catches its own exceptions and returns 0.
- Cartel sweep runs in a background task with `asyncio.sleep(3600)` loop — cancellable.

### 3. Inter-feature Coherence — ✅ GOOD

- 8 independent signal sources (5 metadata + 3 financial) provide robust cross-validation.
- Edge weights feed into Louvain's modularity optimisation — well-integrated.
- Cartel sweep runs hourly via lifespan background task → edges are pre-computed for lineage queries.

### 4. Code Clarity — ⚠️ NEEDS WORK

| Issue | Detail |
|-------|--------|
| **736-line `cartel_financial_service.py`** | The `_signal_funding_link`, `_signal_shared_lp`, `_signal_sniper_ring` functions are long and contain repeated RPC call patterns. Should extract a `_fetch_and_parse_transactions()` helper. |
| **`get_cartel_community` endpoint is O(n)** | The endpoint iterates ALL wallets from ALL edges, running `compute_cartel_report` for each until the community_id matches. This is O(wallets × community_detection). Should maintain a community_id → wallets mapping table. |

### 5. UI/UX — ✅ EXCELLENT

- Dual 2D/3D graph views with toggle.
- Three.js 3D force graph (dynamic import, SSR-disabled).
- Signal-type colour legend.
- Edge labels show signal type.
- Stats cards: wallets, tokens launched, rugs, estimated extraction.

### 6. Analytical Value — ✅ EXCELLENT

- 8-signal fusion (DNA match, SOL transfer, timing sync, pHash cluster, cross-holding, funding link, shared LP, sniper ring) is industry-leading.
- Community detection via Louvain gives stable cluster identification.
- Financial graph scoring (funding×30 + LP×25 + sniper×20 + timing×15 + metadata×10) is well-weighted.

### 7. Tests & Coverage — ✅ GOOD

- `test_cartel_financial.py` (719 lines) — extensive tests for all 3 financial signals + integration.
- `test_forensic_services.py::TestCartelReport` (2 tests) — seeded edges + community detection.
- **Missing:** No test for the `get_cartel_community` O(n) endpoint.
- **Missing:** No test for `_signal_timing_sync` with edge-case timestamps.
- **Missing:** No stress/perf test for pHash cluster on large datasets.

**Feature Score: 7.5 / 10**

---

## F5: Bundle Detection

**Backend:** `bundle_tracker_service.py` (418 lines)  
**Frontend:** `forensics/BundleReportCard.tsx`  
**API:** `GET /bundle/{mint}`

### 1. Data Accuracy — ⚠️ MEDIUM RISK

| Finding | Severity | Detail |
|---------|----------|--------|
| **Slot window heuristic** | Medium | `_BUNDLE_SLOT_WINDOW = 4` slots = ~1.6 seconds. On Solana, Jito bundles can span 1-2 slots, so 4 is conservative. But non-bundle early buyers within 4 slots will be false-positive included. |
| **`_extract_buyers` signer detection** | Medium | Uses `signer` field from jsonParsed accountKeys. For versioned transactions, signers may appear in `header.numRequiredSignatures` instead of per-key `signer` flags. This could miss bundle wallets on v0 transactions. |
| **Pre-fund window of 72h** | Low | `_PRE_FUND_WINDOW_H = 72` is reasonable for most coordinated launches, but sophisticated operators fund wallets weeks in advance. |
| **No deduplication of bundle wallets across runs** | Low | If `analyze_bundle` is called twice for the same mint, it re-runs the full analysis. No persistence layer for bundle results (unlike sol_flows). |

### 2. Error Handling — ✅ GOOD

- 25s `asyncio.wait_for` on the full analysis.
- Each step (funding check, balance fetch, SOL return estimation) uses `asyncio.gather(*tasks, return_exceptions=True)`.
- Max 20 bundle wallets cap prevents DoS.

### 3. Inter-feature Coherence — ⚠️ LOW

| Issue | Detail |
|-------|--------|
| **Not feeding cartel graph** | Bundle wallet information is not fed back into the cartel edge system. If deployer A bundles with wallets that also bundle for deployer B, this coordination signal is lost. |
| **SOL price fetched separately** | The lineage enricher fetches SOL price once and passes it to `analyze_bundle`, but the standalone `/bundle/{mint}` endpoint fetches it independently — could get a different price. |

### 4. Code Clarity — ✅ GOOD

- Clean 8-step pipeline with numbered comments.
- Verdict logic is transparent (≥50% linked OR ≥2 confirmed + >1 SOL returned → confirmed_bundle).
- Constants are well-named and documented.

### 5. UI/UX — ⚠️ PARTIAL

- BundleReportCard is rendered inline on the lineage page.
- **Missing:** No dedicated `/bundle/[mint]` page — only API endpoint + inline card.
- **Missing:** No visual graph of deployer → bundle wallet → SOL return paths.

### 6. Analytical Value — ✅ GOOD

- Cross-references pre-funding (deployer → wallet SOL), exits (balance=0), and SOL return.
- Three-tier verdict (clean/suspected/confirmed) with clear criteria.
- USD extraction estimate using live SOL price.

### 7. Tests & Coverage — 🔴 WEAK

- **No dedicated test file for bundle_tracker_service.py**.
- Bundle functionality tested only indirectly via integration tests.
- **Missing:** Test for `_extract_buyers` with different transaction formats.
- **Missing:** Test for verdict logic thresholds.
- **Missing:** Test for `_check_deployer_funded` within/outside the funding window.

**Feature Score: 6.0 / 10**

---

## F6: Liquidity Architecture

**Backend:** `liquidity_arch.py` (141 lines)  
**Frontend:** `forensics/LiquidityArch.tsx`  
**Inline analysis:** Zero extra network calls (uses already-fetched DexScreener pairs)

### 1. Data Accuracy — ✅ GOOD

- HHI (Herfindahl–Hirschman Index) is a standard concentration metric — correctly implemented.
- `liq_to_volume_ratio` is a useful signal for artificial liquidity.
- Thresholds are well-documented constants.
- Only Solana pairs are included (filtered by `chainId`).

### 2. Error Handling — ✅ GOOD

- Returns a valid report even with zero pairs (`NO_SOLANA_PAIRS` flag).
- `_safe_float` prevents crash on malformed DexScreener data.
- No RPC calls = no timeout risk.

### 3. Inter-feature Coherence — ⚠️ LOW

| Issue | Detail |
|-------|--------|
| **No cross-reference with deployer LP activity** | The `POSSIBLE_DEPLOYER_LP_ONLY` flag is a pure heuristic (single pool + zero volume). Could be enriched by checking if the LP token holder is the deployer wallet. |
| **No feed into cartel graph** | Shared LP provider detection is in `cartel_financial_service.py`, not in `liquidity_arch.py`. These should share data. |

### 4. Code Clarity — ✅ EXCELLENT

- Shortest service file (141 lines). Clean, focused.
- Every flag has a clear constant and documented semantic.
- Pure function (no side effects, no database access).

### 5. UI/UX — ✅ GOOD

- Pool distribution table with per-DEX liquidity.
- Authenticity score gauge.
- Flags displayed as coloured badges.

### 6. Analytical Value — ✅ GOOD

- Unique signal: distinguishes organic liquidity from deployer-only LP.
- HHI + liq/vol ratio combo catches artificial liquidity setups.
- Flags are actionable (FRAGMENTED_LIQUIDITY, CRITICAL_LOW_VOLUME, POSSIBLE_DEPLOYER_LP_ONLY).

### 7. Tests & Coverage — 🔴 WEAK

- **No dedicated test file** for `liquidity_arch.py`.
- Only tested indirectly via lineage integration tests.
- **Missing:** Unit tests for `_compute_authenticity` with various flag combinations.
- **Missing:** Unit tests for edge cases (zero pools, single pool, extreme HHI values).

**Feature Score: 7.0 / 10**

---

## F7: Family Tree

**Backend:** `lineage_detector.py::_assign_generations()` (lines ~930-980), `_select_root()` (lines ~1050-1100)  
**Frontend:** `FamilyTree.tsx` (246 lines)  
**API:** `GET /lineage/{mint}/graph`

### 1. Data Accuracy — ⚠️ MEDIUM RISK

| Finding | Severity | Detail |
|---------|----------|--------|
| **Root selection heuristic** | Medium | `_select_root` uses: oldest timestamp → deployer cluster → liquidity → mcap. But a pre-minted token (mint created months before listing) would always "win" as root even if it's a dead clone. The `pairCreatedAt` override in `_enrich` partially addresses this, but only for candidates — the query token itself does not apply this heuristic consistently. |
| **Generation assignment is timestamp-based** | Low | `_assign_generations` uses chronological ordering to assign parent-child relationships. This means a G2 copy-of-copy is detected only if it was created *after* its parent. If a derivative predates its parent (due to timezone issues or DexScreener data lag), the generation chain breaks. |
| **Capped at 20 derivatives in UI** | Low | `FamilyTree.tsx` renders only `data.derivatives.slice(0, 20)`. Family sizes > 20 are truncated without clear user messaging (only a small "(Showing 20 of N)" label). |

### 2. Error Handling — ✅ GOOD

- `FamilyTree` returns `null` when `data.root` is missing.
- Graph edges fall back to root as parent when `parent_mint` is invalid.
- `layoutGraph` (dagre) handles disconnected nodes gracefully.

### 3. Inter-feature Coherence — ✅ GOOD

- Generation + parent_mint fields are exposed in the `/lineage/{mint}/graph` endpoint.
- Edge weights in the tree use `composite_score` from similarity scoring — fully integrated.
- Node click navigates to `/lineage/{mint}` for the derivative.

### 4. Code Clarity — ✅ GOOD

- Custom `TokenNode` React component with visual score levels.
- Dagre layout algorithm is a clean 4-liner wrapper.
- Generation badge colours (G1=green, G2=yellow, G3=orange, G4=red) are intuitive.

### 5. UI/UX — ✅ EXCELLENT

- Interactive graph with drag, zoom, minimap.
- Color-coded edges by similarity score (green ≥0.7, yellow ≥0.4, red <0.4).
- Animated edges for high-confidence links.
- Crown icon on the root node.
- Dynamic height based on derivatives count.

### 6. Analytical Value — ✅ GOOD

- Multi-generation tree (up to G5) reveals copy-of-copy chains.
- Root selection algorithm considers deployer cluster, not just timestamp.
- `query_is_root` flag clearly tells users if their token is original or clone.

### 7. Tests & Coverage — ⚠️ PARTIAL

- `test_lineage_detector.py` (190 lines) tests `_select_root`, similarity scoring.
- `test_lineage_integration.py` (262 lines) runs 7 integration tests.
- **Missing:** No test for `_assign_generations` with complex multi-gen trees.
- **Missing:** No test for the `pairCreatedAt` override logic in `_enrich`.
- **Missing:** No frontend component tests (FamilyTree, EvidencePanel).

**Feature Score: 7.5 / 10**

---

## F8: Derivatives & Similarity Scoring

**Backend:** `similarity.py`, `lineage_detector.py` (scoring pipeline)  
**Frontend:** `EvidencePanel.tsx` (148 lines)  
**Models:** `SimilarityEvidence`, `DerivativeInfo`

### 1. Data Accuracy — ⚠️ MEDIUM RISK

| Finding | Severity | Detail |
|---------|----------|--------|
| **Image similarity is pHash-based** | Medium | `compute_image_similarity` uses perceptual hashing (imagehash). This is robust for exact copies but weak for stylistic variants (same character, different background/pose). Tokens using the same Pepe template with minor edits can score < 0.5 even though they're clearly related. |
| **Weight configuration not validated at runtime** | Low | `config.py` validates `sum ≈ 1.0` with a warning, but doesn't enforce it. A misconfigured deployment with weights summing to 0.5 would silently halve all composite scores. |
| **Deployer score is binary (0.0 or 1.0)** | Low | `compute_deployer_score` returns 1.0 if deployers match, 0.0 otherwise. No partial credit for wallets linked via OperatorFingerprint. |

### 2. Error Handling — ✅ GOOD

- PIL/imagehash import failure returns a sentinel value (-1) → treated as 0.0 with `_missing` set.
- Candidate scoring uses `asyncio.gather(*tasks, return_exceptions=True)`.
- Pre-filter (name/symbol threshold) reduces scoring load before expensive image comparison.

### 3. Inter-feature Coherence — ⚠️ LOW

| Issue | Detail |
|-------|--------|
| **Deployer score doesn't use OperatorFingerprint** | Even if two tokens share the same operator fingerprint (different wallets, same human), `compute_deployer_score` returns 0.0. Should cross-reference `operator_fingerprint.linked_wallets`. |
| **EvidencePanel weight labels are hardcoded** | Frontend `WEIGHTS` object shows Name=25%, Symbol=20%, Image=25%, Deployer=20%, Temporal=10%. But backend config allows env-var overrides (WEIGHT_NAME=0.25 etc.). If backend weights change, frontend becomes incorrect. |

### 4. Code Clarity — ✅ EXCELLENT

- `EvidencePanel.tsx` has per-dimension explanations at each score level (high/medium/low).
- Weight × score contribution shown per bar.
- Clean separation: `similarity.py` for pure math, `lineage_detector.py` for orchestration.

### 5. UI/UX — ✅ EXCELLENT

- Animated score bars with colour coding.
- Per-dimension explanations ("Same creator wallet ⚠️ — direct link confirmed").
- Composite score with gradient colouring.
- Two-column layout: derivative card + evidence panel side-by-side.

### 6. Analytical Value — ✅ GOOD

- 5-dimension composite scoring is comprehensive.
- Temporal score penalises distant launches — reduces false positives.
- `compute_composite_score` handles missing dimensions by redistributing weights.

### 7. Tests & Coverage — ✅ GOOD

- `test_similarity.py` (193 lines) covers all scoring functions.
- `test_image_similarity.py` (199 lines) tests pHash computation.
- `test_lineage_detector.py` tests root selection and scoring pipeline.
- **Missing:** No test for weight redistribution with missing dimensions.
- **Missing:** No test for `_enrich` function with DAS fallback paths.

**Feature Score: 7.0 / 10**

---

## Global Synthesis

### Score Matrix

| Feature | Accuracy | Errors | Coherence | Code | UI/UX | Value | Tests | **Avg** |
|---------|----------|--------|-----------|------|-------|-------|-------|---------|
| F1 Deployer | 6 | 8 | 6 | 8 | 8 | 8 | 5 | **7.0** |
| F2 Operator | 6 | 8 | 8 | 8 | 8 | 9 | 5 | **7.5** |
| F3 SOL Flow | 5 | 8 | 6 | 8 | 9 | 9 | 3 | **6.5** |
| F4 Cartel | 6 | 8 | 8 | 6 | 9 | 9 | 7 | **7.5** |
| F5 Bundle | 6 | 8 | 5 | 8 | 5 | 7 | 2 | **6.0** |
| F6 Liquidity | 8 | 8 | 5 | 10 | 7 | 8 | 2 | **7.0** |
| F7 Family Tree | 6 | 8 | 8 | 8 | 9 | 8 | 5 | **7.5** |
| F8 Derivatives | 6 | 8 | 5 | 9 | 9 | 8 | 7 | **7.0** |
| **Column Avg** | **6.1** | **8.0** | **6.4** | **8.1** | **8.0** | **8.3** | **4.5** | **7.1** |

### Top 10 Problems (Priority Order)

| # | Problem | Impact | Effort | Fix |
|---|---------|--------|--------|-----|
| 1 | **SOL Flow balance-delta attribution** | Flows are approximate — can miss intra-tx outflows | High | Parse `innerInstructions` for system-program transfers instead of relying solely on `preBalances/postBalances` delta |
| 2 | **No test coverage for BFS tracing & bundle detection** | Critical paths untested — regressions go unnoticed | High | Add integration tests with mock RPC responses for `_run_trace()`, `_extract_buyers()`, `_check_deployer_funded()` |
| 3 | **pHash cluster signal is O(n²) unbounded** | Cartel sweep will degrade to minutes/hours as DB grows | High | Add a pHash index table or use locality-sensitive hashing (LSH) to avoid full scan |
| 4 | **`_CEX_ADDRESSES` divergence from `wallet_labels`** | SOL Flow reports `known_cex_detected=false` even when a CEX was reached | Medium | Unify into a single source of truth; use `classify_address(addr).entity_type == "cex"` |
| 5 | **Duplicate `_parse_dt` across 4+ files** | Inconsistent datetime handling leads to subtle bugs | Medium | Create `lineage_agent/utils.py` with a single `parse_datetime()` function |
| 6 | **Narrative taxonomy divergence** | Factory rhythm and lineage detector may classify the same token differently | Medium | Unify into a single `classify_narrative()` in a shared module |
| 7 | **`get_cartel_community` endpoint is O(wallets)** | API response for cartel lookup can take 30s+ with large edge tables | Medium | Maintain a `community_id → wallets` lookup table, updated during sweep |
| 8 | **Deployer score doesn't use OperatorFingerprint** | Copy tokens by same operator (different wallets) score 0.0 deployer_score | Medium | Cross-reference `linked_wallets` in `compute_deployer_score()` |
| 9 | **Bundle results not persisted** | Duplicate RPC calls on every page load for the same mint | Low | Add SQLite table for bundle reports, similar to `sol_flows` |
| 10 | **Frontend weight labels hardcoded** | Backend weight config changes aren't reflected in UI | Low | Expose weights via `/config` endpoint or embed in `/lineage` response |

### Cross-Feature Dependency Map

```
detect_lineage()
├── DexScreener (pairs) ──────────> F6 Liquidity Arch
├── DAS getAsset ──────────────────> Deployer resolution (ALL features)
├── Similarity scoring ────────────> F8 Derivatives
│   └── _assign_generations ───────> F7 Family Tree
├── record_token_creation ─────────> intelligence_events table
│   ├── compute_deployer_profile ──> F1 Deployer Profile
│   ├── compute_death_clock ───────> F1 Death Clock
│   ├── analyze_factory_rhythm ────> F1 Factory Rhythm
│   └── build_operator_fingerprint > F2 Operator Fingerprint
│       └── compute_operator_impact > F2 Operator Impact
├── analyze_insider_sell ──────────> F1 Insider Sell (Initiative 4)
├── trace_sol_flow ────────────────> F3 SOL Flow
│   └── detect_bridge_exits ───────> F3 Cross-chain exits
├── build_cartel_edges + report ──> F4 Cartel Detection
│   └── cartel_financial_service ──> F4 Financial Graph
└── analyze_bundle ────────────────> F5 Bundle Detection
```

### Refactoring Recommendations

1. **Create `lineage_agent/utils.py`** — Extract `parse_datetime()`, `classify_narrative()`, `CEX_ADDRESSES`, `SKIP_PROGRAMS` into shared utilities.

2. **Add `lineage_agent/constants.py`** (partially exists) — Centralize all frozensets of known addresses. Currently duplicated across `sol_flow_service.py`, `cartel_service.py`, `cartel_financial_service.py`, `bundle_tracker_service.py`, `metadata_dna_service.py`.

3. **Introduce persistence for bundle results** — Mirror the `sol_flows` table pattern: analyse once, persist, serve from DB on subsequent requests.

4. **Replace O(n²) pHash comparison** — Use a pHash index table with pre-computed hamming-distance buckets, or switch to a vector database for ANN search.

5. **Add a `/config` endpoint** — Expose scoring weights, thresholds, and version info so the frontend can render accurate configuration state.

6. **Enhance deployer scoring** — Integrate OperatorFingerprint linked_wallets into `compute_deployer_score()` for partial credit.

### Confidence Assessment

| Aspect | Confidence |
|--------|------------|
| Backend code reading completeness | **95%** — Read all 15+ service files end-to-end |
| Frontend coverage | **85%** — Read all 7 page files + 13 forensics components (file listing) |
| Test coverage assessment | **90%** — Read all test files, counted lines, verified coverage gaps |
| Data accuracy evaluation | **80%** — Based on code logic, not live testing. Edge cases inferred from code. |
| Overall audit confidence | **88%** |

---

*Generated by scanning ~15,000 lines of Python backend, ~4,000 lines of TypeScript frontend, and ~4,200 lines of tests.*
