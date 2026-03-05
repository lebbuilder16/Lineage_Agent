---
description: Agentic Multi-Signal Forensics for Solana Token Families
---

# Lineage Agent

{% hint style="info" %}
**Live app →** [**lineagefun.xyz**](https://www.lineagefun.xyz)  
**API →** [lineage-agent.fly.dev](https://lineage-agent.fly.dev)  
**GitHub →** [lebbuilder16/Lineage_Agent](https://github.com/lebbuilder16/Lineage_Agent)
{% endhint %}

---

## What is Lineage Agent?

**Lineage Agent** is an open-source forensic intelligence platform for the Solana memecoin ecosystem. It reconstructs the full **operational lineage** of tokens — grouping them into family trees, mapping the human operators behind multiple wallets, and delivering AI-powered risk assessments in under 60 seconds.

> *"The problem is not that scammers copy tokens. The problem is that nobody can prove it."*

The Solana blockchain sees over **1 million new token launches per month**. A systematic exploitation pattern has emerged:

1. **Seed** — Deploy a token with high narrative resonance (political, meme, AI-themed)
2. **Accumulate** — Drive coordinated early buys via Jito bundles
3. **Extract** — Drain the liquidity pool or silently dump team wallets
4. **Repeat** — Redeploy a near-identical token, targeting the same audience

Lineage Agent exposes this pattern by combining **13 independent on-chain signals** with a two-tier Claude LLM reasoning layer.

---

## Core Capabilities

| Signal Layer | What it detects |
|---|---|
| 🧬 **Metadata DNA Fingerprint** | Cross-wallet operator identity via metadata upload patterns |
| 🌳 **Family Tree** | Root token + all derivative clones across generations |
| 💰 **Bundle Detection** | Jito coordinated early buy → 5-phase pipeline, jury verdict |
| 🌊 **SOL Flow Trace** | Post-rug capital routing — BFS 3 hops, CEX + bridge detection |
| 💀 **Death Clock** | Probabilistic rug forecast from operator's historical rhythm |
| 🧟 **Zombie Detection** | Recycled tokens resurrected by fingerprint-matched operators |
| 🤝 **Cartel Detection** | Inter-operator coordination via 8 edge types (Louvain graph) |
| 📊 **Insider Sell** | Deployer wallet liquidation + sell-pressure ratio analysis |
| 🏭 **Factory Rhythm** | Automated batch deployment detection + naming pattern |
| 💧 **Liquidity Architecture** | HHI concentration, wash-trading flags, deployer-LP detection |
| 👤 **Deployer Profile** | Full historical track record: rug count, rate, total SOL extracted |
| 💥 **Operator Impact** | Cross-wallet campaign ledger: victims, SOL extracted, active status |
| 🤖 **AI Analysis** | Claude Haiku / Sonnet adaptive routing + `conviction_chain` output |

---

## How it Works (In 8 Steps)

```
[Your token mint]
       │
       ▼
 1. Fetch DexScreener pairs
 2. Enrich: deployer RPC + metadata + Jupiter price
 3. Search candidates: name / symbol / deployer
 4. Enrich candidates (concurrent)
 5. Compute 5D similarity (name · symbol · logo · deployer · time)
 6. Select root token (earliest on-chain creation)
 7. Build family tree (BFS generations)
 8. Fire 13 forensic signals concurrently
       │
       ▼
 Heuristic pre-score 0–100
       │
  score < 55 ──→ Claude Haiku
  score ≥ 55 ──→ Claude Sonnet
       │
       ▼
  Risk report + conviction_chain
```

---

## Documentation

| Section | Description |
|---------|-------------|
| [Getting Started](getting-started.md) | Analyse your first token in 2 minutes |
| [Features](features.md) | Deep-dive into all 13 forensic signals |
| [API Reference](api-reference.md) | REST endpoints, schemas, streaming SSE |
| [Whitepaper](WHITEPAPER.md) | Full technical architecture and research paper (v1.0, March 2026) |
| [Audit Report](AUDIT_REPORT.md) | Comprehensive codebase security and quality audit |

---

## Quick Links

- 🌐 **Website:** [www.lineagefun.xyz](https://www.lineagefun.xyz)
- 🔌 **API:** [lineage-agent.fly.dev](https://lineage-agent.fly.dev)
- 💻 **GitHub:** [lebbuilder16/Lineage_Agent](https://github.com/lebbuilder16/Lineage_Agent)
