from __future__ import annotations
import io
import base64
import replicate
from PIL import Image


def extract_lineart(image_bytes: bytes) -> Image.Image:
    """Send image to Replicate's ControlNet preprocessor for line art extraction."""
    data_uri = "data:image/png;base64," + base64.b64encode(image_bytes).decode()

    output = replicate.run(
        "fofr/controlnet-preprocessors",
        input={
            "image": data_uri,
            "preprocessor": "lineart",
        },
    )

    # output is a list of FileOutput objects; first item is the result
    result_bytes = output[0] if isinstance(output[0], bytes) else output[0].read()
    img = Image.open(io.BytesIO(result_bytes))
    return img.convert("L")
