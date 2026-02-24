# Contributing to Meme Lineage Agent

Thank you for considering contributing! Here's how to get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/lebbuilder16/Lineage_Agent.git
cd Lineage_Agent

# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend && npm ci && cd ..
```

## Running Tests

### Backend

```bash
python -m pytest tests/ -v
```

### Frontend (Playwright E2E)

```bash
cd frontend
npx playwright install --with-deps chromium
npx playwright test
```

## Code Style

- **Python**: Follow PEP 8. Use type hints. Run `ruff check src/` and `mypy src/`.
- **TypeScript**: ESLint + Prettier enforced via `npm run lint`.
- Keep functions small; avoid duplicating retry/backoff logic (use `_retry.py`).

## Pull Request Guidelines

1. **Branch** off `main` with a descriptive name (e.g., `feat/ws-progress`).
2. **Write tests** for any new feature or bug fix.
3. **Run the full suite** (`pytest` + `npm run lint` + `npm run build`) before pushing.
4. **Keep PRs focused** — one feature or fix per PR.
5. Update the README if you add a new endpoint or config variable.

## Architecture Overview

```
src/
  config.py                       # Centralised env-var config
  lineage_agent/
    api.py                        # FastAPI routes
    lineage_detector.py           # Core analysis logic
    data_sources/
      _clients.py                 # Singleton HTTP client management
      _retry.py                   # Shared retry + backoff utility
      dexscreener.py              # DexScreener API client
      jupiter.py                  # Jupiter price + token list
      solana_rpc.py               # Solana JSON-RPC client
    cache.py                      # TTLCache (memory) + SQLiteCache
    similarity.py                 # Scoring algorithms
    models.py                     # Pydantic models
    telegram_bot.py               # Telegram bot handlers
```

## Reporting Issues

Open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behaviour
- Python/Node versions and OS
