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


def _mock_lineart(image_bytes, *args, **kwargs):
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
            "shape": "oval",
            "ink_density": 0.5,
            "wear": 0.3,
            "edge_bleed": 0.2,
            "line_thickness": 2,
            "subject_scale": 0.5,
            "threshold_level": 75,
            "edge_strength": 0.70,
            "canvas_width": 512,
            "canvas_height": 512,
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    img = Image.open(io.BytesIO(response.content))
    assert img.size == (512, 512)
