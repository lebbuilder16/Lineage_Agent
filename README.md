# 🧬 Meme Lineage Agent

An agentic tool for the **Solana memecoin ecosystem** that detects and manages
the lineage of memecoins — identifying the **root** token and its derivatives
(forks, clones, imposters).

## Problem

Memecoins on Solana proliferate through imitations: same name, logo, ticker.
Without a clear way to distinguish the _real_ token from opportunistic clones,
traders buy the wrong token, communities fragment, and scammers thrive.

**Meme Lineage Agent** groups tokens into families (root + derivatives) and
exposes those relationships via a CLI, REST API, Telegram bot, and web dashboard.

---

## Features

| Feature | Description |
| --- | --- |
| **Lineage Detection** | Compares name, symbol, image (perceptual hash), deployer address and creation time to determine root vs. clone |
| **Family Tree Graph** | Interactive force-directed visualisation of token families |
| **REST API** | FastAPI server with `/lineage`, `/search`, `/health` endpoints |
| **Telegram Bot** | `/lineage <mint>`, `/search <name>` commands with rich lineage cards |
| **CLI** | `python src/main.py --mint <MINT>` for quick terminal lookups |
| **Scoring** | Weighted multi-signal composite score with configurable thresholds |
| **Caching** | In-memory TTL cache to avoid hammering external APIs |

## Architecture

```
Lineage_Agent/
├── src/                          # Python backend
│   ├── main.py                   # CLI entrypoint
│   ├── config.py                 # All configuration (env vars)
│   └── lineage_agent/
│       ├── __init__.py
│       ├── lineage_detector.py   # Core detection logic
│       ├── similarity.py         # Levenshtein, pHash, deployer, temporal
│       ├── cache.py              # TTL in-memory cache
│       ├── models.py             # Pydantic data models
│       ├── api.py                # FastAPI REST API
│       ├── telegram_bot.py       # Telegram bot
│       └── data_sources/
│           ├── dexscreener.py    # DexScreener API client
│           └── solana_rpc.py     # Solana JSON-RPC client
├── frontend/                     # Next.js web dashboard
│   ├── src/app/                  # Pages (home, lineage, search)
│   ├── src/components/           # React components
│   └── src/lib/api.ts            # API client
├── requirements.txt              # Python dependencies
├── .env.example                  # Environment variable template
└── README.md
```

## Data Sources

- **DexScreener** (free, no API key) — token search, pair data, metadata
- **Solana RPC** (public endpoint) — deployer discovery, creation timestamp

## Quick Start

### 1. Backend

```bash
# Create virtual environment and install dependencies
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Copy and edit environment variables
cp .env.example .env

# Run CLI
python src/main.py --mint <SOLANA_MINT_ADDRESS>

# Run API server
cd src && uvicorn lineage_agent.api:app --reload
# → http://localhost:8000/docs  (Swagger UI)
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### 3. Telegram Bot

Set `TELEGRAM_BOT_TOKEN` in your `.env` file, then:

```bash
cd src && python -m lineage_agent.telegram_bot
```

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/lineage?mint=<MINT>` | Full lineage detection |
| `GET` | `/search?q=<QUERY>` | Search tokens by name/symbol |

## Configuration

All settings are in `src/config.py` and can be overridden via environment
variables. See `.env.example` for the full list.

## License

MIT
