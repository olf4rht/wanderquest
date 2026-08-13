# WanderQuest Stamp Generator - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web app that converts uploaded photos into rubber stamp-style images with full customization controls.

**Architecture:** FastAPI backend handles photo upload and processing. Replicate API (`fofr/controlnet-preprocessors`) extracts line art from photos. OpenCV/Pillow pipeline applies stamp effects (ink texture, aging, borders, text). Vanilla HTML/CSS/JS frontend with live preview.

**Tech Stack:** Python 3.12, FastAPI, uvicorn, Pillow, OpenCV (opencv-python-headless), Replicate SDK, vanilla HTML/CSS/JS

---

### Task 1: Project Scaffolding

**Files:**
- Create: `pyproject.toml`
- Create: `requirements.txt`
- Create: `src/__init__.py`
- Create: `src/main.py`
- Create: `tests/__init__.py`
- Create: `.gitignore`
- Create: `.env.example`

**Step 1: Create .gitignore**

```
__pycache__/
*.pyc
.env
venv/
.venv/
*.egg-info/
dist/
build/
.pytest_cache/
uploads/
```

**Step 2: Create requirements.txt**

```
fastapi==0.115.0
uvicorn==0.30.0
python-multipart==0.0.9
pillow==10.4.0
opencv-python-headless==4.10.0.84
replicate==0.34.0
numpy==2.1.0
pytest==8.3.0
httpx==0.27.0
python-dotenv==1.0.1
```

**Step 3: Create .env.example**

```
REPLICATE_API_TOKEN=your_token_here
```

**Step 4: Create pyproject.toml**

```toml
[project]
name = "wanderquest"
version = "0.1.0"
description = "Photo to rubber stamp generator"
requires-python = ">=3.12"

[tool.pytest.ini_options]
testpaths = ["tests"]
```

**Step 5: Create minimal FastAPI app**

```python
# src/main.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="WanderQuest Stamp Generator")


@app.get("/health")
def health():
    return {"status": "ok"}
```

```python
# src/__init__.py
```

```python
# tests/__init__.py
```

**Step 6: Write test for health endpoint**

```python
# tests/test_main.py
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

**Step 7: Install dependencies and run test**

Run:
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest tests/test_main.py -v
```
Expected: PASS

**Step 8: Commit**

```bash
git add .gitignore pyproject.toml requirements.txt .env.example src/ tests/
git commit -m "feat: project scaffolding with FastAPI health endpoint"
```

---

### Task 2: Photo Upload Endpoint

**Files:**
- Create: `src/routers/__init__.py`
- Create: `src/routers/stamp.py`
- Modify: `src/main.py`
- Create: `tests/test_upload.py`
- Create: `tests/fixtures/` (add a small test image)

**Step 1: Write failing test for upload endpoint**

```python
# tests/test_upload.py
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
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_upload.py -v`
Expected: FAIL (404, route not found)

**Step 3: Implement upload endpoint**

```python
# src/routers/__init__.py
```

```python
# src/routers/stamp.py
import uuid
import io
from fastapi import APIRouter, UploadFile, HTTPException
from PIL import Image

router = APIRouter(prefix="/api")

# In-memory store for uploaded images (session-scoped, no persistence needed)
_image_store: dict[str, bytes] = {}

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload")
async def upload_photo(file: UploadFile):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="File must be PNG, JPEG, or WebP")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # Validate it's actually an image
    try:
        img = Image.open(io.BytesIO(contents))
        img.verify()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    image_id = str(uuid.uuid4())
    _image_store[image_id] = contents
    return {"image_id": image_id}


def get_image(image_id: str) -> bytes | None:
    return _image_store.get(image_id)
```

**Step 4: Register router in main.py**

```python
# src/main.py
from fastapi import FastAPI
from src.routers.stamp import router as stamp_router

app = FastAPI(title="WanderQuest Stamp Generator")
app.include_router(stamp_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

**Step 5: Run tests**

Run: `pytest tests/ -v`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/routers/ tests/test_upload.py src/main.py
git commit -m "feat: photo upload endpoint with validation"
```

