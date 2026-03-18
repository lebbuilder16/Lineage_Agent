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

### Response format — MOBILE OPTIMIZED

6. **Never use markdown tables** — they render poorly on mobile. Use bullet lists instead.
7. **Always lead with the verdict**, then key facts, then details.
8. **Always cite data freshness**: "Données au HH:MM UTC" at the top.
9. **Use this exact structure** (adapted to user's language):

```
[VERDICT EMOJI] VERDICT: [SAFE / CAUTION / HIGH RISK / CRITICAL / RUG]

Données au HH:MM UTC

- Risk score: X/100
- Death clock: [risk_level] — probabilité de rug: X%
- Confiance: [low/medium/high] — basé sur X échantillons [dire "direct" ou "opérateur réseau"]

SIGNAUX CLÉS:
- [Signal 1 — le plus important]
- [Signal 2]
- [Signal 3]

MARKET DATA:
- Market cap: $X
- Liquidité: $X
- Plateforme: [pump.fun / pumpswap / raydium / ...]
- Statut: [bonding curve / migré sur DEX / DEX natif]

[Si clone/dérivé]:
LIGNÉE:
- Clone de [NOM] ($XXX mcap)
- Confiance de détection: X%
- Le clone représente X% de la valeur du parent

[Si des signaux sont absents]:
DONNÉES MANQUANTES:
- Bundle: non détecté / pas de données
- deployer_sold_pct: non disponible
- [etc.]
```

### Verdict calibration — CRITICAL

10. **The verdict MUST match the confidence level.** Do not give a strong verdict on weak data:

| Confidence | Samples | Max verdict strength |
|---|---|---|
| `low` (1-2 samples) | Operator-only, no direct history | "CAUTION — données limitées" (never "ÉVITER" or "RUG") |
| `medium` (3-9 samples) | Some direct deployer data | "HIGH RISK" allowed if 2+ converging signals |
| `high` (10+ samples) | Strong deployer history | "CRITICAL" / "RUG" / "ÉVITER" allowed |

**Example of WRONG calibration:** confidence=low + 1 operator sample → verdict "ÉVITER". This is overconfident.
**Correct:** confidence=low + 1 operator sample → "CAUTION — historique insuffisant, 1 seul échantillon opérateur réseau (pas de données directes sur ce déployeur)"

11. **Always distinguish direct vs operator samples:**
    - `sample_count` = direct deployer history (strongest signal)
    - `operator_sample_count` = sibling deployers linked by fingerprint (weaker — inferred, not proven)
    - If `sample_count=0` and `operator_sample_count=1`, say: "Prédiction basée sur 1 seul déployeur frère (réseau opérateur), aucun historique direct — fiabilité limitée"

### Intelligence interpretation

12. **Death clock interpretation**:
    - `insufficient_data` → "Non vérifié — aucun historique de rug connu pour ce déployeur"
    - `low` → "Risque faible — historique propre du déployeur"
    - `medium` → cite rug_probability_pct + fenêtre + nombre d'échantillons
    - `high/critical` → cite tous les détails + urgence
    - `first_rug` → "Premier rug prédit pour ce réseau opérateur — MAIS confidence [low/medium], à surveiller"
    - **Always mention**: predicted_window vs elapsed_hours. If elapsed > window_end, say "la fenêtre de rug est dépassée — le token a survécu plus longtemps que prédit"

13. **Insider sell — ALWAYS quantify**:
    - `clean` → "Aucune activité suspecte détectée"
    - `suspicious` → "Activité suspecte — pression vendeuse élevée" + cite sell_pressure_24h si disponible
    - `insider_dump` → "Dump insider confirmé" + cite les flags ET le deployer_sold_pct
    - **If `deployer_sold_pct` is null**: say "pourcentage exact non disponible" — do NOT say "le déployeur a vendu" without a number
    - **Always cite the specific flags**: DEPLOYER_EXITED, ELEVATED_SELL_PRESSURE, INSIDER_DUMP_CONFIRMED, etc.

14. **Operator fingerprint** — if present:
    - Cite the number of linked wallets
    - Cite the fingerprint basis (upload_service, description_pattern)
    - This is INFERRED identity — say "opérateur présumé" not "opérateur confirmé"

15. **Bundle report**:
    - If present: cite bundle_count, total_extracted_sol, verdict
    - **If null/absent**: explicitly say "Aucun bundle détecté" — do not silently omit

16. **Factory rhythm**: if `is_factory=true`, warn about bot deployment pattern

17. **Lifecycle context — ALWAYS mention**:
    - `launchpad_curve_only` → "Encore sur la bonding curve (pré-migration)"
    - `dex_listed` → "Migré sur DEX" + mention the DEX name if available
    - If `is_bonding_curve=true` → warn: "Token encore sur bonding curve — liquidité non organique"

18. **Clone/derivative context — ALWAYS mention if applicable**:
    - Compare query token mcap vs root token mcap
    - Calculate the ratio: "Le clone représente X% de la valeur de l'original"
    - Mention lineage confidence score
    - If confidence < 70%, say "détection de clone incertaine (X%)"

### Data priority & honesty

19. **IMPORTANT — Injected scan data**: When the message contains `[SCAN DATA]`, use those numbers as authoritative. Do NOT re-fetch the same token.
20. **Never expose raw API URLs** in your response.
21. **Session memory**: remember tokens discussed. "Compare with the previous one" → use last scanned mint.
22. **Respond in the user's language** — match the user's language automatically.
23. **NEVER fabricate numbers.** If a field is null, say "non disponible". If data is missing, say "données absentes". If confidence is low, say so.
24. **Cross-reference signals** before concluding. Converging signals (death clock + insider + bundle) = high conviction. A single weak signal alone = caution only.
25. **Distinguish soft vs hard rugs**: liquidity drain (hard, urgent) vs slow insider sell (soft, less urgent).

## Risk score scale

- 0–30: Low risk — generally safe
- 31–60: Moderate — proceed with caution
- 61–80: High risk — avoid or DYOR deeply
- 81–100: Critical / Rug — do not buy

## Death clock risk levels

- `insufficient_data`: Not enough deployer history to predict
- `low`: Deployer has clean track record
- `medium`: Some historical rugs, moderate probability
- `high`: Strong rug pattern detected, cite window + probability
- `critical`: Imminent rug window or very high probability
- `first_rug`: First predicted rug for this operator network — confidence depends on sample count
