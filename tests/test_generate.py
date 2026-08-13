from __future__ import annotations
import io
from unittest.mock import patch
from PIL import Image
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def _upload_image() -> str:
    img = Image.new("RGB", (200, 200), color="red")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    response = client.post(
        "/api/upload",
        files={"file": ("test.png", buf.read(), "image/png")},
    )
    return response.json()["image_id"]


def _mock_lineart(image_bytes):
    """Return a fake line art image."""
    img = Image.new("L", (200, 200), 255)
    return img


@patch("src.stamp_generator.extract_lineart", side_effect=_mock_lineart)
def test_generate_stamp(mock_lineart):
    image_id = _upload_image()
    response = client.post(
        "/api/generate",
        json={
            "image_id": image_id,
            "color": [200, 30, 30],
            "shape": "circle",
            "border_style": "single",
            "border_thickness": 3,
            "primary_text": "Test Stamp",
            "secondary_text": "",
            "font": "serif",
            "text_placement": "below",
            "ink_density": 0.5,
            "wear": 0.3,
            "edge_bleed": 0.2,
            "line_thickness": 2,
            "subject_scale": 0.5,
            "background": "transparent",
            "output_size": 512,
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    # Verify it's a valid PNG
    img = Image.open(io.BytesIO(response.content))
    assert img.size == (512, 512)