---

### Task 3: Replicate Line Art Extraction

**Files:**
- Create: `src/lineart.py`
- Create: `tests/test_lineart.py`

**Step 1: Write test for line art extraction (mocked Replicate)**

```python
# tests/test_lineart.py
import io
from unittest.mock import patch, MagicMock
from PIL import Image
from src.lineart import extract_lineart


def _make_test_image() -> bytes:
    img = Image.new("RGB", (200, 200), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()


def _make_lineart_response() -> bytes:
    """Simulate what Replicate returns: a grayscale line art image."""
    img = Image.new("L", (200, 200), color=255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()


@patch("src.lineart.replicate")
def test_extract_lineart_returns_pil_image(mock_replicate):
    mock_replicate.run.return_value = [_make_lineart_response()]
    result = extract_lineart(_make_test_image())
    assert isinstance(result, Image.Image)
    assert result.mode == "L"
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_lineart.py -v`
Expected: FAIL (module not found)

**Step 3: Implement line art extraction**

```python
# src/lineart.py
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
```

**Step 4: Run test**

Run: `pytest tests/test_lineart.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lineart.py tests/test_lineart.py
git commit -m "feat: Replicate line art extraction with mock tests"
```

---

### Task 4: Image Cleanup Pipeline

**Files:**
- Create: `src/cleanup.py`
- Create: `tests/test_cleanup.py`

**Step 1: Write tests for cleanup functions**

```python
# tests/test_cleanup.py
import numpy as np
from PIL import Image
from src.cleanup import threshold_image, remove_noise, auto_crop, adjust_line_thickness


def _make_gray_image(width=100, height=100, value=128) -> Image.Image:
    return Image.fromarray(np.full((height, width), value, dtype=np.uint8), mode="L")


def test_threshold_produces_binary():
    img = _make_gray_image(value=128)
    result = threshold_image(img, threshold=100)
    pixels = set(np.array(result).flatten())
    assert pixels <= {0, 255}


def test_adjust_thickness_dilate():
    # Create image with a thin line
    arr = np.full((100, 100), 255, dtype=np.uint8)
    arr[50, 40:60] = 0  # thin horizontal line
    img = Image.fromarray(arr, mode="L")
    result = adjust_line_thickness(img, thickness=3)
    result_arr = np.array(result)
    # Line should be thicker (more black pixels)
    assert np.sum(result_arr == 0) > np.sum(arr == 0)


def test_auto_crop_removes_whitespace():
    arr = np.full((200, 200), 255, dtype=np.uint8)
    arr[80:120, 80:120] = 0  # black square in center
    img = Image.fromarray(arr, mode="L")
    result = auto_crop(img, padding=10)
    assert result.width < 200
    assert result.height < 200
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_cleanup.py -v`
Expected: FAIL

**Step 3: Implement cleanup functions**

```python
# src/cleanup.py
import cv2
import numpy as np
from PIL import Image


def threshold_image(img: Image.Image, threshold: int = 128) -> Image.Image:
    arr = np.array(img)
    _, binary = cv2.threshold(arr, threshold, 255, cv2.THRESH_BINARY)
    return Image.fromarray(binary, mode="L")


def remove_noise(img: Image.Image, kernel_size: int = 3) -> Image.Image:
    arr = np.array(img)
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    # Open operation removes small noise
    cleaned = cv2.morphologyEx(arr, cv2.MORPH_OPEN, kernel)
    return Image.fromarray(cleaned, mode="L")


def auto_crop(img: Image.Image, padding: int = 20) -> Image.Image:
    arr = np.array(img)
    # Find bounding box of non-white pixels
    coords = np.argwhere(arr < 128)
    if len(coords) == 0:
        return img
    y_min, x_min = coords.min(axis=0)
    y_max, x_max = coords.max(axis=0)
    # Add padding
    h, w = arr.shape
    y_min = max(0, y_min - padding)
    x_min = max(0, x_min - padding)
    y_max = min(h, y_max + padding)
    x_max = min(w, x_max + padding)
    return img.crop((x_min, y_min, x_max, y_max))


def adjust_line_thickness(img: Image.Image, thickness: int = 1) -> Image.Image:
    if thickness == 1:
        return img
    arr = np.array(img)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (thickness, thickness))
    if thickness > 1:
        # Dilate black lines (erode white = dilate inverted)
        inverted = cv2.bitwise_not(arr)
        dilated = cv2.dilate(inverted, kernel, iterations=1)
        result = cv2.bitwise_not(dilated)
    else:
        result = arr
    return Image.fromarray(result, mode="L")
```

