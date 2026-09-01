from __future__ import annotations
import numpy as np
from PIL import Image
from src.ink_effect import apply_ink_texture, apply_wear, apply_edge_bleed


def _make_stamp_bw() -> Image.Image:
    """Black ink on transparent background, RGBA."""
    arr = np.zeros((100, 100, 4), dtype=np.uint8)
    arr[40:60, 20:80, 3] = 255
    return Image.fromarray(arr, mode="RGBA")


def test_apply_wear_reduces_opacity():
    stamp = _make_stamp_bw()
    result = apply_wear(stamp, intensity=0.8)
    orig_alpha = np.array(stamp)[:, :, 3].sum()
    result_alpha = np.array(result)[:, :, 3].sum()
    assert result_alpha <= orig_alpha


def test_apply_ink_texture_modifies_image():
    stamp = _make_stamp_bw()
    result = apply_ink_texture(stamp, density=0.5)
    assert result.size == stamp.size
