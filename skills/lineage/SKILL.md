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
1. **Token address received (base58, ~44 chars)** → call `/lineage?mint=&force_refresh=true` AND `/analyze/{mint}` (both). The scan gives raw data, the analyze gives AI risk score + pattern. You MUST use both to form your verdict.
2. **"Is this safe?" / "check this token"** → same as #1: scan + analyze, give a clear verdict.
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

- Risk score AI: X/100 (pattern: [rug_pattern])
- Death clock: [risk_level] — probabilité de rug: X%
- Confiance: death clock [low/medium/high] (X échantillons) / AI [low/medium/high]
- Base du verdict: [death clock / analyse comportementale / signaux convergents]

SIGNAUX CLÉS:
- [Signal 1 — le plus important, avec emoji 🚨 si critique, ⚠️ si warning]
- [Signal 2]
- [Signal 3]

MARKET DATA:
- Market cap: $X
- Liquidité: $X (Y% du MC)
- Pools: [détail par DEX si disponible, ex: "99% Pumpswap, 1% Meteora"]
- Statut: [bonding curve / migré sur DEX / DEX natif]
- Âge: Xh

INSIDER SELL:
- Verdict: [clean/suspicious/insider_dump]
- Flags: [DEPLOYER_EXITED, etc.]
- Pression vendeuse: X% en 1h, Y% en 6h, Z% en 24h
- Variation prix: X% en 1h, Y% en 24h

[Si sol_flow présent]:
SOL FLOW:
- Extraction totale: X SOL
- Pattern: [étoile/entonnoir/chaîne] — X wallets intermédiaires
- Sink wallet: [adresse abrégée]
- CEX détecté: oui/non
- Extraction en X hops

[Si opérateur détecté]:
OPÉRATEUR:
- Fingerprint: [abrégé] (confirmé/inféré)
- Wallets liés: X
- Pattern: [description_pattern]
- Rug rate réseau: X%

[Si clone/dérivé]:
LIGNÉE:
- Clone de [NOM] ($XXX mcap)
- Famille: X tokens (Y dérivés + root)
- Confiance de détection: X%
- [Si clones rapides]: X clones en Y min → pattern factory

BUNDLE:
- [Si données]: X bundles, Y SOL extraits, verdict: Z
- [Si null]: Aucun bundle détecté par l'API

