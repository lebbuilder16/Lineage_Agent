---
description: REST API endpoints, schemas, and streaming reference
---

# API Reference

**Base URL:** `https://lineage-agent.fly.dev`

All responses are JSON unless otherwise noted. SSE endpoints stream `text/event-stream`.

---

## Authentication

The public API requires no authentication. Rate limiting is applied per IP.

---

## Endpoints

### GET `/health`

Returns service status and circuit breaker states.

```bash
curl https://lineage-agent.fly.dev/health
```

**Response:**

```json
{
  "status": "ok",
  "version": "3.1.0",
  "circuit_breakers": {
    "dexscreener": "closed",
    "helius_rpc": "closed",
    "anthropic": "closed"
  },
  "cache_backend": "sqlite",
  "uptime_seconds": 86400
}
```

---

### GET `/lineage`

Full forensic analysis for a token mint address.

```
GET /lineage?mint={MINT_ADDRESS}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mint` | string | ✅ | Solana token mint address (base58) |

**Example:**

```bash
curl "https://lineage-agent.fly.dev/lineage?mint=5su44fkvYNM1qSSmne7GnH4USkyTBtTNhXjcCzLncD72"
```

**Response** — `LineageResult` schema:

```json
{
  "query_token": { ...TokenMetadata },
  "root": { ...TokenMetadata },
  "derivatives": [ ...DerivativeInfo ],
  "ai_analysis": {
    "risk_score": 82,
    "confidence": "high",
    "rug_pattern": "factory_jito_bundle",
    "verdict_summary": "Confirmed team extraction via Jito bundle",
    "narrative": {
      "observation": "...",
      "pattern": "...",
      "risk": "..."
    },
    "key_findings": [
      "[DEPLOYMENT] ...",
      "[FINANCIAL] ...",
      "[IDENTITY] ..."
    ],
    "conviction_chain": "Bundle forensics [FINANCIAL] confirm...",
    "operator_hypothesis": "..."
  },
  "bundle_report": { ...BundleExtractionReport },
  "sol_flow": { ...SolFlowReport },
  "death_clock": { ...DeathClockForecast },
  "zombie_alert": null,
  "operator_fingerprint": { ...OperatorFingerprint },
  "cartel_report": null,
  "insider_sell": { ...InsiderSellReport },
  "liquidity_arch": { ...LiquidityArchReport },
  "factory_rhythm": { ...FactoryRhythmReport },
  "deployer_profile": { ...DeployerProfile },
  "operator_impact": { ...OperatorImpactReport }
}
```

---

### GET `/analyze/{mint}/stream`

Streaming SSE endpoint — emits progress events as each signal completes.

```
GET /analyze/{mint}/stream
```

```bash
curl -N "https://lineage-agent.fly.dev/analyze/5su44fkvYNM1qSSmne7GnH4USkyTBtTNhXjcCzLncD72/stream"
```

**Events:**

```
data: {"step": "dexscreener", "status": "done", "elapsed_ms": 420}
data: {"step": "deployer_rpc", "status": "done", "elapsed_ms": 890}
data: {"step": "family_tree", "status": "done", "elapsed_ms": 2100}
data: {"step": "bundle_detection", "status": "done", "elapsed_ms": 8300}
data: {"step": "ai_analysis", "status": "done", "elapsed_ms": 33900}
data: {"step": "complete", "result": { ...LineageResult }}
```

---

### POST `/lineage/batch`

Batch analysis for up to 10 mint addresses.

```
POST /lineage/batch
Content-Type: application/json
```

**Body:**

```json
{
  "mints": [
    "5su44fkvYNM1qSSmne7GnH4USkyTBtTNhXjcCzLncD72",
    "2s93qBeapcPN26buMxdsSZejmNQAmfnZiNDm7UH8Fa6t"
  ]
}
```

**Response:**

```json
{
  "results": [
    { "mint": "5su44...", "result": { ...LineageResult } },
    { "mint": "2s93q...", "result": { ...LineageResult } }
  ]
}
```

---

### GET `/search`

Search tokens by name or symbol.

