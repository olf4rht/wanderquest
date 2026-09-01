from __future__ import annotations
import io
import os
import base64
import logging

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def extract_lineart(
    image_bytes: bytes,
    threshold_level: int = 128,
    edge_strength: float = 0.5,
    black_point: int = 0,
    white_point: int = 255,
    invert: bool = False,
) -> Image.Image:
    """Extract line art from image. Uses Replicate API if available, otherwise falls back to OpenCV."""
    if os.environ.get("REPLICATE_API_TOKEN"):
        try:
            return _extract_via_replicate(image_bytes)
        except Exception as e:
            logger.warning("Replicate API failed, falling back to local extraction: %s", e)
    return _extract_local(image_bytes, threshold_level, edge_strength, black_point, white_point, invert)


def _extract_via_replicate(image_bytes: bytes) -> Image.Image:
    """Send image to Replicate's ControlNet preprocessor for line art extraction."""
    import replicate

    data_uri = "data:image/png;base64," + base64.b64encode(image_bytes).decode()

    output = replicate.run(
        "fofr/controlnet-preprocessors",
        input={
            "image": data_uri,
            "preprocessor": "lineart",
        },
    )

    result_bytes = output[0] if isinstance(output[0], bytes) else output[0].read()
    img = Image.open(io.BytesIO(result_bytes))
    return img.convert("L")


def _extract_local(
    image_bytes: bytes,
    threshold_level: int = 128,
    edge_strength: float = 0.5,
    black_point: int = 0,
    white_point: int = 255,
    invert: bool = False,
) -> Image.Image:
    """Extract line art using binary threshold and/or edge detection.

    threshold_level: 0 = disabled, 1-255 = Photoshop-style binary threshold cutoff.
        Pixels darker than the level become black, lighter become white.
    edge_strength: 0.0 (no edges) to 1.0 (strong edge detection)
    black_point: 0-255, pixels at or below become black (ink)
    white_point: 0-255, pixels at or above become white (paper)
    """
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Apply levels: remap black_point..white_point to 0..255
    if black_point > 0 or white_point < 255:
        bp = max(0, min(254, black_point))
        wp = max(bp + 1, min(255, white_point))
        gray = np.clip((gray.astype(np.float32) - bp) / (wp - bp) * 255, 0, 255).astype(np.uint8)

    blurred = cv2.GaussianBlur(gray, (3, 3), 0)

    # Start with white canvas
    result = np.full_like(gray, 255)

    # Photoshop-style binary threshold: pixels below level → black, above → white
    if threshold_level > 0:
        _, thresh = cv2.threshold(blurred, threshold_level, 255, cv2.THRESH_BINARY)
        result = thresh

    # Edge detection via Canny
    if edge_strength > 0.01:
        low_thresh = max(10, int(80 - edge_strength * 70))
        high_thresh = max(30, int(200 - edge_strength * 150))
        edges = cv2.Canny(blurred, low_thresh, high_thresh)
        # Combine: where edges detected, force black
        result = np.where(edges > 0, 0, result).astype(np.uint8)

    # Clean up small noise
    kernel = np.ones((2, 2), np.uint8)
    result = cv2.morphologyEx(result, cv2.MORPH_CLOSE, kernel)

    if invert:
        result = cv2.bitwise_not(result)

    return Image.fromarray(result, mode="L")
