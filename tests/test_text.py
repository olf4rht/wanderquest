from __future__ import annotations
import numpy as np
from PIL import Image
from src.text_renderer import render_text_straight, render_text_curved


def test_render_straight_text():
    canvas = Image.new("RGBA", (300, 300), (255, 255, 255, 0))
    result = render_text_straight(
        canvas, text="HELLO", position="below", font_name="serif", font_size=24
    )
    assert result.size == (300, 300)
    # Should have some non-transparent pixels (the text)
    arr = np.array(result)
    assert arr[:, :, 3].max() > 0


def test_render_curved_text():
    canvas = Image.new("RGBA", (300, 300), (255, 255, 255, 0))
    result = render_text_curved(
        canvas, text="HELLO WORLD", position="top_arc", font_name="serif", font_size=20
    )
    assert result.size == (300, 300)
    arr = np.array(result)
    assert arr[:, :, 3].max() > 0