**Step 4: Run tests**

Run: `pytest tests/test_cleanup.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/cleanup.py tests/test_cleanup.py
git commit -m "feat: image cleanup pipeline (threshold, noise removal, crop, line thickness)"
```

---

### Task 5: Composition - Shapes and Borders

**Files:**
- Create: `src/composition.py`
- Create: `tests/test_composition.py`

**Step 1: Write tests**

```python
# tests/test_composition.py
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
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_composition.py -v`
Expected: FAIL

**Step 3: Implement composition**

```python
# src/composition.py
from PIL import Image, ImageDraw
import numpy as np


def create_stamp_frame(
    shape: str,
    size: int,
    border_style: str,
    border_thickness: int,
) -> Image.Image:
    """Create a stamp frame/border as RGBA image. Black lines on transparent."""
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    margin = border_thickness + 5
    black = (0, 0, 0, 255)

    if shape == "circle":
        bbox = (margin, margin, size - margin, size - margin)
        draw.ellipse(bbox, outline=black, width=border_thickness)
        if border_style == "double":
            inner_margin = margin + border_thickness + 4
            inner_bbox = (inner_margin, inner_margin, size - inner_margin, size - inner_margin)
            draw.ellipse(inner_bbox, outline=black, width=max(1, border_thickness - 1))

    elif shape == "rectangle":
        bbox = (margin, margin, size - margin, size - margin)
        draw.rectangle(bbox, outline=black, width=border_thickness)
        if border_style == "double":
            inner_margin = margin + border_thickness + 4
            inner_bbox = (inner_margin, inner_margin, size - inner_margin, size - inner_margin)
            draw.rectangle(inner_bbox, outline=black, width=max(1, border_thickness - 1))

    elif shape == "oval":
        bbox = (margin, int(size * 0.15) + margin, size - margin, int(size * 0.85) - margin)
        draw.ellipse(bbox, outline=black, width=border_thickness)
        if border_style == "double":
            inner_margin = border_thickness + 4
            inner_bbox = (bbox[0] + inner_margin, bbox[1] + inner_margin,
                          bbox[2] - inner_margin, bbox[3] - inner_margin)
            draw.ellipse(inner_bbox, outline=black, width=max(1, border_thickness - 1))

    elif shape == "rounded_rectangle":
        bbox = (margin, margin, size - margin, size - margin)
        radius = size // 8
        draw.rounded_rectangle(bbox, radius=radius, outline=black, width=border_thickness)
        if border_style == "double":
            inner_margin = margin + border_thickness + 4
            inner_bbox = (inner_margin, inner_margin, size - inner_margin, size - inner_margin)
            draw.rounded_rectangle(inner_bbox, radius=max(1, radius - 4), outline=black, width=max(1, border_thickness - 1))

    return img


def place_image_in_frame(
    subject: Image.Image,
    frame: Image.Image,
    scale: float = 0.6,
) -> Image.Image:
    """Place the subject line art centered inside the frame."""
    frame_size = frame.size[0]
    target_size = int(frame_size * scale)

    # Resize subject to fit
    subject_resized = subject.copy()
    subject_resized.thumbnail((target_size, target_size), Image.LANCZOS)

    # Convert subject to RGBA (black lines on transparent)
    subject_rgba = Image.new("RGBA", frame.size, (255, 255, 255, 0))
    arr = np.array(subject_resized)
    alpha = (arr < 128).astype(np.uint8) * 255
    subject_with_alpha = Image.fromarray(
        np.stack([np.zeros_like(arr), np.zeros_like(arr), np.zeros_like(arr), alpha], axis=-1).astype(np.uint8),
        mode="RGBA",
    )

    # Center it
    x_offset = (frame_size - subject_resized.width) // 2
    y_offset = (frame_size - subject_resized.height) // 2
    subject_rgba.paste(subject_with_alpha, (x_offset, y_offset))

    # Composite frame on top
    result = Image.alpha_composite(subject_rgba, frame)
    return result
```

