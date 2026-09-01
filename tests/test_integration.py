from __future__ import annotations
import io
from unittest.mock import patch
from PIL import Image
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def _mock_lineart(image_bytes, *args, **kwargs):
    img = Image.new("L", (200, 200), 255)
    return img


@patch("src.stamp_generator.extract_lineart", side_effect=_mock_lineart)
def test_full_flow(mock):
    # Upload
    img = Image.new("RGB", (300, 300), "green")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    resp = client.post("/api/upload", files={"file": ("photo.png", buf.read(), "image/png")})
    assert resp.status_code == 200
    image_id = resp.json()["image_id"]

    # Generate with all options
    resp = client.post("/api/generate", json={
        "image_id": image_id,
        "shape": "oval",
        "date_enabled": True,
        "date_layout": 1,
        "date_start": "01.01.2026",
        "date_end": "31.12.2026",
        "ink_density": 0.7,
        "wear": 0.4,
        "edge_bleed": 0.3,
        "line_thickness": 2,
        "subject_scale": 0.5,
        "threshold_level": 75,
        "edge_strength": 0.70,
        "canvas_width": 512,
        "canvas_height": 512,
    })
    assert resp.status_code == 200
    result = Image.open(io.BytesIO(resp.content))
    assert result.size == (512, 512)
    assert result.mode == "RGBA"


@patch("src.stamp_generator.extract_lineart", side_effect=_mock_lineart)
def test_generate_rect_shape(mock):
    img = Image.new("RGB", (200, 200), "blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    resp = client.post("/api/upload", files={"file": ("photo.png", buf.read(), "image/png")})
    image_id = resp.json()["image_id"]

    resp = client.post("/api/generate", json={
        "image_id": image_id,
        "shape": "rect",
        "ink_density": 0.5,
        "wear": 0.3,
        "edge_bleed": 0.2,
    })
    assert resp.status_code == 200
    result = Image.open(io.BytesIO(resp.content))
    assert result.size == (1080, 1080)


@patch("src.stamp_generator.extract_lineart", side_effect=_mock_lineart)
def test_generate_defaults(mock):
    img = Image.new("RGB", (200, 200), "red")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    resp = client.post("/api/upload", files={"file": ("photo.png", buf.read(), "image/png")})
    image_id = resp.json()["image_id"]

    resp = client.post("/api/generate", json={
        "image_id": image_id,
    })
    assert resp.status_code == 200
    result = Image.open(io.BytesIO(resp.content))
    assert result.size == (1080, 1080)


def test_generate_without_upload():
    resp = client.post("/api/generate", json={
        "image_id": "nonexistent-id",
    })
    assert resp.status_code == 404
