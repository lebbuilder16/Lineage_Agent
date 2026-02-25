"""Tests for async image similarity (compute_image_similarity + _phash_from_url)."""

from __future__ import annotations

from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lineage_agent.similarity import compute_image_similarity, _phash_from_url


def _make_tiny_image_bytes() -> bytes:
    """Create a minimal 64x64 red PNG using Pillow."""
    from PIL import Image
    img = Image.new("RGB", (64, 64), color=(255, 0, 0))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_alt_image_bytes() -> bytes:
    """Create a visually different 64x64 image with a pattern."""
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (64, 64), color=(0, 0, 255))
    draw = ImageDraw.Draw(img)
    # Draw a checkerboard pattern so the phash differs from solid red
    for x in range(0, 64, 8):
        for y in range(0, 64, 8):
            if (x + y) % 16 == 0:
                draw.rectangle([x, y, x + 7, y + 7], fill=(255, 255, 0))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ------------------------------------------------------------------
# _phash_from_url
# ------------------------------------------------------------------


class TestPhashFromUrl:

    @pytest.mark.asyncio
    async def test_success(self):
        img_bytes = _make_tiny_image_bytes()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = img_bytes
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("lineage_agent.similarity.httpx.AsyncClient", return_value=mock_client):
            result = await _phash_from_url("https://example.com/img.png")

        assert result is not None  # Should be an imagehash

    @pytest.mark.asyncio
    async def test_http_error_returns_none(self):
        import httpx
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.RequestError("timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("lineage_agent.similarity.httpx.AsyncClient", return_value=mock_client):
            result = await _phash_from_url("https://example.com/broken.png")

        assert result is None

    @pytest.mark.asyncio
    async def test_invalid_image_returns_none(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b"not an image"
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("lineage_agent.similarity.httpx.AsyncClient", return_value=mock_client):
            result = await _phash_from_url("https://example.com/garbage")

        assert result is None


# ------------------------------------------------------------------
# compute_image_similarity
# ------------------------------------------------------------------


class TestComputeImageSimilarity:

    @pytest.mark.asyncio
    async def test_identical_images(self):
        img_bytes = _make_tiny_image_bytes()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = img_bytes
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("lineage_agent.similarity.httpx.AsyncClient", return_value=mock_client):
            score = await compute_image_similarity(
                "https://example.com/a.png", "https://example.com/b.png"
            )

        assert score == 1.0  # Same image data → identical hashes

    @pytest.mark.asyncio
    async def test_different_images(self):
        img_a = _make_tiny_image_bytes()
        img_b = _make_alt_image_bytes()

        call_count = 0

        async def fake_get(url, **kwargs):
            nonlocal call_count
            call_count += 1
            resp = MagicMock()
            resp.status_code = 200
            resp.content = img_a if call_count % 2 == 1 else img_b
            resp.raise_for_status = MagicMock()
            return resp

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=fake_get)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("lineage_agent.similarity.httpx.AsyncClient", return_value=mock_client):
            score = await compute_image_similarity(
                "https://example.com/red.png", "https://example.com/blue.png"
            )

        # Different images should have similarity < 1.0
        assert 0.0 <= score < 1.0

    @pytest.mark.asyncio
    async def test_empty_urls(self):
        score = await compute_image_similarity("", "https://example.com/b.png")
        assert score == 0.0

        score = await compute_image_similarity("https://example.com/a.png", "")
        assert score == 0.0

        score = await compute_image_similarity("", "")
        assert score == 0.0

    @pytest.mark.asyncio
    async def test_one_fails(self):
        """If one image download fails, similarity should be 0.0."""
        img_bytes = _make_tiny_image_bytes()
        import httpx

        call_count = 0

        async def fake_get(url, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                resp = MagicMock()
                resp.status_code = 200
                resp.content = img_bytes
                resp.raise_for_status = MagicMock()
                return resp
            raise httpx.RequestError("timeout")

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=fake_get)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("lineage_agent.similarity.httpx.AsyncClient", return_value=mock_client):
            score = await compute_image_similarity(
                "https://example.com/ok.png", "https://example.com/fail.png"
            )

        assert score == 0.0

    @pytest.mark.asyncio
    async def test_pil_not_available(self):
        """When Pillow is not installed, should return -1.0 sentinel."""
        with patch("lineage_agent.similarity._PIL_AVAILABLE", False):
            score = await compute_image_similarity(
                "https://example.com/a.png", "https://example.com/b.png"
            )
        assert score < 0.0  # -1.0 sentinel so composite score excludes this dim