**Step 4: Run tests**

Run: `pytest tests/test_composition.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/composition.py tests/test_composition.py
git commit -m "feat: stamp frame composition with shapes and borders"
```

---

### Task 6: Text Rendering

**Files:**
- Create: `src/text_renderer.py`
- Create: `tests/test_text.py`
- Create: `static/fonts/` (download/add stamp-appropriate OFL fonts)

**Step 1: Write tests**

```python
# tests/test_text.py
import numpy as np
from PIL import Image
from src.text_renderer import render_text_straight, render_text_curved


def test_render_straight_text():
    canvas = Image.new("RGBA", (300, 300), (255, 255, 255, 0))
    result = render_text_straight(
        canvas, text="HELLO", position="below", font_name="serif", font_size=24
    )
    assert result.size == (300, 300)
    # Should have some non-transparent pixels (the text)
    arr = np.array(result)
    assert arr[:, :, 3].max() > 0


def test_render_curved_text():
    canvas = Image.new("RGBA", (300, 300), (255, 255, 255, 0))
    result = render_text_curved(
        canvas, text="HELLO WORLD", position="top_arc", font_name="serif", font_size=20
    )
    assert result.size == (300, 300)
    arr = np.array(result)
    assert arr[:, :, 3].max() > 0
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_text.py -v`
Expected: FAIL

**Step 3: Source open-license fonts**

Download 5-6 OFL-licensed fonts suitable for stamps. Use Google Fonts or similar:
- Serif: e.g., "Playfair Display"
- Blackletter: e.g., "UnifrakturMaguntia"
- Sans-serif: e.g., "Oswald"
- Handwritten: e.g., "Caveat"
- Stencil: e.g., "Stencil" or "Black Ops One"

```bash
mkdir -p static/fonts
# Download fonts (example with curl from Google Fonts API or bundled .ttf files)
```

**Step 4: Implement text rendering**

