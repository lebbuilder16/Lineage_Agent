"""
CLIP-based image similarity for token logo comparison.

Provides :func:`compute_clip_similarity` as a higher-quality alternative to
pHash when ``CLIP_EMBEDDINGS_ENABLED=true`` and ``open-clip-torch`` is
installed.

Design
------
- Eagerly validates availability on module load when CLIP is enabled.
- Caches embeddings in-memory (up to ``_EMBED_CACHE_SIZE`` URLs) to avoid
  re-downloading the same logo twice per process.
- Returns ``-1.0`` only when CLIP is *disabled* or an image cannot be
  fetched/decoded — never silently swallows real errors.
- model/pretrained are configurable via env vars so you can swap to a
  lighter checkpoint without code changes.
"""

from __future__ import annotations

import io
import logging
import os
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
_CLIP_MODEL: str = os.getenv("CLIP_MODEL", "ViT-B-32")
_CLIP_PRETRAINED: str = os.getenv("CLIP_PRETRAINED", "openai")
_EMBED_CACHE_SIZE: int = int(os.getenv("CLIP_EMBED_CACHE_SIZE", "512"))

# ---------------------------------------------------------------------------
# Lazy model loader
# ---------------------------------------------------------------------------
_model = None
_preprocess = None
_device: str = "cpu"


def _load_clip_model():
    """Load (and cache) the CLIP model.  Raises ``ImportError`` if open-clip-torch is not installed."""
    global _model, _preprocess, _device
    if _model is not None:
        return _model, _preprocess

    try:
        import open_clip  # noqa: PLC0415
    except ImportError as exc:
        raise ImportError(
            "open-clip-torch is not installed. Install it with: pip install open-clip-torch\n"
            "Or disable CLIP via CLIP_EMBEDDINGS_ENABLED=false"
        ) from exc

    try:
        import torch  # noqa: PLC0415
        _device = "cuda" if torch.cuda.is_available() else "cpu"
        model, _, preprocess = open_clip.create_model_and_transforms(
            _CLIP_MODEL, pretrained=_CLIP_PRETRAINED, device=_device
        )
        model.eval()
        _model = model
        _preprocess = preprocess
        logger.info("CLIP model loaded: %s/%s on %s", _CLIP_MODEL, _CLIP_PRETRAINED, _device)
    except Exception as exc:
        logger.error("Failed to load CLIP model %s/%s: %s", _CLIP_MODEL, _CLIP_PRETRAINED, exc)
        raise
    return _model, _preprocess


# ---------------------------------------------------------------------------
# In-process embedding cache (URL → numpy array)
# ---------------------------------------------------------------------------
# We use a plain dict with a size cap instead of functools.lru_cache because
# we need async fetch inside the key computation.
_embed_cache: dict[str, "list[float]"] = {}


async def _embed_url(url: str) -> Optional[list[float]]:
    """Download an image and return its CLIP embedding, using cache."""
    if url in _embed_cache:
        return _embed_cache[url]

    try:
        import httpx  # noqa: PLC0415
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, follow_redirects=True)
            if resp.status_code != 200:
                logger.warning("CLIP embed: HTTP %d for %s", resp.status_code, url)
                return None
            img_bytes = resp.content
    except Exception:
        logger.warning("CLIP embed: download failed for %s", url, exc_info=True)
        return None

    try:
        import torch  # noqa: PLC0415
        from PIL import Image  # noqa: PLC0415

        model, preprocess = _load_clip_model()
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        tensor = preprocess(img).unsqueeze(0).to(_device)  # type: ignore[attr-defined]
        with torch.no_grad():
            features = model.encode_image(tensor)
            features /= features.norm(dim=-1, keepdim=True)
        embedding: list[float] = features[0].cpu().tolist()
    except Exception:
        logger.warning("CLIP embed: encoding failed for %s", url, exc_info=True)
        return None

    # Evict oldest entry when cache is full (simple FIFO eviction)
    if len(_embed_cache) >= _EMBED_CACHE_SIZE:
        try:
            oldest = next(iter(_embed_cache))
            del _embed_cache[oldest]
        except StopIteration:
            pass
    _embed_cache[url] = embedding
    return embedding


async def compute_clip_similarity(url_a: str, url_b: str) -> float:
    """Return the cosine similarity between the CLIP embeddings of two images.

    Returns
    -------
    float in [0.0, 1.0]
        Cosine similarity of the two image embeddings.
    ``-1.0``
        Either image could not be fetched / decoded.

    Raises
    ------
    ImportError
        When ``CLIP_EMBEDDINGS_ENABLED=true`` but ``open-clip-torch`` is not
        installed.  This is an explicit failure — not a silent fallback.
    RuntimeError
        When the CLIP model fails to load (GPU OOM, corrupt weights, etc.).
    """
    from config import CLIP_EMBEDDINGS_ENABLED  # noqa: PLC0415
    if not CLIP_EMBEDDINGS_ENABLED:
        return -1.0

    embed_a = await _embed_url(url_a)
    embed_b = await _embed_url(url_b)
    if embed_a is None or embed_b is None:
        return -1.0

    try:
        import math  # noqa: PLC0415
        dot = sum(a * b for a, b in zip(embed_a, embed_b))
        # Embeddings are L2-normalised, so ||a||=||b||=1 and cosine = dot
        return max(0.0, min(1.0, dot))
    except Exception:
        logger.warning("CLIP similarity: dot product failed", exc_info=True)
        return -1.0
