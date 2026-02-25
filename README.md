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
| **Telegram Bot** | `/lineage <mint>`, `/search <name>`, `/help` commands with rich lineage cards |
| **CLI** | `python src/main.py --mint <MINT>` or `lineage-agent --mint <MINT>` after install |
| **Scoring** | Weighted multi-signal composite score with configurable thresholds |
| **Caching** | In-memory TTL cache + optional SQLite persistent cache |
| **Rate Limiting** | Per-IP rate limiting via slowapi on all public endpoints |
| **Structured Logging** | Text or JSON log format with per-request correlation IDs |
| **Jupiter Integration** | Price data and verified-token lookups from Jupiter aggregator |

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
│       ├── cache.py              # TTL in-memory + SQLite persistent cache
│       ├── models.py             # Pydantic data models
│       ├── api.py                # FastAPI REST API
│       ├── telegram_bot.py       # Telegram bot
│       ├── logging_config.py     # Structured logging (text / JSON)
│       └── data_sources/
│           ├── dexscreener.py    # DexScreener API client
│           ├── solana_rpc.py     # Solana JSON-RPC client
│           └── jupiter.py        # Jupiter aggregator client
├── frontend/                     # Next.js 14 web dashboard
│   ├── src/app/                  # Pages (home, lineage, search, 404, error)
│   ├── src/components/           # React components (SearchBar, FamilyTree)
│   ├── src/lib/api.ts            # API client
│   ├── e2e/                      # Playwright end-to-end tests
│   └── playwright.config.ts
├── tests/                        # Python test suite (182+ tests)
├── pyproject.toml                # Build config, ruff, mypy, pytest
├── requirements.txt              # Python dependencies
├── Dockerfile                    # Multi-stage backend + frontend
├── docker-compose.yml            # Orchestration
├── .github/workflows/ci.yml     # CI pipeline
├── .env.example                  # Environment variable template
└── README.md
```

## Data Sources

| Source | Purpose | Auth |
| --- | --- | --- |
| **DexScreener** | Token search, metadata | Free, no key |
| **Solana RPC** | Deployer discovery, creation timestamp | Public endpoint |
| **Jupiter** | Price data, verified token list | Free, no key |

---

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

### 4. Docker (recommended for production)

```bash
# Start both backend and frontend
docker compose up --build -d

# Backend  → http://localhost:8000
# Frontend → http://localhost:3000
```

---

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/lineage?mint=<MINT>` | Full lineage detection for a token |
| `POST` | `/lineage/batch` | Batch lineage detection (up to 10 mints) |
| `WS` | `/ws/lineage` | WebSocket progress streaming for lineage |
| `GET` | `/search?q=<QUERY>&limit=20&offset=0` | Search tokens by name/symbol (paginated) |

All endpoints return JSON. Rate limits are applied per-IP (configurable).
A unique `X-Request-ID` header is included in every response for tracing.

### WebSocket Example

```javascript
const ws = new WebSocket("ws://localhost:8000/ws/lineage");
ws.onopen = () => ws.send(JSON.stringify({ mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }));
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.done) {
    console.log("Result:", msg.result ?? msg.error);
    ws.close();
  } else {
    console.log(`[${msg.progress}%] ${msg.step}`);
  }
};
```

### Batch Example

```bash
curl -X POST http://localhost:8000/lineage/batch \
  -H "Content-Type: application/json" \
  -d '{"mints": ["DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]}'
```

Returns `{"results": {"<mint>": <LineageResult | error_string>, ...}}`.

### Error Responses

| Code | Meaning |
| --- | --- |
| `400` | Invalid mint address or query string |
| `429` | Rate limit exceeded |
| `500` | Internal server error (details hidden) |

---

## Configuration

All settings live in `src/config.py` and can be overridden via environment
variables. Copy `.env.example` to `.env` and adjust as needed.