```python
# src/text_renderer.py
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = Path(__file__).parent.parent / "static" / "fonts"

FONT_MAP = {
    "serif": "PlayfairDisplay-Regular.ttf",
    "blackletter": "UnifrakturMaguntia-Regular.ttf",
    "sans": "Oswald-Regular.ttf",
    "handwritten": "Caveat-Regular.ttf",
    "stencil": "BlackOpsOne-Regular.ttf",
}


def _load_font(font_name: str, font_size: int) -> ImageFont.FreeTypeFont:
    filename = FONT_MAP.get(font_name, FONT_MAP["serif"])
    font_path = FONT_DIR / filename
    if font_path.exists():
        return ImageFont.truetype(str(font_path), font_size)
    return ImageFont.load_default()


def render_text_straight(
    canvas: Image.Image,
    text: str,
    position: str,
    font_name: str,
    font_size: int,
) -> Image.Image:
    """Render text straight (horizontal) on the canvas."""
    result = canvas.copy()
    draw = ImageDraw.Draw(result)
    font = _load_font(font_name, font_size)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    cx = canvas.width // 2

    if position == "above":
        y = int(canvas.height * 0.08)
    else:  # below
        y = int(canvas.height * 0.85)

    x = cx - text_width // 2
    draw.text((x, y), text, fill=(0, 0, 0, 255), font=font)
    return result


def render_text_curved(
    canvas: Image.Image,
    text: str,
    position: str,
    font_name: str,
    font_size: int,
) -> Image.Image:
    """Render text along a circular arc."""
    result = canvas.copy()
    font = _load_font(font_name, font_size)
    cx, cy = canvas.width // 2, canvas.height // 2
    radius = int(canvas.width * 0.38)

    if position == "top_arc":
        start_angle = math.pi + 0.3
        end_angle = 2 * math.pi - 0.3
    else:  # bottom_arc
        start_angle = 0.3
        end_angle = math.pi - 0.3

    if len(text) == 0:
        return result

    angle_span = end_angle - start_angle
    angle_step = angle_span / max(len(text), 1)

    for i, char in enumerate(text):
        angle = start_angle + angle_step * (i + 0.5)
        x = cx + radius * math.cos(angle)
        y = cy + radius * math.sin(angle)

        # Render character
        char_img = Image.new("RGBA", (font_size * 2, font_size * 2), (0, 0, 0, 0))
        char_draw = ImageDraw.Draw(char_img)
        char_draw.text((font_size // 2, font_size // 2), char, fill=(0, 0, 0, 255), font=font)

        # Rotate character to follow the arc
        rotation = -math.degrees(angle) - 90
        if position == "bottom_arc":
            rotation += 180
        char_img = char_img.rotate(rotation, expand=True, resample=Image.BICUBIC)

        # Paste centered on position
        paste_x = int(x - char_img.width // 2)
        paste_y = int(y - char_img.height // 2)
        result.alpha_composite(char_img, (paste_x, paste_y))

    return result
```

**Step 5: Run tests**

Run: `pytest tests/test_text.py -v`
Expected: ALL PASS (will use default font if custom fonts not yet downloaded)

**Step 6: Commit**

```bash
git add src/text_renderer.py tests/test_text.py static/fonts/
git commit -m "feat: text rendering with straight and curved placement"
```

---

### Task 7: Ink Effect Pipeline

**Files:**
- Create: `src/ink_effect.py`
- Create: `tests/test_ink_effect.py`

**Step 1: Write tests**

```python
# tests/test_ink_effect.py
import numpy as np
from PIL import Image
from src.ink_effect import colorize, apply_ink_texture, apply_wear, apply_edge_bleed


def _make_stamp_bw() -> Image.Image:
    """Black lines on white background, RGBA."""
    arr = np.full((100, 100, 4), 255, dtype=np.uint8)
    # Draw some black lines
    arr[40:60, 20:80, :3] = 0
    arr[40:60, 20:80, 3] = 255
    return Image.fromarray(arr, mode="RGBA")


def test_colorize():
    stamp = _make_stamp_bw()
    result = colorize(stamp, color=(200, 30, 30))
    arr = np.array(result)
    # Black pixels should now be red-ish
    mask = np.array(stamp)[:, :, 0] < 128
    assert arr[mask, 0].mean() > 150  # R channel should be high


def test_apply_wear_reduces_opacity():
    stamp = _make_stamp_bw()
    result = apply_wear(stamp, intensity=0.8)
    orig_alpha = np.array(stamp)[:, :, 3].sum()
    result_alpha = np.array(result)[:, :, 3].sum()
    # Wear should reduce some alpha
    assert result_alpha <= orig_alpha


def test_apply_ink_texture_modifies_image():
    stamp = _make_stamp_bw()
    result = apply_ink_texture(stamp, density=0.5)
    assert result.size == stamp.size
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_ink_effect.py -v`
Expected: FAIL

**Step 3: Implement ink effects**

