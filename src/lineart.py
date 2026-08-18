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
    threshold_strength: float = 0.5,
    edge_strength: float = 0.5,
) -> Image.Image:
    """Extract line art from image. Uses Replicate API if available, otherwise falls back to OpenCV."""
    if os.environ.get("REPLICATE_API_TOKEN"):
        try:
            return _extract_via_replicate(image_bytes)
        except Exception as e:
            logger.warning("Replicate API failed, falling back to local extraction: %s", e)
    return _extract_local(image_bytes, threshold_strength, edge_strength)


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
    threshold_strength: float = 0.5,
    edge_strength: float = 0.5,
) -> Image.Image:
    """Extract line art using OpenCV edge detection and adaptive thresholding.

    threshold_strength: 0.0 (no threshold, edges only) to 1.0 (heavy threshold, fills solid areas)
    edge_strength: 0.0 (no edges) to 1.0 (strong edge detection, more fine detail)
    """
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Adaptive threshold — block_size controls how local/global the threshold is
    # Higher threshold_strength = smaller block = more detail captured
    block_size = max(3, int(31 - threshold_strength * 20))
    if block_size % 2 == 0:
        block_size += 1
    c_value = max(1, int(10 - threshold_strength * 8))
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, c_value
    )

    # Edge detection — Canny thresholds control sensitivity
    low_thresh = max(10, int(80 - edge_strength * 70))
    high_thresh = max(30, int(200 - edge_strength * 150))
    edges = cv2.Canny(blurred, low_thresh, high_thresh)
    edges_inv = cv2.bitwise_not(edges)

    # Blend threshold and edges based on their strengths
    # Start with white canvas
    result = np.full_like(gray, 255)

    if threshold_strength > 0.01:
        # Darken where threshold found dark areas
        thresh_weight = threshold_strength
        result = np.where(thresh < 128, np.clip(result.astype(np.float32) * (1 - thresh_weight), 0, 255), result).astype(np.uint8)

    if edge_strength > 0.01:
        # Darken where edges were detected
        edge_weight = edge_strength
        result = np.where(edges_inv < 128, np.clip(result.astype(np.float32) * (1 - edge_weight), 0, 255), result).astype(np.uint8)

    # Final binary threshold
    _, result = cv2.threshold(result, 128, 255, cv2.THRESH_BINARY)

    # Clean up
    kernel = np.ones((2, 2), np.uint8)
    result = cv2.morphologyEx(result, cv2.MORPH_CLOSE, kernel)

    return Image.fromarray(result, mode="L")