### Environment Variables Reference

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | string | — | Telegram bot API token |
| `SOLANA_RPC_ENDPOINT` | URL | `https://api.mainnet-beta.solana.com` | Solana JSON-RPC endpoint |
| `DEXSCREENER_BASE_URL` | URL | `https://api.dexscreener.com` | DexScreener API base URL |
| `IMAGE_SIMILARITY_THRESHOLD` | float | `0.85` | Minimum perceptual-hash similarity (0–1) |
| `NAME_SIMILARITY_THRESHOLD` | float | `0.75` | Minimum name Levenshtein similarity (0–1) |
| `SYMBOL_SIMILARITY_THRESHOLD` | float | `0.80` | Minimum symbol Levenshtein similarity (0–1) |
| `WEIGHT_NAME` | float | `0.25` | Scoring weight for name similarity |
| `WEIGHT_SYMBOL` | float | `0.15` | Scoring weight for symbol similarity |
| `WEIGHT_IMAGE` | float | `0.25` | Scoring weight for image similarity |
| `WEIGHT_DEPLOYER` | float | `0.20` | Scoring weight for deployer match |
| `WEIGHT_TEMPORAL` | float | `0.15` | Scoring weight for temporal proximity |
| `CACHE_TTL_SECONDS` | int | `300` | Cache time-to-live in seconds |
| `CACHE_BACKEND` | string | `sqlite` | Cache backend: `memory` (TTLCache) or `sqlite` (persistent) |
| `CACHE_SQLITE_PATH` | string | `data/cache.db` | Path to SQLite cache database (when `CACHE_BACKEND=sqlite`) |
| `MAX_DERIVATIVES` | int | `50` | Maximum derivatives to return |
| `MAX_CONCURRENT_RPC` | int | `5` | Concurrent RPC request limit |
| `REQUEST_TIMEOUT` | int | `15` | HTTP request timeout in seconds |
| `RATE_LIMIT_LINEAGE` | string | `10/minute` | Rate limit for `/lineage` endpoint |
| `RATE_LIMIT_SEARCH` | string | `30/minute` | Rate limit for `/search` endpoint |
| `LOG_LEVEL` | string | `INFO` | Logging level (`DEBUG`/`INFO`/`WARNING`/`ERROR`) |
| `LOG_FORMAT` | string | `text` | Log format: `text` (human) or `json` (structured) |
| `API_HOST` | string | `0.0.0.0` | API listen host |
| `API_PORT` | int | `8000` | API listen port |
| `CORS_ORIGINS` | string | `http://localhost:3000` | Comma-separated allowed origins |
| `NEXT_PUBLIC_API_URL` | URL | `http://localhost:8000` | Frontend → backend URL |

> **Note:** Scoring weights must sum to 1.0. A warning is logged if they drift
> by more than 0.01.

---

## Testing

### Backend (pytest)

```bash
source .venv/bin/activate
python -m pytest tests/ -v
```

The test suite includes 182+ tests covering:
- API endpoints (rate limiting, validation, error handling)
- Cache layer (TTL, SQLite persistence)
- Data sources (DexScreener, Solana RPC)
- Image similarity (pHash computation)
- Lineage detection (integration)
- Scoring & models
- Telegram bot (commands, error paths)

### Frontend (Playwright E2E)

```bash
cd frontend
npx playwright install --with-deps chromium
npx playwright test
```

---

## CI/CD

GitHub Actions run on every push and PR:

1. **Backend tests** — `pytest` with Python 3.12
2. **Frontend build** — `npm run build` to catch compilation errors

See `.github/workflows/ci.yml` for details.

---

## Changelog (v3.0.0)

### Security & Performance (P0)
- Telegram bot: generic error messages hide internal details
- Base58 mint validation in Telegram `/lineage` command
- Jupiter price enrichment integrated into lineage detection
- SQLiteCache backend (configurable via `CACHE_BACKEND` env var)

### Reliability (P1)
- `IMAGE_SIMILARITY_THRESHOLD` post-filter in enrichment pipeline
- Removed dead `requests` dependency
- Shared `httpx.AsyncClient` for image downloads
- Per-mint RPC result caching with 24h TTL
- Docker non-root user + enhanced `.dockerignore`

### Testing & CI (P2)
- 182+ tests (up from 157): config validation, retry utility, Jupiter caching, bot commands
- `--cov-fail-under=70` in CI
- `pip-audit` security audit step
- Playwright E2E in frontend CI job

### Polish (P3)
- Telegram bot: MarkdownV2 formatting with proper escaping
- Removed `sys.path.insert` hacks (relying on pyproject.toml pythonpath)
- Frontend: fixed "derivatves" → "derivatives" typo
- Frontend: OG metadata + favicon configuration
- Frontend: 429 rate-limit handling with Retry-After in API client
- Docker Compose: healthcheck, `service_healthy` condition, removed deprecated `version`

### New Features (P4)
- `POST /lineage/batch` endpoint: analyse up to 10 mints concurrently
- `WS /ws/lineage` WebSocket endpoint: real-time progress streaming
- Dark/Light mode toggle with localStorage persistence

### v2.0.0 (previous)

### Security & Stability
- Per-IP rate limiting on all endpoints (slowapi)
- Base58 mint address validation
- Internal error details hidden from API responses
- Graceful HTTP client lifecycle (startup/shutdown)

### Reliability & Testing
- 113+ tests (up from ~50) covering all modules
- Shared `httpx.AsyncClient` for image similarity
- Environment variable validation on startup
- CORS origin parsing hardened

### Features & UX
- SQLite persistent cache alongside in-memory TTL cache
- Pagination on `/search` (`limit` / `offset`)
- Custom 404, error boundary, and loading pages in frontend
- Accessibility: ARIA labels, semantic links, screen-reader fallbacks
- Playwright E2E test suite
- Telegram bot: `/help` command, unknown-command handler
- Jupiter aggregator data source (prices, verified tokens)

### Polish
- Dead code removed
- `pyproject.toml` with full metadata, ruff, mypy config
- Structured logging with request IDs (text or JSON)
- CLI entry-point (`lineage-agent`)
- Comprehensive README with env-var reference

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Install dev dependencies: `pip install -e ".[dev]"`
4. Run tests before committing: `python -m pytest tests/ -v`
5. Open a pull request against `main`

Please ensure all tests pass and follow the existing code style (enforced by
[ruff](https://docs.astral.sh/ruff/)).

## License

MIT