```
GET /search?q={QUERY}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | ✅ | Token name or symbol |

```bash
curl "https://lineage-agent.fly.dev/search?q=PEPE"
```

**Response:**

```json
{
  "results": [
    {
      "mint": "...",
      "name": "Pepe Classic",
      "symbol": "PEPE",
      "created_at": "2025-01-15T10:22:00Z",
      "pair_created_at": "2025-01-15T12:05:00Z",
      "deployer": "...",
      "liquidity_usd": 45000
    }
  ]
}
```

---

### GET `/deployer/{address}`

Historical deployer profile — all tokens deployed, rug count and rate.

```
GET /deployer/{WALLET_ADDRESS}
```

```bash
curl "https://lineage-agent.fly.dev/deployer/Abc123..."
```

**Response — `DeployerProfile`:**

```json
{
  "address": "Abc123...",
  "total_tokens_deployed": 12,
  "rug_count": 9,
  "rug_rate": 0.75,
  "total_sol_extracted": 48.3,
  "first_deployment": "2024-06-01T00:00:00Z",
  "last_deployment": "2025-11-20T00:00:00Z",
  "known_tokens": [ ... ]
}
```

---

### GET `/operator/{fingerprint}`

Cross-wallet operator impact report.

```
GET /operator/{FINGERPRINT_HEX}
```

---

### GET `/lineage/{mint}/sol-trace`

SOL flow trace for a specific token post-rug.

```
GET /lineage/{mint}/sol-trace
```

**Response — `SolFlowReport`:**

```json
{
  "rug_timestamp": "2025-11-20T14:32:00Z",
  "flows": [
    {
      "from_wallet": "...",
      "to_wallet": "...",
      "amount_sol": 12.5,
      "hop": 0,
      "destination_type": "cex"
    }
  ],
  "cross_chain_exits": [
    {
      "bridge": "wormhole",
      "amount_sol": 8.2,
      "destination_chain": "ethereum"
    }
  ],
  "total_sol_traced": 20.7
}
```

---

### GET `/bundle/{mint}`

Bundle extraction analysis for a specific token.

```
GET /bundle/{mint}
```

---

### GET `/cartel/search`

Search for cartel communities by deployer wallet or token mint.

```
GET /cartel/search?q={ADDRESS_OR_MINT}
```

---

### GET `/cartel/{community_id}`

Detail of a specific cartel community.

```
GET /cartel/{COMMUNITY_ID}
```

---

### GET `/cartel/{deployer}/financial`

Financial graph of cartel community linked to a specific deployer.

```
GET /cartel/{DEPLOYER_ADDRESS}/financial
```

---

## Key Data Models

### `TokenMetadata`

| Field | Type | Description |
|-------|------|-------------|
| `mint` | string | Token mint address |
| `name` | string | Token name |
| `symbol` | string | Ticker symbol |
| `created_at` | datetime | On-chain mint initialisation timestamp |
| `pair_created_at` | datetime \| null | First DEX listing (DexScreener `pairCreatedAt`) |
| `deployer` | string | Deployer wallet address |
| `logo_uri` | string \| null | Token logo URL |
| `liquidity_usd` | float | Current liquidity in USD |
| `market_cap_usd` | float \| null | Current market cap |

{% hint style="info" %}
When `created_at` and `pair_created_at` differ by more than 24h, the token was **stealth pre-minted** — minted on-chain long before its public DEX listing.
{% endhint %}

---

### `BundleExtractionReport`

| Field | Type | Description |
|-------|------|-------------|
| `overall_verdict` | string | See verdicts table below |
| `bundle_wallets` | list | Per-wallet analysis |
| `coordinated_sell_detected` | bool | Simultaneous sell within 80 seconds |
| `common_funder` | string \| null | Shared pre-launch funding wallet |

**Verdicts:**

| Value | Meaning |
|-------|---------|
| `confirmed_team_extraction` | Direct wallet linkage proven |
| `suspected_team_extraction` | Strong circumstantial evidence |
| `coordinated_dump_unknown_team` | Coordination proven, team unknown |
| `early_buyers_no_link_proven` | No coordination evidence |

---

### `DeathClockForecast`

| Field | Type | Description |
|-------|------|-------------|
| `risk_level` | string | `low / medium / high / critical / first_rug / insufficient_data` |
| `forecast_window_hours_min` | float | Lower bound of rug window |
| `forecast_window_hours_max` | float | Upper bound of rug window |
| `confidence` | string | `low / medium / high` |
| `sample_count` | int | Number of historical rug events used |

---

## Error Responses

```json
{
  "detail": "Token not found on DexScreener",
  "status_code": 404
}
```

| Status | Meaning |
|--------|---------|
| 400 | Invalid mint address format |
| 404 | Token not found |
| 429 | Rate limit exceeded |
| 503 | Upstream service unavailable (circuit open) |
