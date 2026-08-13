from __future__ import annotations
import numpy as np
from PIL import Image
from src.cleanup import threshold_image, remove_noise, auto_crop, adjust_line_thickness


def _make_gray_image(width=100, height=100, value=128) -> Image.Image:
    return Image.fromarray(np.full((height, width), value, dtype=np.uint8), mode="L")


def test_threshold_produces_binary():
    img = _make_gray_image(value=128)
    result = threshold_image(img, threshold=100)
    pixels = set(np.array(result).flatten())
    assert pixels <= {0, 255}


def test_adjust_thickness_dilate():
    # Create image with a thin line
    arr = np.full((100, 100), 255, dtype=np.uint8)
    arr[50, 40:60] = 0  # thin horizontal line
    img = Image.fromarray(arr, mode="L")
    result = adjust_line_thickness(img, thickness=3)
    result_arr = np.array(result)
    # Line should be thicker (more black pixels)
    assert np.sum(result_arr == 0) > np.sum(arr == 0)


def test_auto_crop_removes_whitespace():
    arr = np.full((200, 200), 255, dtype=np.uint8)
    arr[80:120, 80:120] = 0  # black square in center
    img = Image.fromarray(arr, mode="L")
    result = auto_crop(img, padding=10)
    assert result.width < 200
    assert result.height < 200