```python
# src/ink_effect.py
import numpy as np
from PIL import Image, ImageFilter


def colorize(img: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """Replace black pixels with the given ink color."""
    arr = np.array(img).astype(np.float32)
    # Identify "ink" pixels (dark, with alpha)
    luminance = arr[:, :, :3].mean(axis=2)
    ink_mask = luminance < 128

    result = arr.copy()
    for i, c in enumerate(color):
        channel = result[:, :, i]
        # Blend: darker pixels get more ink color
        blend = 1.0 - (luminance / 255.0)
        channel[ink_mask] = c * blend[ink_mask] + channel[ink_mask] * (1.0 - blend[ink_mask])
        result[:, :, i] = channel

    return Image.fromarray(result.clip(0, 255).astype(np.uint8), mode="RGBA")


def apply_ink_texture(img: Image.Image, density: float = 0.5) -> Image.Image:
    """Add uneven ink coverage texture. density: 0.0 (light) to 1.0 (heavy)."""
    arr = np.array(img).astype(np.float32)
    h, w = arr.shape[:2]

    # Generate Perlin-like noise using multiple octaves of random noise
    noise = np.zeros((h, w), dtype=np.float32)
    for scale in [4, 8, 16, 32]:
        small = np.random.RandomState(42).rand(h // scale + 1, w // scale + 1).astype(np.float32)
        resized = np.array(Image.fromarray(small).resize((w, h), Image.BILINEAR))
        noise += resized
    noise = noise / noise.max()

    # Apply noise to alpha channel (simulates uneven ink)
    ink_mask = arr[:, :, :3].mean(axis=2) < 200
    strength = 1.0 - density  # Higher density = less texture variation
    alpha_mod = 1.0 - (noise * strength * 0.4)
    arr[:, :, 3] = arr[:, :, 3] * np.where(ink_mask, alpha_mod, 1.0)

    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), mode="RGBA")


def apply_wear(img: Image.Image, intensity: float = 0.3) -> Image.Image:
    """Add wear: random gaps in lines, faded spots. intensity: 0.0 (none) to 1.0 (heavy)."""
    arr = np.array(img).astype(np.float32)
    h, w = arr.shape[:2]

    # Random spots that erase ink
    rng = np.random.RandomState(123)
    wear_mask = rng.rand(h, w) < (intensity * 0.15)

    # Blur the wear mask for natural-looking patches
    wear_img = Image.fromarray((wear_mask * 255).astype(np.uint8), mode="L")
    wear_img = wear_img.filter(ImageFilter.GaussianBlur(radius=3))
    wear = np.array(wear_img).astype(np.float32) / 255.0

    arr[:, :, 3] = arr[:, :, 3] * (1.0 - wear * intensity)

    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), mode="RGBA")


def apply_edge_bleed(img: Image.Image, amount: float = 0.3) -> Image.Image:
    """Simulate ink bleeding at edges. amount: 0.0 (crisp) to 1.0 (heavy bleed)."""
    if amount < 0.05:
        return img

    radius = max(1, int(amount * 3))
    blurred = img.filter(ImageFilter.GaussianBlur(radius=radius))

    # Blend original with blurred version
    arr_orig = np.array(img).astype(np.float32)
    arr_blur = np.array(blurred).astype(np.float32)
    blend = amount * 0.5
    result = arr_orig * (1.0 - blend) + arr_blur * blend

    return Image.fromarray(result.clip(0, 255).astype(np.uint8), mode="RGBA")
```

**Step 4: Run tests**

Run: `pytest tests/test_ink_effect.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/ink_effect.py tests/test_ink_effect.py
git commit -m "feat: ink effect pipeline (colorize, texture, wear, edge bleed)"
```

---

### Task 8: Stamp Generation Endpoint

**Files:**
- Create: `src/stamp_generator.py`
- Modify: `src/routers/stamp.py`
- Create: `tests/test_generate.py`

**Step 1: Write test for the generate endpoint**

```python
# tests/test_generate.py
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
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_generate.py -v`
Expected: FAIL

**Step 3: Implement stamp generator orchestrator**

