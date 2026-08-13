from __future__ import annotations
import numpy as np
from PIL import Image
from src.composition import create_stamp_frame, place_image_in_frame


def _make_subject(size=80) -> Image.Image:
    arr = np.full((size, size), 255, dtype=np.uint8)
    arr[20:60, 20:60] = 0
    return Image.fromarray(arr, mode="L")


def test_create_circular_frame():
    frame = create_stamp_frame(
        shape="circle", size=300, border_style="single", border_thickness=3
    )
    assert frame.size == (300, 300)
    assert frame.mode == "RGBA"


def test_create_rectangular_frame():
    frame = create_stamp_frame(
        shape="rectangle", size=300, border_style="double", border_thickness=3
    )
    assert frame.size == (300, 300)
    assert frame.mode == "RGBA"


def test_place_image_in_frame():
    subject = _make_subject()
    frame = create_stamp_frame(shape="circle", size=300, border_style="single", border_thickness=3)
    result = place_image_in_frame(subject, frame, scale=0.5)
    assert result.size == (300, 300)
