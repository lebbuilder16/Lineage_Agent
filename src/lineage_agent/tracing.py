"""
Lightweight tracing helpers using Sentry SDK spans.

No extra dependencies — uses sentry-sdk[fastapi] which is already installed.
When SENTRY_DSN is not set, all tracing calls are no-ops.

Usage::

    from .tracing import trace_span

    async def my_function():
        with trace_span("sweep.rescan", watch_id=42, mint="abc123"):
            ...  # traced block
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Any

logger = logging.getLogger(__name__)

_ENABLED = False

try:
    import sentry_sdk
    if sentry_sdk.is_initialized():
        _ENABLED = True
except ImportError:
    pass


@contextmanager
def trace_span(op: str, description: str = "", **tags: Any):
    """Create a Sentry span for tracing.

    Usage::

        with trace_span("rpc.call", method="getSlot", provider="helius"):
            result = await rpc.get_slot()
    """
    if not _ENABLED:
        yield
        return

    with sentry_sdk.start_span(op=op, name=description or op) as span:
        for k, v in tags.items():
            span.set_data(k, v)
        yield span