```python
# src/stamp_generator.py
from PIL import Image
from src.lineart import extract_lineart
from src.cleanup import threshold_image, remove_noise, auto_crop, adjust_line_thickness
from src.composition import create_stamp_frame, place_image_in_frame
from src.text_renderer import render_text_straight, render_text_curved
from src.ink_effect import colorize, apply_ink_texture, apply_wear, apply_edge_bleed
from dataclasses import dataclass


@dataclass
class StampConfig:
    color: tuple[int, int, int]
    shape: str
    border_style: str
    border_thickness: int
    primary_text: str
    secondary_text: str
    font: str
    text_placement: str
    ink_density: float
    wear: float
    edge_bleed: float
    line_thickness: int
    subject_scale: float
    background: str
    output_size: int


def generate_stamp(image_bytes: bytes, config: StampConfig) -> Image.Image:
    # Stage 1: Line art extraction
    lineart = extract_lineart(image_bytes)

    # Stage 2: Cleanup
    lineart = threshold_image(lineart)
    lineart = remove_noise(lineart)
    lineart = auto_crop(lineart)
    lineart = adjust_line_thickness(lineart, config.line_thickness)

    # Stage 3: Composition
    frame = create_stamp_frame(
        shape=config.shape,
        size=config.output_size,
        border_style=config.border_style,
        border_thickness=config.border_thickness,
    )
    composed = place_image_in_frame(lineart, frame, scale=config.subject_scale)

    # Add text
    if config.primary_text:
        if config.text_placement in ("top_arc", "bottom_arc"):
            composed = render_text_curved(
                composed, config.primary_text, config.text_placement, config.font, config.output_size // 15
            )
        else:
            composed = render_text_straight(
                composed, config.primary_text, config.text_placement, config.font, config.output_size // 12
            )

    if config.secondary_text:
        secondary_placement = "bottom_arc" if config.text_placement == "top_arc" else "below"
        if secondary_placement == "bottom_arc":
            composed = render_text_curved(
                composed, config.secondary_text, secondary_placement, config.font, config.output_size // 18
            )
        else:
            composed = render_text_straight(
                composed, config.secondary_text, "below", config.font, config.output_size // 16
            )

    # Stage 4: Ink effects
    composed = colorize(composed, config.color)
    composed = apply_ink_texture(composed, config.ink_density)
    composed = apply_wear(composed, config.wear)
    composed = apply_edge_bleed(composed, config.edge_bleed)

    # Stage 5: Background
    if config.background == "white":
        bg = Image.new("RGBA", composed.size, (255, 255, 255, 255))
        bg = Image.alpha_composite(bg, composed)
        return bg.convert("RGB")

    return composed
```

**Step 4: Add generate endpoint to router**

```python
# Add to src/routers/stamp.py

import io
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from src.stamp_generator import generate_stamp, StampConfig


class GenerateRequest(BaseModel):
    image_id: str
    color: list[int]  # [R, G, B]
    shape: str = "circle"
    border_style: str = "single"
    border_thickness: int = 3
    primary_text: str = ""
    secondary_text: str = ""
    font: str = "serif"
    text_placement: str = "below"
    ink_density: float = 0.5
    wear: float = 0.3
    edge_bleed: float = 0.2
    line_thickness: int = 2
    subject_scale: float = 0.5
    background: str = "transparent"
    output_size: int = 512


@router.post("/generate")
async def generate(request: GenerateRequest):
    image_bytes = get_image(request.image_id)
    if image_bytes is None:
        raise HTTPException(status_code=404, detail="Image not found. Upload first.")

    config = StampConfig(
        color=tuple(request.color),
        shape=request.shape,
        border_style=request.border_style,
        border_thickness=request.border_thickness,
        primary_text=request.primary_text,
        secondary_text=request.secondary_text,
        font=request.font,
        text_placement=request.text_placement,
        ink_density=request.ink_density,
        wear=request.wear,
        edge_bleed=request.edge_bleed,
        line_thickness=request.line_thickness,
        subject_scale=request.subject_scale,
        background=request.background,
        output_size=request.output_size,
    )

    result = generate_stamp(image_bytes, config)

    buf = io.BytesIO()
    fmt = "PNG" if request.background == "transparent" else "PNG"
    result.save(buf, format=fmt)
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/png")
```

