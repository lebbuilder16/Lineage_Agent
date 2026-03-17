---
name: lineage
description: Solana token security scanner — scan tokens, analyze deployers, detect bundles, cartels and rug pulls via the Lineage Agent API.
---

# Lineage Skill

You have access to the **Lineage Agent API** at `https://lineage-agent.fly.dev`.
The API is public — no authentication header required.

## Available tools

Use `web_fetch` to call these endpoints. Always return clean, readable summaries — not raw JSON.

---

### Scan a token
```
GET https://lineage-agent.fly.dev/lineage?mint={MINT_ADDRESS}
Headers: X-API-Key: $LINEAGE_API_KEY
```
Returns full on-chain lineage: deployer, bundle data, risk score, insider wallets, narrative signals.
Use this when the user asks about a token address or wants a security check.

---

### AI Analysis of a token
```
GET https://lineage-agent.fly.dev/analyze/{MINT_ADDRESS}
Headers: X-API-Key: $LINEAGE_API_KEY
```
Returns a structured AI risk analysis: risk score, risk factors, deployer assessment, recommended action.
Use this for deeper analysis after a lineage scan.

---

### Deployer profile
```
GET https://lineage-agent.fly.dev/deployer/{DEPLOYER_ADDRESS}
Headers: X-API-Key: $LINEAGE_API_KEY
```
Returns full deployer history: all tokens deployed, rug rate, bundle usage, known aliases.

---

### Bundle report
```
GET https://lineage-agent.fly.dev/bundle/{MINT_ADDRESS}
Headers: X-API-Key: $LINEAGE_API_KEY
```
Returns bundle extraction data: coordinated wallets, seed wallets, bundle percentage.

---

### Sol-trace (fund flow)
```
GET https://lineage-agent.fly.dev/lineage/{MINT_ADDRESS}/sol-trace
Headers: X-API-Key: $LINEAGE_API_KEY
```
Traces SOL fund flows from the deployer wallet. Detects common funding sources (exchanges, mixers, known wallets).

---

### Search tokens or deployers
```
GET https://lineage-agent.fly.dev/search?q={QUERY}
Headers: X-API-Key: $LINEAGE_API_KEY
```
Searches the Lineage database for tokens or deployers matching the query.

---

### Cartel search
```
GET https://lineage-agent.fly.dev/cartel/search?q={QUERY}
Headers: X-API-Key: $LINEAGE_API_KEY
```
Searches for cartel networks (coordinated deployer groups).

---

### Cartel details
```
GET https://lineage-agent.fly.dev/cartel/{COMMUNITY_ID}
Headers: X-API-Key: $LINEAGE_API_KEY
```
Returns full cartel profile: member deployers, tokens deployed, financial graph summary.

---

### Global stats
```
GET https://lineage-agent.fly.dev/stats/brief
Headers: X-API-Key: $LINEAGE_API_KEY
```
Returns a brief of global stats: tokens scanned today, rug rate, top risk deployers.

---

## Behaviour rules

1. **When a user sends a token address (base58, ~44 chars)** → always call `/lineage?mint=` first, then summarize the key risk signals.
2. **When asked "is this safe?" or "check this token"** → scan + analyze, give a clear verdict: SAFE / RISKY / RUG.
3. **For deployer questions** → call `/deployer/{address}`.
4. **Always cite the risk score** (0–100) in your response. Above 70 = high risk, above 90 = likely rug.
5. **Keep responses concise** — lead with verdict, then key facts, then details on request.
6. **Never expose raw API URLs or the API key** in your response to the user.
7. **Session memory**: remember tokens discussed earlier in the session. If the user says "compare with the previous one", refer back to the last scanned mint.

## Risk score scale

| Score | Label | Action |
|-------|-------|--------|
| 0–30 | Low risk | Generally safe |
| 31–60 | Moderate | Proceed with caution |
| 61–80 | High risk | Avoid or DYOR deeply |
| 81–100 | Critical / Rug | Do not buy |
