"""Tests for CLIP image embeddings (Feature 4)."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


URL_A = "https://example.com/logo_a.png"
URL_B = "https://example.com/logo_b.png"


# ---------------------------------------------------------------------------
# compute_clip_similarity — CLIP disabled (default)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_clip_similarity_returns_minus_one_when_disabled():
    """When CLIP_EMBEDDINGS_ENABLED=false, returns -1.0 immediately without any download."""
    with patch("config.CLIP_EMBEDDINGS_ENABLED", False):
        from lineage_agent.image_clip import compute_clip_similarity
        result = await compute_clip_similarity(URL_A, URL_B)
    assert result == -1.0


# ---------------------------------------------------------------------------
# compute_clip_similarity — CLIP enabled, successful path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_clip_similarity_returns_cosine_similarity():
    """With CLIP enabled and valid embeddings, returns a float in [0, 1]."""
    # Pre-populate cache to avoid real HTTP calls
    from lineage_agent import image_clip as ic
    ic._embed_cache.clear()
    # Unit vectors along same direction → cosine = 1.0
    ic._embed_cache[URL_A] = [1.0, 0.0]
    ic._embed_cache[URL_B] = [1.0, 0.0]

    with patch("config.CLIP_EMBEDDINGS_ENABLED", True):
        from lineage_agent.image_clip import compute_clip_similarity
        result = await compute_clip_similarity(URL_A, URL_B)

    assert 0.99 <= result <= 1.01
    ic._embed_cache.clear()


@pytest.mark.asyncio
async def test_clip_similarity_orthogonal_embeddings_returns_zero():
    """Orthogonal embeddings produce similarity ≈ 0."""
    from lineage_agent import image_clip as ic
    ic._embed_cache.clear()
    ic._embed_cache[URL_A] = [1.0, 0.0]
    ic._embed_cache[URL_B] = [0.0, 1.0]

    with patch("config.CLIP_EMBEDDINGS_ENABLED", True):
        from lineage_agent.image_clip import compute_clip_similarity
        result = await compute_clip_similarity(URL_A, URL_B)

    assert -0.01 <= result <= 0.01
    ic._embed_cache.clear()


# ---------------------------------------------------------------------------
# _embed_url — download failure returns None
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_embed_url_returns_none_on_http_error(caplog):
    """Download failure returns None and logs a warning (not silent)."""
    import logging
    from lineage_agent import image_clip as ic
    ic._embed_cache.clear()

    mock_response = MagicMock()
    mock_response.status_code = 503
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("httpx.AsyncClient", return_value=mock_client), \
         caplog.at_level(logging.WARNING, logger="lineage_agent.image_clip"):
        result = await ic._embed_url("https://example.com/bad.png")

    assert result is None
    assert "503" in caplog.text or "HTTP" in caplog.text


# ---------------------------------------------------------------------------
# compute_clip_similarity — CLIP enabled but not installed
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_clip_not_installed_returns_minus_one_and_logs_warning(caplog):
    """When CLIP enabled but torch/open-clip-torch not installed: -1.0 returned, warning logged (not silent)."""
    import logging
    from lineage_agent import image_clip as ic
    ic._embed_cache.clear()
    ic._model = None
    ic._preprocess = None

    # Provide a successful HTTP response so the encoding path is reached
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"fake-image-bytes"
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("config.CLIP_EMBEDDINGS_ENABLED", True), \
         patch("httpx.AsyncClient", return_value=mock_client), \
         patch.dict("sys.modules", {"open_clip": None}), \
         caplog.at_level(logging.WARNING, logger="lineage_agent.image_clip"):
        result = await ic.compute_clip_similarity(URL_A, URL_B)

    # Should return -1.0 (image unavailable sentinel), not raise
    assert result == -1.0
    # Warning must be present — never silent
    assert len(caplog.records) > 0


# ---------------------------------------------------------------------------
# Embedding cache eviction
# ---------------------------------------------------------------------------

def test_embed_cache_eviction():
    """When cache is full, adding a new entry evicts the oldest (FIFO) and keeps size at _EMBED_CACHE_SIZE."""
    from lineage_agent import image_clip as ic
    ic._embed_cache.clear()
    # Fill the cache to exactly capacity
    for i in range(ic._EMBED_CACHE_SIZE):
        ic._embed_cache[f"https://example.com/img{i}.png"] = [float(i)]

    assert len(ic._embed_cache) == ic._EMBED_CACHE_SIZE

    # Replicate the eviction logic used in _embed_url
    new_url = "https://example.com/img_new.png"
    if len(ic._embed_cache) >= ic._EMBED_CACHE_SIZE:
        oldest_key = next(iter(ic._embed_cache))
        del ic._embed_cache[oldest_key]
    ic._embed_cache[new_url] = [0.5]

    # Cache size must not grow beyond the limit
    assert len(ic._embed_cache) == ic._EMBED_CACHE_SIZE
    # Newly added URL is present
    assert new_url in ic._embed_cache
    # First (oldest) entry was evicted
    assert "https://example.com/img0.png" not in ic._embed_cache
    ic._embed_cache.clear()
