from __future__ import annotations
import io
import os
from unittest.mock import patch, MagicMock
from PIL import Image
from src.lineart import extract_lineart


def _make_test_image() -> bytes:
    img = Image.new("RGB", (200, 200), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()


def _make_lineart_response() -> bytes:
    """Simulate what Replicate returns: a grayscale line art image."""
    img = Image.new("L", (200, 200), color=255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()


@patch.dict("os.environ", {"REPLICATE_API_TOKEN": "test-token"})
@patch("replicate.run")
def test_extract_lineart_replicate(mock_run):
    mock_run.return_value = [_make_lineart_response()]
    result = extract_lineart(_make_test_image())
    assert isinstance(result, Image.Image)
    assert result.mode == "L"


@patch.dict("os.environ", {}, clear=True)
def test_extract_lineart_local_fallback():
    result = extract_lineart(_make_test_image())
    assert isinstance(result, Image.Image)
    assert result.mode == "L"
