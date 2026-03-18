---
name: lineage
description: Solana token security scanner — scan tokens, analyze deployers, detect bundles, cartels, operator networks and rug pulls via the Lineage Agent API. Includes death clock forecasting, financial graphs, token comparison and batch analysis.
---

# Lineage Skill

You have access to the **Lineage Agent API** at `https://lineage-agent.fly.dev`.
The API is public — no authentication header required.

## Available endpoints

Use `web_fetch` to call these endpoints. Always return clean, readable summaries — not raw JSON.

---

### 1. Scan a token (primary)
```
GET https://lineage-agent.fly.dev/lineage?mint={MINT_ADDRESS}&force_refresh=true
```
Returns the **full forensic report** including all 12 intelligence signals below.
Always use `force_refresh=true` for live DexScreener data (market cap, liquidity, price).

**Key fields in the response:**

| Field | What it tells you |
|-------|-------------------|
| `root` | Token metadata: name, symbol, deployer, market_cap_usd, liquidity_usd, created_at, launch_platform, lifecycle_stage, market_surface |
| `derivatives` | Clone/copycat tokens detected (name, symbol, image similarity scores) |
| `confidence` | Lineage detection confidence (0–1) |
| `death_clock` | Rug timing forecast: risk_level, rug_probability_pct, predicted_window_start/end, median_rug_hours, historical_rug_count, basis_breakdown, is_factory |
| `bundle_report` | Bundle wallets: bundle_count, total_extracted_sol, verdict, team_wallets |
| `insider_sell` | Silent drain detection: verdict (clean/suspicious/insider_dump), deployer_sold_pct, flags |
| `operator_fingerprint` | Cross-wallet identity: operator_id, total_tokens, rug_rate, linked_wallets |
| `liquidity_arch` | Pool analysis: concentration_hhi, liq_to_volume_ratio, authenticity_score |
| `factory_rhythm` | Bot detection: regularity_score, naming_pattern, is_factory |
| `sol_flow` | Fund flow: edges (from→to, amount_sol), destinations (exchange, mixer, unknown) |
| `cartel_report` | Operator network: community_id, member_count, total_rugs |
| `zombie_alert` | Token relaunch/resurrection detection |
| `deployer_profile` | Deployer history: total_tokens, rug_count, narratives, kyc_status |

**Platform context fields in `root`:**
- `launch_platform`: moonshot, pumpfun, letsbonk, believe, or null
- `lifecycle_stage`: launchpad_curve_only, migration_pending, dex_listed
- `market_surface`: launchpad_curve_only, dex_pool_observed, conflicting
- `is_bonding_curve`: true if token is still on bonding curve (not yet migrated to DEX)

---

### 2. AI forensic analysis
```
GET https://lineage-agent.fly.dev/analyze/{MINT_ADDRESS}
```
Returns a structured AI risk analysis powered by Claude. Includes:
- `risk_score` (0–100), `confidence` (low/medium/high)
- `rug_pattern`: classic_rug, slow_rug, pump_dump, coordinated_bundle, factory_jito_bundle, serial_clone, insider_drain, unknown
- `verdict_summary`: one-sentence headline
- `narrative.observation`: red flags synthesis
- `narrative.pattern`: temporal attack chain (staging → accumulation → exit)
- `narrative.risk`: quantified damage + residual risk
- `key_findings`: tagged findings ([DEPLOYMENT], [FINANCIAL], [COORDINATION], [IDENTITY], [TIMING], [EXIT])
- `wallet_classifications`: wallet → role (team_wallet, bundle_wallet, cash_out, cex_deposit, burner)
- `conviction_chain`: 3+ converging independent signals
- `operator_hypothesis`: WHO, WHAT playbook, distinguishing factor

Use this for deeper analysis after a lineage scan or when the user asks "analyze this".

---

### 3. Token comparison
```
GET https://lineage-agent.fly.dev/compare?mint_a={MINT_A}&mint_b={MINT_B}
```
Side-by-side similarity analysis: name, symbol, image (perceptual hash), deployer, temporal proximity.
Returns composite score (0–1) and verdict: `identical_operator`, `clone`, `related`, `unrelated`.

Use when the user asks to compare two tokens or says "compare with the previous one".

---

### 4. Deployer profile
```
GET https://lineage-agent.fly.dev/deployer/{DEPLOYER_ADDRESS}
```
Full deployer history: all tokens deployed, rug rate, bundle usage, narratives, aliases, total damage.

---

### 5. Bundle report
```
GET https://lineage-agent.fly.dev/bundle/{MINT_ADDRESS}
```
Bundle extraction forensics: coordinated wallets, seed wallets, extraction amounts, bundle percentage.

---

### 6. SOL flow trace
```
GET https://lineage-agent.fly.dev/lineage/{MINT_ADDRESS}/sol-trace
```
Capital flow tracing from deployer wallet. Detects exchanges (Binance, OKX), mixers, known wallets. Returns edge graph with SOL amounts per hop.

---

