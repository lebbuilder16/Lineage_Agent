"""LangFuse LLM tracing — fail-open, non-blocking.

If LANGFUSE_SECRET_KEY is not set, all operations are no-ops.
If LangFuse is unreachable, operations silently degrade.
"""
import logging
import os
from contextvars import ContextVar
from typing import Any

logger = logging.getLogger(__name__)

# Singleton — initialized once on first use
_langfuse_client: Any = None
_initialized = False

# ContextVar to hold the current trace for this request
_current_trace: ContextVar[Any] = ContextVar("langfuse_trace", default=None)


def _get_langfuse() -> Any:
    """Lazy-init LangFuse client. Returns None if not configured."""
    global _langfuse_client, _initialized  # noqa: PLW0603
    if _initialized:
        return _langfuse_client
    _initialized = True
    secret = os.getenv("LANGFUSE_SECRET_KEY", "")
    public = os.getenv("LANGFUSE_PUBLIC_KEY", "")
    if not secret or not public:
        logger.info("[langfuse] not configured — tracing disabled")
        return None
    try:
        from langfuse import Langfuse  # noqa: PLC0415

        _langfuse_client = Langfuse(
            secret_key=secret,
            public_key=public,
            host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
        )
        logger.info("[langfuse] tracing enabled")
    except Exception as exc:
        logger.warning("[langfuse] init failed: %s", exc)
    return _langfuse_client


def start_trace(*, name: str, trace_id: str, metadata: dict | None = None) -> Any:
    """Start a LangFuse trace. Returns trace object or None."""
    try:
        lf = _get_langfuse()
        if lf is None:
            return None
        trace = lf.trace(id=trace_id, name=name, metadata=metadata or {})
        _current_trace.set(trace)
        return trace
    except Exception:
        logger.debug("[langfuse] start_trace failed", exc_info=True)
        return None


def start_generation(
    *, name: str, model: str, input_data: Any = None, trace: Any = None,
) -> Any:
    """Start a generation span (Claude API call). Returns span or None."""
    try:
        t = trace or _current_trace.get(None)
        if t is None:
            return None
        return t.generation(name=name, model=model, input=input_data)
    except Exception:
        return None


def end_generation(
    span: Any, *, output: Any = None, usage: dict | None = None,
) -> None:
    """End a generation span with output and token usage."""
    try:
        if span is None:
            return
        span.end(output=output, usage=usage)
    except Exception:
        pass


def start_span(*, name: str, input_data: Any = None, trace: Any = None) -> Any:
    """Start a tool/operation span. Returns span or None."""
    try:
        t = trace or _current_trace.get(None)
        if t is None:
            return None
        return t.span(name=name, input=input_data)
    except Exception:
        return None


def end_span(span: Any, *, output: Any = None) -> None:
    """End a span."""
    try:
        if span is None:
            return
        span.end(output=output)
    except Exception:
        pass


def set_trace_output(*, output: Any, trace: Any = None) -> None:
    """Set the final output on the trace (verdict)."""
    try:
        t = trace or _current_trace.get(None)
        if t is None:
            return
        t.update(output=output)
    except Exception:
        pass


def flush() -> None:
    """Flush pending events. Call at end of investigation."""
    try:
        lf = _get_langfuse()
        if lf:
            lf.flush()
    except Exception:
        pass
