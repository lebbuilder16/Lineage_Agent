"""Optional Upstash Redis cache layer.

Provides a fast, persistent cache for expensive API responses (DexScreener,
deployer profiles, forensic reports). Falls back gracefully to no-op when
Redis is not configured.

Configure via environment variables:
  UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
  UPSTASH_REDIS_REST_TOKEN=AXxx...

All operations are best-effort — cache failures never block the caller.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

_REDIS_URL = os.environ.get("UPSTASH_REDIS_REST_URL", "")
_REDIS_TOKEN = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")
_ENABLED = bool(_REDIS_URL and _REDIS_TOKEN)

_client: Optional[httpx.AsyncClient] = None


def is_redis_enabled() -> bool:
    return _ENABLED


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=_REDIS_URL,
            headers={"Authorization": f"Bearer {_REDIS_TOKEN}"},
            timeout=3.0,  # fast timeout — cache should never be slow
        )
    return _client


async def redis_get(key: str) -> Optional[str]:
    """Get a value from Redis. Returns None on miss or error."""
    if not _ENABLED:
        return None
    try:
        client = await _get_client()
        resp = await client.get(f"/get/{key}")
        if resp.status_code == 200:
            data = resp.json()
            result = data.get("result")
            return result if result is not None else None
        return None
    except Exception:
        return None


async def redis_set(key: str, value: str, ex: int = 300) -> bool:
    """Set a value in Redis with TTL (seconds). Returns True on success."""
    if not _ENABLED:
        return False
    try:
        client = await _get_client()
        resp = await client.get(f"/set/{key}/{value}/ex/{ex}")
        return resp.status_code == 200
    except Exception:
        return False


async def redis_setjson(key: str, value: Any, ex: int = 300) -> bool:
    """Set a JSON-serializable value. Convenience wrapper."""
    try:
        return await redis_set(key, json.dumps(value, default=str), ex=ex)
    except Exception:
        return False


async def redis_getjson(key: str) -> Optional[Any]:
    """Get and parse a JSON value. Returns None on miss."""
    raw = await redis_get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


async def redis_delete(key: str) -> bool:
    """Delete a key from Redis."""
    if not _ENABLED:
        return False
    try:
        client = await _get_client()
        resp = await client.get(f"/del/{key}")
        return resp.status_code == 200
    except Exception:
        return False


async def redis_health() -> dict:
    """Check Redis connectivity. For /health endpoint."""
    if not _ENABLED:
        return {"enabled": False}
    try:
        client = await _get_client()
        resp = await client.get("/ping")
        return {
            "enabled": True,
            "status": "ok" if resp.status_code == 200 else "error",
            "latency_ms": round(resp.elapsed.total_seconds() * 1000),
        }
    except Exception as exc:
        return {"enabled": True, "status": "error", "error": str(exc)[:100]}
