---
description: Analyse your first Solana token in under 2 minutes
---

# Getting Started

## Option 1 — Use the Web App (No Setup)

The fastest way to run a forensic analysis:

1. Open [**www.lineagefun.xyz**](https://www.lineagefun.xyz)
2. Paste any Solana token mint address in the search bar
3. Hit **Analyse** — results stream in real-time

That's it. No account, no API key, no installation required.

---

## Option 2 — Query the API Directly

The public REST API is available at `https://lineage-agent.fly.dev`.

### Full Analysis

```bash
curl "https://lineage-agent.fly.dev/lineage?mint=<TOKEN_MINT>"
```

Example with a real token:

```bash
curl "https://lineage-agent.fly.dev/lineage?mint=5su44fkvYNM1qSSmne7GnH4USkyTBtTNhXjcCzLncD72"
```

### Streaming (SSE)

For step-by-step progress as the analysis runs:

```bash
curl -N "https://lineage-agent.fly.dev/analyze/5su44fkvYNM1qSSmne7GnH4USkyTBtTNhXjcCzLncD72/stream"
```

Each event arrives as a JSON object with a `step` field indicating which signal completed.

### Token Search

```bash
curl "https://lineage-agent.fly.dev/search?q=MEME"
```

### Health Check

```bash
curl "https://lineage-agent.fly.dev/health"
```

---

## Option 3 — Self-Host

### Prerequisites

| Tool | Version |
|------|---------|
| Python | ≥ 3.11 |
| Node.js | ≥ 20 |
| Docker | Any recent |

### 1. Clone the repo

```bash
git clone https://github.com/lebbuilder16/Lineage_Agent.git
cd Lineage_Agent
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — required keys:
# ANTHROPIC_API_KEY=sk-ant-...
# SOLANA_RPC_ENDPOINT=https://api.mainnet-beta.solana.com
```

### 3. Start with Docker Compose

```bash
docker compose up --build
```

- Backend API → `http://localhost:8000`
- Frontend → `http://localhost:3000`

### 4. Or run individually

**Backend:**

```bash
pip install -r requirements.txt
python src/main.py --server
```

**Frontend:**

```bash
cd frontend
npm ci
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

---

## Understanding the Output

Once an analysis completes, the response contains:

| Field | Description |
|-------|-------------|
| `query_token` | The token you scanned |
| `root` | The original (root) token in the family |
| `derivatives` | All clones/forks with generation numbers |
| `ai_analysis.risk_score` | 0–100 forensic risk score |
| `ai_analysis.conviction_chain` | Causal deduction chain naming ≥ 3 signals |
| `ai_analysis.rug_pattern` | Classified pattern (e.g. `factory_jito_bundle`) |
| `bundle_report` | Jito bundle extraction evidence + verdict |
| `death_clock` | Probabilistic rug timing forecast |
| `operator_fingerprint` | Cross-wallet operator identity linkage |
| `sol_flow` | Post-rug capital routing (BFS 3-hop) |

### Risk Score Interpretation

| Score | Meaning |
|-------|---------|
| 0–30 | Low risk — sparse signals |
| 31–54 | Moderate — review manually |
| 55–74 | High — multiple converging signals |
| 75–100 | Critical — confirmed or near-confirmed extraction |

Scores ≥ 55 are analysed by Claude Sonnet 4.6; scores < 55 by Claude Haiku 4.5.

---

## Telegram Bot

The Lineage Agent is also available as a Telegram bot.

| Command | Description |
|---------|-------------|
| `/lineage <mint>` | Full forensic analysis |
| `/search <name>` | Search tokens by name |
| `/help` | Command list |
