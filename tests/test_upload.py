import io
from PIL import Image
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def _make_test_image(width=200, height=200) -> bytes:
    img = Image.new("RGB", (width, height), color="red")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()


def test_upload_returns_200():
    image_bytes = _make_test_image()
    response = client.post(
        "/api/upload",
        files={"file": ("test.png", image_bytes, "image/png")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "image_id" in data


def test_upload_rejects_non_image():
    response = client.post(
        "/api/upload",
        files={"file": ("test.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 400