[Si des signaux sont absents]:
DONNÉES MANQUANTES:
- [champ]: non disponible
- [etc.]
```

### Verdict calibration — CRITICAL

10. **Two-source verdict system.** Your verdict is formed by combining TWO independent sources:
    - **Death clock confidence** (deployer history: sample_count, operator_sample_count)
    - **AI analysis risk_score** (from `/analyze` endpoint: pattern detection, SOL flow, coordination)

    **Rules:**
    - If `/analyze` risk_score >= 70 AND has concrete evidence (SOL flow extraction, factory wallets, coordinated dumps) → "HIGH RISK" or "CRITICAL" is allowed regardless of death clock confidence.
    - If death_clock confidence = low AND /analyze unavailable or risk_score < 50:
      - If token < 24h AND no negative signals → "CAUTION — token récent, surveillance recommandée" + list what WAS checked clean (bundle, deployer balance, liquidity ratio)
      - If token < 24h AND structural risk signals present (liquidity/MC < 10%, deployer exited) → "CAUTION — signaux structurels à surveiller" + cite specific signals
      - If token >= 24h → "CAUTION — données limitées" (original rule)
      - **NEVER say just "données limitées" without listing what was checked.** Transform "non disponible" into "vérifié: aucun signal" or "non vérifiable: [raison]".
    - If death_clock confidence = low AND /analyze risk_score 50-69 → "HIGH RISK" allowed but MUST say "death clock insuffisant, verdict basé sur l'analyse comportementale"
    - If at least 1 hard signal (bundle confirmed, insider_dump, sol_flow extraction) → escalate normally regardless of token age
    - If death_clock confidence = medium/high → follow death clock + /analyze combined
    - **Always cite WHICH source drives the verdict**: "Verdict basé sur [death clock historique / analyse comportementale AI / signaux convergents]"

    **Example of WRONG calibration:** death_clock=insufficient_data + /analyze=82 + factory pattern → verdict "CAUTION". This UNDER-reports real coordinated extraction.
    **Correct:** death_clock=insufficient_data + /analyze=82 + factory pattern → "HIGH RISK — pas d'historique de rug mais extraction coordonnée détectée (risk score AI: 82, pattern: factory_jito_bundle)"

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
    - **Always cite sell_pressure numbers** when available: sell_pressure_1h, sell_pressure_6h, sell_pressure_24h (format: "Pression vendeuse: X% en 1h, Y% en 6h, Z% en 24h")
    - **Always cite price_change numbers** when available: "Variation prix: X% en 1h, Y% en 24h"

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
    - **Always use `family_size` field** for the count — do NOT count derivatives manually and get it wrong
    - Mention how many derivatives exist: "Famille de X tokens (Y dérivés + root)"
    - If multiple clones deployed in rapid succession (check created_at timestamps), calculate the span and mention: "X clones en Y minutes → pattern factory"

19b. **SOL flow — CRITICAL SIGNAL, always analyze when present**:
    - Count the total flows and unique intermediate wallets
    - Identify the pattern: star (1→many), funnel (many→1), or chain (A→B→C)
    - Identify sink wallets: if multiple wallets send to the same destination, that's a sink
    - Cite total_extracted_sol
    - Cite whether CEX was detected (known_cex_detected)
    - If flows show distribution then reconcentration (deployer → intermediaries → sink), say: "Pattern d'extraction: distribution puis reconcentration vers [sink wallet]"
    - Mention hop_count: "Extraction en X hops"
    - If rug_timestamp is present, cite it: "Extraction déclenchée à HH:MM UTC"

19c. **Liquidity architecture — always mention**:
    - Cite concentration_hhi: if > 0.9, say "Liquidité hyper-concentrée (HHI: X)"
    - List pool distribution: "X% sur Pumpswap, Y% sur Raydium, etc."
    - Cite authenticity_score: if < 0.5, warn about artificial liquidity

19d. **AI analysis (`/analyze`) — ALWAYS include when called**:
    - Cite risk_score prominently: "Risk score AI: X/100"
    - Cite the rug_pattern: factory_jito_bundle, coordinated_bundle, serial_clone, etc.
    - Cite key_findings — select the 2-3 most important tagged findings
    - If wallet_classifications are present, mention team wallets and their roles
    - Cite conviction_chain if present (converging independent signals)

### Data priority & honesty

19. **IMPORTANT — Injected scan data**: When the message contains `[SCAN DATA]`, use those numbers as authoritative. Do NOT re-fetch the same token.
19a. **CRITICAL — `query_token` vs `root`**: The API returns BOTH `root` (oldest ancestor in lineage tree) and `query_token` (the actual scanned token). **Always use `query_token`** for market cap, liquidity, price, lifecycle. `root` may be a dead $1K token while `query_token` is at $90K. Getting this wrong produces wildly inaccurate reports.
20. **Never expose raw API URLs** in your response.
21. **Session memory**: remember tokens discussed. "Compare with the previous one" → use last scanned mint.
22. **Respond in the user's language** — match the user's language automatically.
23. **NEVER fabricate numbers.** If a field is null, say "non disponible". If data is missing, say "données absentes". If confidence is low, say so.
23b. **NEVER state or assume a SOL price.** SOL/USD conversion is only valid when `total_extracted_usd` or `liquidity_usd` is explicitly provided in the scan data. When only a SOL amount is given (e.g. "0.64 SOL extracted") with no USD equivalent, report the SOL amount only — do NOT multiply by an assumed price. Do not say "SOL is at $X" unless a live price is in the data.
23c. **Freshness label**: If the scan data says "CACHED DATA", mention it: "Données en cache — peuvent avoir jusqu'à 60s de retard". If it says "LIVE DATA", you may say the data is fresh.
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
