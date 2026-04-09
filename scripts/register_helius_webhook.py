"""Register (or refresh) the Helius Enhanced webhook for the watchlist.

Usage (from repo root with your venv active):

    # First-time registration:
    HELIUS_WEBHOOK_URL=https://lineage-agent.fly.dev/agent/webhook/helius \\
    HELIUS_WEBHOOK_SECRET=<shared-secret> \\
    python scripts/register_helius_webhook.py create

    # Sync the address list (after users add/remove watches):
    HELIUS_WEBHOOK_ID=<id-from-create> \\
    python scripts/register_helius_webhook.py sync

The script pulls the current address set from ``user_watches`` (sub_type =
'mint') and pushes it to Helius in a single call. It is intended to be run
manually or from a periodic cron — the API server itself does not need to
hit Helius at request time.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

# Ensure repo root is on sys.path so "src/..." modules resolve the same way
# as when running via uvicorn.
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_ROOT, "src"))


async def _load_watched_mints() -> list[str]:
    from lineage_agent.data_sources._clients import init_clients, cache  # noqa: PLC0415

    await init_clients()
    db = await cache._get_conn()
    cursor = await db.execute(
        "SELECT DISTINCT value FROM user_watches WHERE sub_type = 'mint'"
    )
    rows = await cursor.fetchall()
    return [r[0] for r in rows if r[0]]


async def _cmd_create(webhook_url: str, secret: str) -> None:
    from lineage_agent.data_sources._clients import get_rpc_client  # noqa: PLC0415

    mints = await _load_watched_mints()
    if not mints:
        print("No watched mints found in user_watches — nothing to register.")
        return

    rpc = get_rpc_client()
    print(f"Registering webhook for {len(mints)} mints → {webhook_url}")
    result = await rpc.create_helius_webhook(
        webhook_url=webhook_url,
        account_addresses=mints,
        transaction_types=["SWAP", "TRANSFER", "BURN"],
        webhook_type="enhanced",
        auth_header=secret,
    )
    webhook_id = result.get("webhookID") or result.get("webhookId") or ""
    print("Created webhook:")
    print(f"  webhookID = {webhook_id}")
    print(f"  addresses = {len(mints)}")
    print("\nPersist the ID so future syncs can update the same hook:")
    print(f"  fly secrets set HELIUS_WEBHOOK_ID={webhook_id}")


async def _cmd_sync(webhook_id: str) -> None:
    from lineage_agent.data_sources._clients import get_rpc_client  # noqa: PLC0415

    mints = await _load_watched_mints()
    rpc = get_rpc_client()
    print(f"Syncing webhook {webhook_id} with {len(mints)} mints")
    result = await rpc.update_helius_webhook(
        webhook_id,
        account_addresses=mints,
    )
    print(f"Updated. Helius returned {len(result.get('accountAddresses') or [])} addresses.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["create", "sync"])
    args = parser.parse_args()

    if args.command == "create":
        url = os.getenv("HELIUS_WEBHOOK_URL", "")
        secret = os.getenv("HELIUS_WEBHOOK_SECRET", "")
        if not url or not secret:
            parser.error("HELIUS_WEBHOOK_URL and HELIUS_WEBHOOK_SECRET must be set")
        asyncio.run(_cmd_create(url, secret))
    else:
        wid = os.getenv("HELIUS_WEBHOOK_ID", "")
        if not wid:
            parser.error("HELIUS_WEBHOOK_ID must be set for sync")
        asyncio.run(_cmd_sync(wid))


if __name__ == "__main__":
    main()
