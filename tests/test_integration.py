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
        "color": [30, 60, 150],
        "shape": "circle",
        "border_style": "double",
        "border_thickness": 4,
        "primary_text": "WanderQuest",
        "secondary_text": "Est. 2026",
        "font": "serif",
        "text_placement": "top_arc",
        "ink_density": 0.7,
        "wear": 0.4,
        "edge_bleed": 0.3,
        "line_thickness": 2,
        "subject_scale": 0.5,
        "background": "transparent",
        "output_size": 512,
    })
    assert resp.status_code == 200
    result = Image.open(io.BytesIO(resp.content))
    assert result.size == (512, 512)
    assert result.mode == "RGBA"


@patch("src.stamp_generator.extract_lineart", side_effect=_mock_lineart)
def test_generate_with_white_background(mock):
    # Upload
    img = Image.new("RGB", (200, 200), "blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    resp = client.post("/api/upload", files={"file": ("photo.png", buf.read(), "image/png")})
    image_id = resp.json()["image_id"]

    # Generate with white background
    resp = client.post("/api/generate", json={
        "image_id": image_id,
        "color": [0, 0, 0],
        "shape": "rectangle",
        "border_style": "single",
        "border_thickness": 2,
        "primary_text": "Test",
        "text_placement": "below",
        "background": "white",
        "output_size": 256,
    })
    assert resp.status_code == 200
    result = Image.open(io.BytesIO(resp.content))
    assert result.size == (256, 256)


@patch("src.stamp_generator.extract_lineart", side_effect=_mock_lineart)
def test_generate_no_text(mock):
    img = Image.new("RGB", (200, 200), "red")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    resp = client.post("/api/upload", files={"file": ("photo.png", buf.read(), "image/png")})
    image_id = resp.json()["image_id"]

    resp = client.post("/api/generate", json={
        "image_id": image_id,
        "color": [200, 30, 30],
        "shape": "oval",
        "border_style": "none",
        "border_thickness": 0,
        "output_size": 400,
    })
    assert resp.status_code == 200
    result = Image.open(io.BytesIO(resp.content))
    assert result.size == (400, 400)


def test_generate_without_upload():
    resp = client.post("/api/generate", json={
        "image_id": "nonexistent-id",
        "color": [0, 0, 0],
    })
    assert resp.status_code == 404