### 7. Operator impact report
```
GET https://lineage-agent.fly.dev/operator/{FINGERPRINT_ID}
```
Cross-wallet operator damage ledger. Aggregates rug counts, total tokens, historical damage across all wallets linked by the same operator fingerprint.

---

### 8. Financial coordination graph
```
GET https://lineage-agent.fly.dev/cartel/{DEPLOYER_ADDRESS}/financial
```
Scores funding links, shared LP wallets, sniper rings, and metadata edges between deployers. Returns composite financial coordination score.

---

### 9. Cartel search & details
```
GET https://lineage-agent.fly.dev/cartel/search?q={QUERY}
GET https://lineage-agent.fly.dev/cartel/{COMMUNITY_ID}
```
Search and retrieve cartel networks (coordinated deployer groups): members, tokens, financial summary.

---

### 10. Batch scan (up to 10 tokens)
```
POST https://lineage-agent.fly.dev/lineage/batch
Body: { "mints": ["MINT_1", "MINT_2", ..., "MINT_10"] }
```
Concurrent analysis of multiple tokens. Returns results per mint. Use for portfolio scanning or watchlist checks.

---

### 11. Search
```
GET https://lineage-agent.fly.dev/search?q={QUERY}
```
Search tokens by name or symbol via DexScreener.

---

### 12. Statistics
```
GET https://lineage-agent.fly.dev/stats/brief
GET https://lineage-agent.fly.dev/stats/global
GET https://lineage-agent.fly.dev/stats/top-tokens?limit=10
```
- `brief`: 2-sentence intelligence summary
- `global`: 24h aggregate (tokens scanned, rug count, top narratives)
- `top-tokens`: most active tokens by intelligence event count

---

## Behaviour rules

### Core rules
1. **Token address received (base58, ~44 chars)** → call `/lineage?mint=&force_refresh=true`, summarize key signals.
2. **"Is this safe?" / "check this token"** → scan + analyze, give a clear verdict.
3. **Deployer questions** → call `/deployer/{address}`.
4. **"Compare these tokens"** → call `/compare?mint_a=&mint_b=`.
5. **"Scan my portfolio"** → use `/lineage/batch` with the mint list.

### Response format
6. **Always lead with the verdict**, then key facts, then details on request.
7. **Always cite the risk score** (0–100) and the death clock risk level when available.
8. **Always cite data freshness**: "as of [timestamp]" when quoting market cap, liquidity, or price.
9. **Keep responses concise** — use this structure:

```
VERDICT: [SAFE / CAUTION / HIGH RISK / CRITICAL / RUG]
Risk score: X/100 | Death clock: [risk_level] | Rug probability: X%

Key findings:
- [Most important signal]
- [Second signal]
- [Third signal]

Market data (as of HH:MM UTC):
- Market cap: $X | Liquidity: $X | Platform: [name]
```

### Intelligence interpretation
10. **Death clock interpretation**:
    - `insufficient_data` → "Unverified — no deployer history"
    - `low` → "Low risk based on deployer track record"
    - `medium/high/critical` → cite rug_probability_pct, predicted window, median_rug_hours
    - `first_rug` → "First predicted rug for this deployer"
11. **Insider sell verdicts**: `clean` = no suspicious activity, `suspicious` = monitor, `insider_dump` = active drain
12. **Operator fingerprint**: if present, mention the operator's total tokens and rug rate across all linked wallets
13. **Factory rhythm**: if `is_factory=true`, warn about bot/scripted deployment pattern
14. **Lifecycle context**: distinguish bonding curve tokens (pre-migration) from DEX-listed tokens

### Data priority
15. **IMPORTANT — Injected scan data**: When the message contains `[SCAN DATA]`, use those numbers as the authoritative source. Do NOT re-fetch the same token — the injected data is fresher than any cached API response.
16. **Never expose raw API URLs** in your response.
17. **Session memory**: remember tokens discussed earlier. "Compare with the previous one" → use last scanned mint.
18. **Respond in the user's language** — if the user writes in French, respond in French. Same for any language.

### Reasoning guidelines
19. **Cross-reference signals** before concluding. A high death clock risk + insider dump + bundle extraction = high conviction. A single weak signal alone is not enough for a strong verdict.
20. **Distinguish soft vs hard rugs**: liquidity drain (hard) vs slow insider sell (soft) have different urgency levels.
21. **Always mention if data is insufficient** — don't guess. "Insufficient data" is a valid and honest answer.

## Risk score scale

| Score | Label | Action |
|-------|-------|--------|
| 0–30 | Low risk | Generally safe |
| 31–60 | Moderate | Proceed with caution |
| 61–80 | High risk | Avoid or DYOR deeply |
| 81–100 | Critical / Rug | Do not buy |

## Death clock risk levels

| Level | Meaning |
|-------|---------|
| insufficient_data | Not enough deployer history to predict |
| low | Deployer has clean track record |
| medium | Some historical rugs, moderate probability |
| high | Strong rug pattern detected |
| critical | Imminent rug window or very high probability |
| first_rug | Deployer's first predicted rug event |
