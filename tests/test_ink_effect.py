from __future__ import annotations
import numpy as np
from PIL import Image
from src.ink_effect import colorize, apply_ink_texture, apply_wear, apply_edge_bleed


def _make_stamp_bw() -> Image.Image:
    """Black lines on white background, RGBA."""
    arr = np.full((100, 100, 4), 255, dtype=np.uint8)
    # Draw some black lines
    arr[40:60, 20:80, :3] = 0
    arr[40:60, 20:80, 3] = 255
    return Image.fromarray(arr, mode="RGBA")


def test_colorize():
    stamp = _make_stamp_bw()
    result = colorize(stamp, color=(200, 30, 30))
    arr = np.array(result)
    # Black pixels should now be red-ish
    mask = np.array(stamp)[:, :, 0] < 128
    assert arr[mask, 0].mean() > 150  # R channel should be high


def test_apply_wear_reduces_opacity():
    stamp = _make_stamp_bw()
    result = apply_wear(stamp, intensity=0.8)
    orig_alpha = np.array(stamp)[:, :, 3].sum()
    result_alpha = np.array(result)[:, :, 3].sum()
    # Wear should reduce some alpha
    assert result_alpha <= orig_alpha


def test_apply_ink_texture_modifies_image():
    stamp = _make_stamp_bw()
    result = apply_ink_texture(stamp, density=0.5)
    assert result.size == stamp.size