**Step 5: Run tests**

Run: `pytest tests/ -v`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/stamp_generator.py src/routers/stamp.py tests/test_generate.py
git commit -m "feat: stamp generation endpoint orchestrating full pipeline"
```

---

### Task 9: Frontend - HTML/CSS Layout

**Files:**
- Create: `static/index.html`
- Create: `static/styles.css`
- Modify: `src/main.py` (serve static files)

**Step 1: Mount static files in FastAPI**

```python
# Update src/main.py to add at the end (after router):
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(static_dir, "index.html"))
```

**Step 2: Create HTML**

Create `static/index.html` with:
- Left sidebar with all control sections (upload, color, text, shape, ink, image)
- Right preview area with download buttons
- Responsive layout (sidebar stacks on mobile)
- Semantic grouping of controls with collapsible sections

**Step 3: Create CSS**

Create `static/styles.css` with:
- Two-column layout (sidebar 320px, preview fills remaining)
- Control group styling with labels
- Slider styling
- Color preset buttons
- Upload area with drag-and-drop visual cue
- Preview area centered with subtle border
- Mobile breakpoint at 768px (stack layout)

**Step 4: Verify page loads**

Run: `cd /Users/macbookpro/code/wanderquest && source .venv/bin/activate && uvicorn src.main:app --reload`
Open: `http://localhost:8000`
Expected: Page renders with sidebar and preview area

**Step 5: Commit**

```bash
git add static/index.html static/styles.css src/main.py
git commit -m "feat: frontend layout with controls sidebar and preview area"
```

---

### Task 10: Frontend - JavaScript Interactivity

**Files:**
- Create: `static/app.js`
- Modify: `static/index.html` (add script tag)

**Step 1: Implement upload handling**

Wire up the upload input/drag-drop zone to POST to `/api/upload`. Store the returned `image_id`.

**Step 2: Implement control change handler**

On any control change (slider, color picker, text input, dropdown), collect all current values and POST to `/api/generate` with the `image_id` + all config. Display the returned PNG in the preview area.

Use a debounce (300ms) on slider changes to avoid hammering the server.

**Step 3: Implement download buttons**

- "Download PNG" — trigger download of the current preview image
- Wire up both transparent and white background download options

**Step 4: Test manually**

Run the server, upload a test image, adjust controls, verify:
- Upload works and triggers initial stamp generation
- Slider changes update the preview
- Color picker changes work
- Text input updates the stamp
- Download produces a valid PNG

**Step 5: Commit**

```bash
git add static/app.js static/index.html
git commit -m "feat: frontend JavaScript for upload, controls, and live preview"
```

---

### Task 11: Integration Test & Polish

**Files:**
- Create: `tests/test_integration.py`
- Modify: various files for bug fixes

**Step 1: Write end-to-end integration test**

```python
# tests/test_integration.py
import io
from unittest.mock import patch
from PIL import Image
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def _mock_lineart(image_bytes):
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
```

**Step 2: Run full test suite**

Run: `pytest tests/ -v`
Expected: ALL PASS

**Step 3: Manual end-to-end test with real Replicate API**

```bash
export REPLICATE_API_TOKEN=<your_token>
uvicorn src.main:app --reload
```
Upload a real photo, verify the full pipeline works.

**Step 4: Commit**

```bash
git add tests/test_integration.py
git commit -m "feat: integration test for full stamp generation flow"
```

---

### Task 12: README

**Files:**
- Create: `README.md`

**Step 1: Write README**

Cover:
- What WanderQuest does (one paragraph + screenshot)
- Setup: clone, create venv, install deps, set REPLICATE_API_TOKEN
- Run: `uvicorn src.main:app --reload`
- Run tests: `pytest tests/ -v`
- Project structure overview

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```
