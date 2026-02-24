# Deployment Guide

This guide covers deploying the **Meme Lineage Agent** with:

- **Backend (FastAPI)** → [Fly.io](https://fly.io)
- **Frontend (Next.js)** → [Vercel](https://vercel.com)
- **Telegram Bot** → runs on the Fly.io backend

---

## Prerequisites

| Tool | Install |
|------|---------|
| [flyctl](https://fly.io/docs/hands-on/install-flyctl/) | `curl -L https://fly.io/install.sh \| sh` |
| [Vercel CLI](https://vercel.com/docs/cli) (optional) | `npm i -g vercel` |
| GitHub account | Push the repo to GitHub |

---

## 1. Create the Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name: e.g. `Meme Lineage Agent`
4. Choose a username: e.g. `meme_lineage_bot` (must end with `bot`)
5. **Copy the token** — you'll need it in step 2

Optional commands to set up:
```
/setcommands
```
Then paste:
```
lineage - Analyze a token's lineage
help - Show available commands
```

---

## 2. Deploy the Backend on Fly.io

### First-time setup

```bash
# Login to Fly.io
fly auth login

# Launch the app (from the repo root)
fly launch --no-deploy

# This creates the app. Edit fly.toml if you want a different:
# - app name (default: lineage-agent-api)
# - region (default: cdg/Paris)
```

### Set secrets (environment variables)

```bash
# Required
fly secrets set TELEGRAM_BOT_TOKEN="your-bot-token-from-botfather"

# Recommended: use a paid RPC for production (Helius, QuickNode, etc.)
fly secrets set SOLANA_RPC_ENDPOINT="https://api.mainnet-beta.solana.com"

# CORS: add your Vercel frontend URL (set after Vercel deploy)
fly secrets set CORS_ORIGINS="https://your-app.vercel.app,http://localhost:3000"
```

### Create the persistent volume (for SQLite cache)

```bash
fly volumes create lineage_cache --region cdg --size 1
```

### Deploy

```bash
fly deploy
```

### Verify

```bash
# Check status
fly status

# Check health
curl https://lineage-agent.fly.dev/health

# View logs
fly logs
```

Your backend is now live at: `https://lineage-agent.fly.dev`

---

## 3. Deploy the Frontend on Vercel

### Option A: Via Vercel Dashboard (recommended)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository: `lebbuilder16/Lineage_Agent`
3. **Root Directory**: type `frontend` (critical — Vercel must detect Next.js from `frontend/package.json`)
4. **Framework Preset**: should auto-detect as Next.js
5. **Environment Variables**:
   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_API_URL` | `https://lineage-agent.fly.dev` |
6. Click **Deploy**

> **Important**: The Root Directory must be set to `frontend`. If Vercel says
> "Could not identify Next.js version", double-check this setting.

### Option B: Via CLI

```bash
cd frontend
vercel --prod
# When prompted:
# - Link to existing project? No
# - Project name: meme-lineage-frontend
# - In which directory is your code located? ./  (already in frontend/)
# - Override settings? No
```

Then set the environment variable:
```bash
vercel env add NEXT_PUBLIC_API_URL production
# Enter: https://lineage-agent.fly.dev
```

Redeploy to pick up the env var:
```bash
vercel --prod
```

---

## 4. Update CORS on Fly.io

After deploying the frontend, update the backend CORS to allow your Vercel domain:

```bash
fly secrets set CORS_ORIGINS="https://your-app.vercel.app,http://localhost:3000"
```

Replace `your-app.vercel.app` with your actual Vercel URL.

---

## 5. Start the Telegram Bot

The Telegram bot runs as a separate process. On Fly.io, you can add a second process:

### Option A: Run as a separate Fly.io machine

Create `fly.bot.toml`:
```toml
app = "lineage-agent-bot"
primary_region = "cdg"

[build]
  dockerfile = "Dockerfile.fly"

[env]
  LOG_LEVEL = "INFO"

[processes]
  bot = "python -m lineage_agent.telegram_bot --app-dir src"

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

Or simply run it in the same machine by adding a process group to `fly.toml`:

```toml
[processes]
  app = "python -m uvicorn lineage_agent.api:app --host 0.0.0.0 --port 8080 --app-dir src"
  bot = "python src/lineage_agent/telegram_bot.py"
```

Then deploy:
```bash
fly deploy
```

### Option B: Run locally / on a VPS

```bash
export TELEGRAM_BOT_TOKEN="your-token"
export SOLANA_RPC_ENDPOINT="https://api.mainnet-beta.solana.com"
python src/lineage_agent/telegram_bot.py
```

---

## 6. Custom Domain (Optional)

### Fly.io
```bash
fly certs add api.yourdomain.com
# Then add CNAME: api.yourdomain.com → lineage-agent.fly.dev
```

### Vercel
1. Go to Project Settings → Domains
2. Add `yourdomain.com`
3. Add DNS records as instructed

---

## Architecture Overview

```
┌──────────────────┐     HTTPS      ┌─────────────────┐
│  Vercel (CDN)    │◄──────────────►│  User Browser   │
│  Next.js SSR     │                └────────┬────────┘
│  + Static Assets │                         │
└────────┬─────────┘                         │
         │ HTTPS / WSS                       │
         ▼                                   │
┌──────────────────┐                         │
│  Fly.io          │◄────────────────────────┘
│  FastAPI Backend  │     HTTPS / WSS (direct)
│  + Telegram Bot  │
│  + SQLite Cache  │
└────────┬─────────┘
         │
         ▼
  ┌──────────────┐
  │ Solana RPC   │
  │ DexScreener  │
  │ Jupiter API  │
  └──────────────┘
```

---

## Environment Variables Reference

### Backend (Fly.io secrets)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes (for bot) | — | BotFather token |
| `SOLANA_RPC_ENDPOINT` | No | Public mainnet | Solana RPC URL |
| `CORS_ORIGINS` | Yes | `http://localhost:3000` | Comma-separated allowed origins |
| `CACHE_BACKEND` | No | `sqlite` (in fly.toml) | `memory` or `sqlite` |
| `LOG_LEVEL` | No | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `RATE_LIMIT_LINEAGE` | No | `10/minute` | Rate limit for /lineage |
| `RATE_LIMIT_SEARCH` | No | `30/minute` | Rate limit for /search |

### Frontend (Vercel env vars)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Full backend URL (e.g., `https://lineage-agent.fly.dev`) |

---

## Troubleshooting

### Backend won't start
```bash
fly logs                    # Check logs
fly ssh console             # SSH into the machine
fly status                  # Check machine status
```

### WebSocket not connecting
- Ensure `NEXT_PUBLIC_API_URL` uses `https://` (the frontend auto-converts to `wss://`)
- Check Fly.io logs for WebSocket upgrade errors
- Fly.io supports WebSockets natively on the default HTTP service

### CORS errors
- Verify `CORS_ORIGINS` includes your exact Vercel URL (with `https://`, no trailing slash)
- Redeploy after changing secrets: `fly deploy`

### Telegram bot not responding
- Verify token: `curl https://api.telegram.org/bot<TOKEN>/getMe`
- Check the bot process is running: `fly status`
- Check logs: `fly logs --app lineage-agent-bot`

### SQLite cache errors
- Ensure the volume is mounted: `fly volumes list`
- Check permissions: `/data` should be writable by `appuser`
