from __future__ import annotations
import io
import os
import base64
import logging

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def extract_lineart(image_bytes: bytes) -> Image.Image:
    """Extract line art from image. Uses Replicate API if available, otherwise falls back to OpenCV."""
    if os.environ.get("REPLICATE_API_TOKEN"):
        try:
            return _extract_via_replicate(image_bytes)
        except Exception as e:
            logger.warning("Replicate API failed, falling back to local extraction: %s", e)
    return _extract_local(image_bytes)


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


def _extract_local(image_bytes: bytes) -> Image.Image:
    """Extract line art using OpenCV edge detection and adaptive thresholding."""
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Reduce noise while keeping edges
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Adaptive threshold for clean black/white lines
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )

    # Edge detection for additional detail
    edges = cv2.Canny(blurred, 30, 100)

    # Combine: threshold gives solid areas, edges give fine detail
    # Invert edges (white lines on black -> black lines on white)
    edges_inv = cv2.bitwise_not(edges)
    combined = cv2.bitwise_and(thresh, edges_inv)

    # Clean up with morphological operations
    kernel = np.ones((2, 2), np.uint8)
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)

    return Image.fromarray(combined, mode="L")
