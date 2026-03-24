"""Prometheus custom metrics for investigation quality observability.

Reuses the existing prometheus-fastapi-instrumentator for HTTP metrics.
This module adds domain-specific counters and histograms for agent
investigations, exposed via the shared /metrics endpoint.
"""
import logging

logger = logging.getLogger(__name__)

try:
    from prometheus_client import Counter, Histogram

    INVESTIGATION_RISK_SCORE = Histogram(
        "lineage_investigation_verdict_risk_score",
        "Distribution of AI verdict risk scores",
        buckets=[0, 10, 25, 40, 50, 60, 75, 85, 90, 95, 100],
    )

    INVESTIGATION_HEURISTIC_VS_AI_DELTA = Histogram(
        "lineage_investigation_heuristic_vs_ai_delta",
        "Difference between heuristic and AI risk scores (AI - heuristic)",
        buckets=[-80, -60, -40, -20, -10, 0, 10, 20, 40, 60, 80],
    )

    INVESTIGATION_TOKENS = Counter(
        "lineage_investigation_tokens_total",
        "Total tokens consumed by investigations",
        ["model"],
    )

    INVESTIGATION_TURNS = Counter(
        "lineage_investigation_turns_total",
        "Total turns used across investigations",
    )

    INVESTIGATION_TOOL_CALLS = Counter(
        "lineage_investigation_tool_calls_total",
        "Tool invocations during agent investigations",
        ["tool"],
    )

    INVESTIGATION_ERRORS = Counter(
        "lineage_investigation_errors_total",
        "Investigation errors by type",
        ["error_type"],
    )

    INVESTIGATION_DURATION = Histogram(
        "lineage_investigation_duration_seconds",
        "Total investigation wall-clock time",
        buckets=[1, 3, 5, 10, 15, 20, 30, 45, 60],
    )

    _ENABLED = True

except ImportError:
    _ENABLED = False
    logger.info("prometheus-client not available — custom metrics disabled")


def record_verdict(risk_score: int, heuristic_score: int) -> None:
    if not _ENABLED:
        return
    INVESTIGATION_RISK_SCORE.observe(risk_score)
    INVESTIGATION_HEURISTIC_VS_AI_DELTA.observe(risk_score - heuristic_score)


def record_tokens(count: int, model: str) -> None:
    if not _ENABLED:
        return
    INVESTIGATION_TOKENS.labels(model=model).inc(count)


def record_turns(count: int) -> None:
    if not _ENABLED:
        return
    INVESTIGATION_TURNS.inc(count)


def record_tool_call(tool_name: str) -> None:
    if not _ENABLED:
        return
    INVESTIGATION_TOOL_CALLS.labels(tool=tool_name).inc()


def record_error(error_type: str) -> None:
    if not _ENABLED:
        return
    INVESTIGATION_ERRORS.labels(error_type=error_type).inc()


def record_duration(seconds: float) -> None:
    if not _ENABLED:
        return
    INVESTIGATION_DURATION.observe(seconds)
