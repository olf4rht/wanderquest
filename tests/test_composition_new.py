"""Tests for the new SVG template-based composition module."""

from PIL import Image, ImageDraw
import numpy as np
import pytest

from src.composition import compose_stamp


def test_compose_stamp_returns_rgba():
    img = Image.new("L", (200, 200), 255)  # white image
    result = compose_stamp(img, "oval", False, 1, "", "", 0.5)
    assert result.mode == "RGBA"
    assert result.size == (1080, 1080)


def test_compose_stamp_rect():
    img = Image.new("L", (200, 200), 255)
    result = compose_stamp(img, "rect", False, 1, "", "", 0.5)
    assert result.mode == "RGBA"


def test_compose_stamp_square():
    img = Image.new("L", (200, 200), 255)
    result = compose_stamp(img, "square", False, 1, "", "", 0.5)
    assert result.mode == "RGBA"


def test_compose_stamp_with_date_layout_1():
    img = Image.new("L", (200, 200), 255)
    result = compose_stamp(img, "oval", True, 1, "01.05.2026", "05.05.2026", 0.5)
    assert result.mode == "RGBA"


def test_compose_stamp_with_ink_marks():
    # Image with actual dark pixels
    img = Image.new("L", (200, 200), 255)
    draw = ImageDraw.Draw(img)
    draw.rectangle([50, 50, 150, 150], fill=0)
    result = compose_stamp(img, "oval", False, 1, "", "", 0.5)
    # Should have some non-zero alpha (the ink marks)
    arr = np.array(result)
    assert arr[:, :, 3].max() > 0
