"""
Shared async retry utility with exponential backoff + jitter.

Used by all HTTP data-source clients (DexScreener, Solana RPC, Jupiter)
to avoid duplicating retry/backoff logic.
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)


class MethodBlockedError(Exception):
    """Raised when an RPC endpoint returns 403 (method blocked, not a transient failure)."""


def _parse_retry_after(resp: httpx.Response, default: float) -> float:
    """Extract wait time from a ``Retry-After`` header, or use *default*.

    The header may be an integer (seconds) or an HTTP-date.  We only handle
    the integer form since that's what most APIs emit.
    """
    raw = resp.headers.get("retry-after")
    if raw is not None:
        try:
            return max(float(raw), 0.5)
        except (ValueError, TypeError):
            pass
    return default


async def async_http_get(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: Optional[dict[str, Any]] = None,
    max_retries: int = 3,
    backoff_base: float = 1.0,
    label: str = "HTTP",
) -> Optional[Any]:
    """GET *url* with retry + exponential backoff on 429 / transient errors.

    Returns parsed JSON on success, ``None`` on exhausted retries.
    """
    for attempt in range(max_retries):
        try:
            resp = await client.get(url, params=params)
            if resp.status_code == 429:
                # Prefer server-provided Retry-After, else exponential backoff
                wait = _parse_retry_after(resp, backoff_base * (2 ** attempt))
                logger.warning("%s rate-limited, retry in %.1fs", label, wait)
                await asyncio.sleep(wait)
                continue
            if resp.status_code == 403:
                logger.warning("%s 403 for %s – endpoint may block this request", label, url)
                return None
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            logger.warning("%s HTTP %s for %s", label, exc.response.status_code, url)
            if attempt < max_retries - 1:
                await asyncio.sleep(backoff_base * (2 ** attempt))
                continue
            return None
        except httpx.RequestError as exc:
            logger.warning("%s request failed: %s – %s", label, url, exc)
            if attempt < max_retries - 1:
                await asyncio.sleep(backoff_base * (2 ** attempt))
                continue
            return None
    return None


async def async_http_post_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    json_payload: Any,
    max_retries: int = 3,
    backoff_base: float = 1.5,
    label: str = "RPC",
) -> Optional[Any]:
    """POST JSON *payload* with retry + exponential backoff + jitter.

    Returns parsed JSON body on success, ``None`` on exhausted retries.
    Special handling: 403 returns None immediately, RPC-level errors logged.

    Max wait: 3 retries × 1.5s base = ~10.5s worst case (was 62s with 5×2s).
    """
    for attempt in range(max_retries):
        try:
            resp = await client.post(url, json=json_payload)
            if resp.status_code == 429:
                wait = _parse_retry_after(resp, backoff_base * (2 ** attempt))
                logger.warning("%s rate-limited, retry in %.1fs", label, wait)
                await asyncio.sleep(wait)
                continue
            if resp.status_code == 403:
                logger.warning("%s 403 for %s – endpoint may block this method", label, url)
                raise MethodBlockedError(f"{label} 403: method blocked by {url}")
            resp.raise_for_status()
            body = resp.json()
            if "error" in body:
                logger.warning("%s error: %s", label, body["error"])
                return None
            return body.get("result", body)
        except httpx.HTTPStatusError as exc:
            logger.warning("%s HTTP %s", label, exc.response.status_code)
            if attempt < max_retries - 1:
                jitter = random.uniform(0, 0.5)
                await asyncio.sleep(backoff_base * (2 ** attempt) + jitter)
                continue
            return None
        except httpx.RequestError as exc:
            logger.warning("%s request failed: %s", label, exc)
            if attempt < max_retries - 1:
                jitter = random.uniform(0, 0.5)
                await asyncio.sleep(backoff_base * (2 ** attempt) + jitter)
                continue
            return None
    return None
