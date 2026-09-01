# Brand Logo Configurator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign WANDERQUEST stamp generator into a brand-logo configurator with SVG template-based composition, new minimalist editor UI, and simplified B&W-only processing.

**Architecture:** Python/FastAPI backend handles image processing and SVG template compositing. Vanilla JS frontend provides a neutral editor UI with floating panels. 9 SVG layout templates (3 shapes × 3 date modes) define exact logo placement, frame geometry, and date positions. The existing B&W processing pipeline is preserved; text rendering, color selection, and the old shape/border system are removed.

**Tech Stack:** Python 3, FastAPI, Pillow, OpenCV, cairosvg (new), xml.etree.ElementTree, vanilla JS/HTML/CSS

**Design doc:** `docs/plans/2026-09-01-brand-configurator-design.md`

---

### Task 1: Asset Setup & Dependencies

**Files:**
- Create: `static/assets/layouts/` (9 SVG files)
- Create: `static/assets/fonts/` (2 font files)
- Create: `static/assets/logo.svg`
- Modify: `requirements.txt`

**Step 1: Create assets directory and copy files**

```bash
mkdir -p static/assets/layouts static/assets/fonts
cp "/Users/macbookpro/Dropbox (Personal)/(Personal)/Clients/The Nomadic/Assets/logo.svg" static/assets/logo.svg
cp "/Users/macbookpro/Dropbox (Personal)/(Personal)/Clients/The Nomadic/layouts/"*.svg static/assets/layouts/
cp "/Users/macbookpro/Dropbox (Personal)/(Personal)/Clients/The Nomadic/Fonts/Courrier_new.ttf" static/assets/fonts/
cp "/Users/macbookpro/Dropbox (Personal)/(Personal)/Clients/The Nomadic/Fonts/GT-Pressura-Extended-Medium-Trial.woff2" static/assets/fonts/
```

**Step 2: Add cairosvg dependency**

Add `cairosvg` to `requirements.txt`. This is needed to rasterize the SVG templates.

```bash
pip install cairosvg
```

**Step 3: Verify assets**

```bash
ls -la static/assets/layouts/  # Should show 9 SVG files
ls -la static/assets/fonts/    # Should show 2 font files
ls -la static/assets/logo.svg  # Should exist
```

**Step 4: Commit**

```bash
git add static/assets/ requirements.txt
git commit -m "chore: add brand assets (layouts, fonts, logo) and cairosvg dependency"
```

---

### Task 2: Simplify Backend Models

**Files:**
- Modify: `src/routers/stamp.py` (lines 48-69 — GenerateRequest model, lines 72-113 — generate endpoint)
- Modify: `src/stamp_generator.py` (lines 11-32 — StampConfig)

**Step 1: Rewrite StampConfig**

Replace the dataclass in `src/stamp_generator.py` (lines 11-32) with:

```python
@dataclass
class StampConfig:
    shape: str = "oval"                   # oval, rectangle, square
    date_enabled: bool = False
    date_layout: int = 1                  # 1 or 2
    date_start: str = ""                  # DD.MM.YYYY
    date_end: str = ""                    # DD.MM.YYYY
    ink_density: float = 0.50
    wear: float = 0.30
    edge_bleed: float = 0.20
    line_thickness: int = 2
    subject_scale: float = 0.50
    threshold_level: int = 75
    edge_strength: float = 0.70
    black_point: int = 0
    white_point: int = 255
    invert: bool = False
    canvas_width: int = 1080
    canvas_height: int = 1080
```

**Step 2: Rewrite GenerateRequest**

Replace the Pydantic model in `src/routers/stamp.py` (lines 48-69) with:

```python
class GenerateRequest(BaseModel):
    image_id: str
    shape: str = "oval"
    date_enabled: bool = False
    date_layout: int = 1
    date_start: str = ""
    date_end: str = ""
    ink_density: float = 0.50
    wear: float = 0.30
    edge_bleed: float = 0.20
    line_thickness: int = 2
    subject_scale: float = 0.50
    threshold_level: int = 75
    edge_strength: float = 0.70
    black_point: int = 0
    white_point: int = 255
    invert: bool = False
    canvas_width: int = 1080
    canvas_height: int = 1080
```

**Step 3: Update config mapping in generate endpoint**

In the `generate()` function (around line 82), update the StampConfig creation to use the new fields only. Remove all references to `color`, `primary_text`, `secondary_text`, `font`, `text_placement`, `border_style`, `border_thickness`, `background`, `output_size`.

**Step 4: Run existing tests to see what breaks**

```bash
python -m pytest tests/ -v 2>&1 | head -50
```

Note failures — they'll be fixed in later tasks.

**Step 5: Commit**

```bash
git add src/routers/stamp.py src/stamp_generator.py
git commit -m "refactor: simplify StampConfig and GenerateRequest for brand configurator"
```

---

### Task 3: SVG Template Loader

**Files:**
- Create: `src/svg_template.py`
- Create: `tests/test_svg_template.py`

**Step 1: Write tests for template loader**

```python
# tests/test_svg_template.py
import pytest
from src.svg_template import load_template, get_image_region, get_template_key


def test_get_template_key_no_date():
    assert get_template_key("oval", False, 1) == "oval_shape_image"
    assert get_template_key("rect", False, 1) == "rect_shape_image"
    assert get_template_key("square", False, 1) == "square_shape_image"


def test_get_template_key_date_layout_1():
    assert get_template_key("oval", True, 1) == "date_layout_1_oval_shape"
    assert get_template_key("rect", True, 1) == "date_layout_1_rect_shape"
    assert get_template_key("square", True, 1) == "date_layout_1_square_shape"


def test_get_template_key_date_layout_2():
    assert get_template_key("oval", True, 2) == "date_layout_2_oval_shape"
    assert get_template_key("rect", True, 2) == "date_layout_2_rect_shape"
    assert get_template_key("square", True, 2) == "date_layout_2_square_shape"


def test_load_template_returns_svg_string():
    svg = load_template("oval_shape_image")
    assert "<svg" in svg
    assert 'id="image-region"' in svg


def test_get_image_region_oval():
    svg = load_template("oval_shape_image")
    region = get_image_region(svg)
    assert region["type"] == "ellipse"
    assert "cx" in region and "cy" in region
    assert "rx" in region and "ry" in region


def test_get_image_region_rect():
    svg = load_template("rect_shape_image")
    region = get_image_region(svg)
    assert region["type"] == "rect"
    assert "x" in region and "y" in region
    assert "width" in region and "height" in region
    assert "rx" in region


def test_get_image_region_square():
    svg = load_template("square_shape_image")
    region = get_image_region(svg)
    assert region["type"] == "rect"
    assert region["width"] == region["height"]
```

**Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_svg_template.py -v
```

**Step 3: Implement svg_template.py**

```python
# src/svg_template.py
"""SVG template loader and parser for brand layout templates."""

import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path

LAYOUTS_DIR = Path(__file__).parent.parent / "static" / "assets" / "layouts"

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)


def get_template_key(shape: str, date_enabled: bool, date_layout: int) -> str:
    """Return the SVG filename (without .svg) for the given shape and date mode."""
    if not date_enabled:
        return f"{shape}_shape_image"
    return f"date_layout_{date_layout}_{shape}_shape"


def load_template(key: str) -> str:
    """Load an SVG template by key, return raw SVG string."""
    path = LAYOUTS_DIR / f"{key}.svg"
    if not path.exists():
        raise FileNotFoundError(f"Template not found: {path}")
    return path.read_text(encoding="utf-8")


def get_image_region(svg_content: str) -> dict:
    """Parse SVG and extract the image-region element's geometry.

    Returns dict with keys depending on shape type:
    - ellipse: {type, cx, cy, rx, ry}
    - rect: {type, x, y, width, height, rx}
    """
    root = ET.fromstring(svg_content)

    # Search for element with id="image-region"
    region = None
    for elem in root.iter():
        if elem.get("id") == "image-region":
            region = elem
            break

    if region is None:
        raise ValueError("No element with id='image-region' found in SVG")

    tag = region.tag.split("}")[-1] if "}" in region.tag else region.tag

    if tag == "rect":
        return {
            "type": "rect",
            "x": float(region.get("x", 0)),
            "y": float(region.get("y", 0)),
            "width": float(region.get("width", 0)),
            "height": float(region.get("height", 0)),
            "rx": float(region.get("rx", 0)),
        }
    elif tag == "ellipse":
        return {
            "type": "ellipse",
            "cx": float(region.get("cx", 0)),
            "cy": float(region.get("cy", 0)),
            "rx": float(region.get("rx", 0)),
            "ry": float(region.get("ry", 0)),
        }
    elif tag == "path":
        # Oval image-region is a <path> describing an ellipse
        # Extract bounding box from the path d attribute
        d = region.get("d", "")
        return _parse_ellipse_path(d)
    else:
        raise ValueError(f"Unexpected image-region tag: {tag}")


def _parse_ellipse_path(d: str) -> dict:
    """Extract ellipse bounds from an SVG path that describes an ellipse.

    Uses the 'M' (moveto) command and path bounds to determine center and radii.
    """
    # Extract all numbers from the path
    nums = [float(x) for x in re.findall(r"[-+]?\d*\.?\d+", d)]
    if len(nums) < 4:
        raise ValueError("Cannot parse ellipse path")

    # Find x and y coordinate ranges
    # The path starts with M x,y — extract all coordinate pairs
    xs = nums[0::2]  # even indices
    ys = nums[1::2]  # odd indices

    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    cx = (min_x + max_x) / 2
    cy = (min_y + max_y) / 2
    rx = (max_x - min_x) / 2
    ry = (max_y - min_y) / 2

    return {
        "type": "ellipse",
        "cx": cx,
        "cy": cy,
        "rx": rx,
        "ry": ry,
    }


def prepare_template_svg(svg_content: str) -> str:
    """Prepare an SVG for rendering by making the image-region transparent.

    Returns modified SVG string with image-region fill set to 'none'.
    """
    root = ET.fromstring(svg_content)
    for elem in root.iter():
        if elem.get("id") == "image-region":
            elem.set("fill", "none")
            break
    return ET.tostring(root, encoding="unicode")


def update_date_text(svg_content: str, date_start: str, date_end: str) -> str:
    """Update date text elements in layout 1 SVGs.

    date_start/date_end format: DD.MM.YYYY
    Layout 1 has date-start and date-end groups with 3 circled text elements each (DD, MM, YY).
    """
    root = ET.fromstring(svg_content)

    def _update_date_group(root_elem, group_id: str, date_str: str):
        """Find date group and update its 3 text elements."""
        if not date_str:
            return
        parts = date_str.split(".")
        if len(parts) != 3:
            return
        dd, mm, yyyy = parts
        yy = yyyy[-2:] if len(yyyy) == 4 else yyyy

        for elem in root_elem.iter():
            if elem.get("id") == group_id:
                texts = []
                for child in elem.iter():
                    tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                    if tag == "text":
                        texts.append(child)
                # Update text content: DD, MM, YY
                values = [dd, mm, yy]
                for i, text_elem in enumerate(texts):
                    if i < len(values):
                        # Update tspan inside text
                        for tspan in text_elem.iter():
                            tag = tspan.tag.split("}")[-1] if "}" in tspan.tag else tspan.tag
                            if tag == "tspan":
                                tspan.text = values[i]
                                break
                break

    _update_date_group(root, "date-start", date_start)
    _update_date_group(root, "date-end", date_end)

    return ET.tostring(root, encoding="unicode")
```

**Step 4: Run tests**

```bash
python -m pytest tests/test_svg_template.py -v
```

Fix any failures (likely the ellipse path parser needs tuning for the oval's actual path format).

**Step 5: Commit**

```bash
git add src/svg_template.py tests/test_svg_template.py
git commit -m "feat: add SVG template loader with region parsing and date text updates"
```

---

### Task 4: Rewrite Composition Module

**Files:**
- Rewrite: `src/composition.py`
- Create: `tests/test_composition_new.py`

**Step 1: Write tests**

```python
# tests/test_composition_new.py
import pytest
from PIL import Image
from src.composition import compose_stamp


def test_compose_stamp_returns_rgba():
    # Create a simple test B&W image (black square on white)
    img = Image.new("L", (200, 200), 255)
    result = compose_stamp(
        processed_image=img,
        shape="oval",
        date_enabled=False,
        date_layout=1,
        date_start="",
        date_end="",
        subject_scale=0.5,
    )
    assert result.mode == "RGBA"
    assert result.size == (1080, 1080)


def test_compose_stamp_with_date_layout_1():
    img = Image.new("L", (200, 200), 255)
    result = compose_stamp(
        processed_image=img,
        shape="oval",
        date_enabled=True,
        date_layout=1,
        date_start="01.05.2026",
        date_end="05.05.2026",
        subject_scale=0.5,
    )
    assert result.mode == "RGBA"
    assert result.size == (1080, 1080)


def test_compose_stamp_rect_shape():
    img = Image.new("L", (200, 200), 255)
    result = compose_stamp(
        processed_image=img,
        shape="rect",
        date_enabled=False,
        date_layout=1,
        date_start="",
        date_end="",
        subject_scale=0.5,
    )
    assert result.mode == "RGBA"
```

**Step 2: Rewrite composition.py**

```python
# src/composition.py
"""Compose processed image into SVG layout templates."""

import io
import numpy as np
from PIL import Image, ImageDraw
import cairosvg
from src.svg_template import (
    get_template_key,
    load_template,
    get_image_region,
    prepare_template_svg,
    update_date_text,
)

TEMPLATE_SIZE = 1080


def compose_stamp(
    processed_image: Image.Image,
    shape: str,
    date_enabled: bool,
    date_layout: int,
    date_start: str,
    date_end: str,
    subject_scale: float,
) -> Image.Image:
    """Compose a processed B&W image into the matching SVG layout template.

    1. Select template SVG based on shape × date mode
    2. Extract image-region geometry
    3. Place processed image into region (cover + clip)
    4. Render SVG overlay (logo, outlines, dates)
    5. Composite image under overlay

    Returns RGBA image at 1080×1080.
    """
    # Select and load template
    key = get_template_key(shape, date_enabled, date_layout)
    svg_content = load_template(key)

    # Update date text if layout 1
    if date_enabled and date_layout == 1:
        svg_content = update_date_text(svg_content, date_start, date_end)

    # Get image region geometry
    region = get_image_region(svg_content)

    # Prepare SVG for rendering (make image-region transparent)
    overlay_svg = prepare_template_svg(svg_content)

    # Render SVG overlay to PNG
    overlay_png = cairosvg.svg2png(
        bytestring=overlay_svg.encode("utf-8"),
        output_width=TEMPLATE_SIZE,
        output_height=TEMPLATE_SIZE,
    )
    overlay = Image.open(io.BytesIO(overlay_png)).convert("RGBA")

    # Create the composited result
    result = Image.new("RGBA", (TEMPLATE_SIZE, TEMPLATE_SIZE), (0, 0, 0, 0))

    # Place processed image into the image-region
    _place_image_in_region(result, processed_image, region, subject_scale)

    # Composite overlay on top
    result = Image.alpha_composite(result, overlay)

    return result


def _place_image_in_region(
    canvas: Image.Image,
    processed: Image.Image,
    region: dict,
    scale: float,
) -> None:
    """Place the processed image into the image-region, clipped to its shape.

    processed: grayscale (L mode) image where dark = ink marks
    """
    if region["type"] == "rect":
        x, y = int(region["x"]), int(region["y"])
        w, h = int(region["width"]), int(region["height"])
        rx = int(region.get("rx", 0))
    elif region["type"] == "ellipse":
        cx, cy = region["cx"], region["cy"]
        rx_e, ry_e = region["rx"], region["ry"]
        x = int(cx - rx_e)
        y = int(cy - ry_e)
        w = int(rx_e * 2)
        h = int(ry_e * 2)
        rx = 0  # not used for ellipse clip
    else:
        return

    # Scale the processed image to cover the region
    img = processed.copy()
    if img.mode != "L":
        img = img.convert("L")

    # Object-fit: cover — scale to fill, crop overflow
    src_w, src_h = img.size
    region_aspect = w / h
    src_aspect = src_w / src_h

    if src_aspect > region_aspect:
        # Source is wider — fit height, crop width
        new_h = h
        new_w = int(src_w * (h / src_h))
    else:
        # Source is taller — fit width, crop height
        new_w = w
        new_h = int(src_h * (w / src_w))

    # Apply subject_scale
    scaled_w = int(new_w * scale / 0.5)  # normalize: scale=0.5 means 1:1 fill
    scaled_h = int(new_h * scale / 0.5)
    scaled_w = max(scaled_w, 1)
    scaled_h = max(scaled_h, 1)

    img = img.resize((scaled_w, scaled_h), Image.LANCZOS)

    # Center crop to region size
    left = (scaled_w - w) // 2
    top = (scaled_h - h) // 2
    # Ensure we don't go negative
    left = max(0, left)
    top = max(0, top)

    # Create region-sized image
    region_img = Image.new("L", (w, h), 255)
    paste_x = max(0, (w - scaled_w) // 2)
    paste_y = max(0, (h - scaled_h) // 2)
    region_img.paste(img, (paste_x - left, paste_y - top))

    # Convert to RGBA: dark pixels become black with alpha, white becomes transparent
    region_rgba = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    arr = np.array(region_img)
    alpha = 255 - arr  # dark pixels → high alpha
    rgba_arr = np.zeros((h, w, 4), dtype=np.uint8)
    rgba_arr[:, :, 3] = alpha  # black ink with varying alpha

    # Create clip mask
    clip_mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(clip_mask)
    if region["type"] == "ellipse":
        draw.ellipse([0, 0, w - 1, h - 1], fill=255)
    elif region["type"] == "rect" and rx > 0:
        draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=rx, fill=255)
    else:
        draw.rectangle([0, 0, w - 1, h - 1], fill=255)

    # Apply clip mask to alpha
    clip_arr = np.array(clip_mask)
    rgba_arr[:, :, 3] = np.minimum(rgba_arr[:, :, 3], clip_arr)

    region_rgba = Image.fromarray(rgba_arr, "RGBA")
    canvas.paste(region_rgba, (x, y), region_rgba)
```

**Step 3: Run tests**

```bash
python -m pytest tests/test_composition_new.py -v
```

**Step 4: Commit**

```bash
git add src/composition.py tests/test_composition_new.py
git commit -m "feat: rewrite composition module for SVG template-based compositing"
```

---

### Task 5: Modify Ink Effects

**Files:**
- Modify: `src/ink_effect.py` (remove `colorize` function, lines 53-68)

**Step 1: Remove the colorize function**

Delete the `colorize()` function (lines 53-68). It's no longer needed — ink is always black, and the composition already outputs black marks on transparent.

Update `apply_ink_texture()` to work on RGBA images with black ink (no color parameter).

Keep `apply_stamp_roughness()`, `apply_ink_texture()`, `apply_wear()`, `apply_edge_bleed()` — they all operate on the alpha channel and work fine with black ink.

**Step 2: Run ink effect tests**

```bash
python -m pytest tests/test_ink_effect.py -v
```

Fix any tests that reference colorize or color parameters.

**Step 3: Commit**

```bash
git add src/ink_effect.py
git commit -m "refactor: remove colorize from ink effects, ink is always black"
```

---

### Task 6: Update Stamp Generator Pipeline

**Files:**
- Modify: `src/stamp_generator.py`

**Step 1: Rewrite generate_stamp()**

Replace the pipeline (lines 35-94) with the new flow:

```python
# src/stamp_generator.py
"""Main stamp generation pipeline."""

from dataclasses import dataclass
from PIL import Image
from src.lineart import extract_lineart
from src.cleanup import threshold_image, remove_noise, auto_crop, adjust_line_thickness
from src.composition import compose_stamp
from src.ink_effect import apply_stamp_roughness, apply_ink_texture, apply_wear, apply_edge_bleed


@dataclass
class StampConfig:
    shape: str = "oval"
    date_enabled: bool = False
    date_layout: int = 1
    date_start: str = ""
    date_end: str = ""
    ink_density: float = 0.50
    wear: float = 0.30
    edge_bleed: float = 0.20
    line_thickness: int = 2
    subject_scale: float = 0.50
    threshold_level: int = 75
    edge_strength: float = 0.70
    black_point: int = 0
    white_point: int = 255
    invert: bool = False
    canvas_width: int = 1080
    canvas_height: int = 1080


def generate_stamp(image: Image.Image, config: StampConfig) -> Image.Image:
    """Generate a brand logo stamp from an uploaded image.

    Pipeline:
    1. Extract line art (B&W processing)
    2. Cleanup (threshold, denoise, crop, line thickness)
    3. Compose into SVG layout template
    4. Apply ink & aging effects
    5. Scale to output dimensions
    """
    # 1. Line art extraction
    lineart = extract_lineart(
        image,
        threshold_level=config.threshold_level,
        edge_strength=config.edge_strength,
        black_point=config.black_point,
        white_point=config.white_point,
        invert=config.invert,
    )

    # 2. Cleanup
    cleaned = threshold_image(lineart)
    cleaned = remove_noise(cleaned)
    cleaned = auto_crop(cleaned)
    cleaned = adjust_line_thickness(cleaned, config.line_thickness)

    # 3. Compose into layout template
    composed = compose_stamp(
        processed_image=cleaned,
        shape=config.shape,
        date_enabled=config.date_enabled,
        date_layout=config.date_layout,
        date_start=config.date_start,
        date_end=config.date_end,
        subject_scale=config.subject_scale,
    )

    # 4. Ink & aging effects (always active)
    result = apply_stamp_roughness(composed)
    result = apply_ink_texture(result, density=config.ink_density)
    result = apply_wear(result, amount=config.wear)
    result = apply_edge_bleed(result, amount=config.edge_bleed)

    # 5. Scale to output dimensions
    out_w, out_h = config.canvas_width, config.canvas_height
    if (out_w, out_h) != result.size:
        result = result.resize((out_w, out_h), Image.LANCZOS)

    return result
```

**Step 2: Update the generate endpoint in routers/stamp.py**

Update the config mapping to match the new StampConfig fields. Remove all references to removed fields.

**Step 3: Run tests**

```bash
python -m pytest tests/ -v
```

**Step 4: Commit**

```bash
git add src/stamp_generator.py src/routers/stamp.py
git commit -m "feat: update stamp pipeline for SVG template composition"
```

---

### Task 7: Delete Dead Code

**Files:**
- Delete: `src/text_renderer.py`
- Modify: any imports that reference it

**Step 1: Remove text_renderer.py**

```bash
rm src/text_renderer.py
```

**Step 2: Remove any imports of text_renderer**

Search for and remove any `from src.text_renderer import ...` lines.

**Step 3: Remove old test files that test removed functionality**

Update `tests/test_text_renderer.py` (delete if it exists) and any tests referencing color presets, text rendering, old shape/border system.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove text_renderer and dead code"
```

---

### Task 8: Frontend HTML — New Editor Shell

**Files:**
- Rewrite: `static/index.html`

**Step 1: Write the new HTML**

The new editor has:
- `#ECECEA` background page
- Large centered white canvas (rounded corners, shadow) for live preview
- Right-side floating icon rail (white pill) with 4 icons
- 4 floating panel cards (one visible at a time)

Key HTML structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WANDERQUEST</title>
    <style>/* see step 2 */</style>
</head>
<body>
    <!-- Canvas / Preview -->
    <div class="canvas-area">
        <div class="canvas-frame" id="canvasFrame">
            <img id="preview" src="" alt="Preview" style="display:none;">
            <div id="placeholder" class="placeholder">
                <!-- Inline the logo SVG or reference it -->
            </div>
        </div>
    </div>

    <!-- Right Icon Rail -->
    <div class="icon-rail">
        <button class="rail-btn" data-panel="ratio" id="ratioBtn">
            <span class="ratio-label" id="ratioLabel">1:1</span>
        </button>
        <button class="rail-btn" data-panel="image" id="imageBtn">
            <!-- image icon SVG -->
        </button>
        <button class="rail-btn" data-panel="ink" id="inkBtn">
            <!-- stamp icon SVG -->
        </button>
        <button class="rail-btn active-dark" data-panel="export" id="exportBtn">
            <!-- export icon SVG -->
        </button>
    </div>

    <!-- Panels -->
    <div class="panel" id="ratioPanel"><!-- Ratio controls --></div>
    <div class="panel" id="imagePanel"><!-- Image controls --></div>
    <div class="panel" id="inkPanel"><!-- Ink & Aging controls --></div>
    <div class="panel" id="exportPanel"><!-- Export button --></div>

    <script src="/static/app.js"></script>
</body>
</html>
```

**Step 2: Style with design tokens**

CSS should use these tokens from the mockups:
- Page: `background: #ECECEA`
- Canvas frame: `background: white; border-radius: 52px; box-shadow: 0 2px 20px rgba(0,0,0,0.08)`
- Rail: `background: white; border-radius: 28px; width: 56px`
- Panels: `background: white; border-radius: 20px; border: 1px solid #E2E2DC; box-shadow: 0 10px 28px rgba(0,0,0,0.1)`
- Active selection: `#3B6FF5`
- Text: `#2A2A27` primary, `#62625C` secondary
- Dark button (export): `background: #2A2A27; border-radius: 13px`
- Slider track: `background: #F1F1EC`, fill `#E2E2DC`
- Font: system sans-serif (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)

**Panel contents:**

**Ratio Panel:** 4 circle buttons (16:9, 9:16, 1:1, 4:3), WIDTH/HEIGHT slider inputs, dimension readout.

**Image Panel:** Upload dropzone, shape selector (3 segmented pills: oval/rectangle/square), Image Settings section (threshold, edges, black point, white point, invert toggle, line thickness, subject scale), Date section (toggle + range inputs + layout selector 1/2).

**Ink & Aging Panel:** 3 sliders (ink density, wear, edge bleed). No toggle — always active.

**Export Panel:** Single "Download PNG" button.

**Step 3: Commit**

```bash
git add static/index.html
git commit -m "feat: new minimalist editor UI with icon rail and floating panels"
```

---

### Task 9: Frontend JS — Panel System & Controls

**Files:**
- Rewrite: `static/app.js`

**Step 1: Write the new app.js**

Key responsibilities:
- Panel toggle logic (one panel open at a time, anchored to rail)
- File upload (drag-drop + file picker) → POST /api/upload
- Control bindings with debounced generation
- Shape selector + date controls
- Generate request → POST /api/generate → preview update
- Download PNG
- Ratio presets + custom dimensions

Core structure:

```javascript
// State
let imageId = null;
let currentBlobUrl = null;
let activePanel = null;

// Panel toggle
document.querySelectorAll('.rail-btn').forEach(btn => {
    btn.addEventListener('click', () => togglePanel(btn.dataset.panel));
});

function togglePanel(panelName) {
    // Close current, open new (or close if same)
}

// Upload
async function uploadImage(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    imageId = data.image_id;
    generateStamp();
}

// Config gathering
function getConfig() {
    return {
        image_id: imageId,
        shape: document.querySelector('.shape-btn.active')?.dataset.shape || 'oval',
        date_enabled: document.getElementById('dateToggle')?.checked || false,
        date_layout: parseInt(document.querySelector('.date-layout-btn.active')?.dataset.layout || '1'),
        date_start: document.getElementById('dateStart')?.value || '',
        date_end: document.getElementById('dateEnd')?.value || '',
        threshold_level: parseInt(document.getElementById('threshold')?.value || '75'),
        edge_strength: parseFloat(document.getElementById('edges')?.value || '0.70'),
        black_point: parseInt(document.getElementById('blackPoint')?.value || '0'),
        white_point: parseInt(document.getElementById('whitePoint')?.value || '255'),
        invert: document.getElementById('invert')?.checked || false,
        line_thickness: parseInt(document.getElementById('lineThickness')?.value || '2'),
        subject_scale: parseFloat(document.getElementById('subjectScale')?.value || '0.50'),
        ink_density: parseFloat(document.getElementById('inkDensity')?.value || '0.50'),
        wear: parseFloat(document.getElementById('wear')?.value || '0.30'),
        edge_bleed: parseFloat(document.getElementById('edgeBleed')?.value || '0.20'),
        canvas_width: parseInt(document.getElementById('canvasWidth')?.value || '1080'),
        canvas_height: parseInt(document.getElementById('canvasHeight')?.value || '1080'),
    };
}

// Generate
async function generateStamp() {
    if (!imageId) return;
    const config = getConfig();
    const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
    const blob = await res.blob();
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = URL.createObjectURL(blob);
    document.getElementById('preview').src = currentBlobUrl;
    document.getElementById('preview').style.display = 'block';
    document.getElementById('placeholder').style.display = 'none';
}

// Debounce
function debounce(fn, ms = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
const debouncedGenerate = debounce(generateStamp);

// Download
function downloadStamp() {
    if (!currentBlobUrl) return;
    const a = document.createElement('a');
    a.href = currentBlobUrl;
    a.download = 'wanderquest-stamp.png';
    a.click();
}

// Ratio presets
function setRatio(w, h, label) {
    document.getElementById('canvasWidth').value = w;
    document.getElementById('canvasHeight').value = h;
    document.getElementById('ratioLabel').textContent = label;
    // Update slider positions
    debouncedGenerate();
}

// Wire up all controls with debounced regeneration
// ... (event listeners for all sliders, selects, toggles)
```

**Step 2: Wire event listeners**

- Sliders/text inputs → `debouncedGenerate()`
- Shape buttons, date toggle, invert toggle → `generateStamp()` (immediate)
- Ratio buttons → `setRatio()` with preset dimensions
- Upload zone → drag-drop + click handlers
- Download button → `downloadStamp()`

**Step 3: Commit**

```bash
git add static/app.js
git commit -m "feat: new frontend JS with panel system, controls, and generation"
```

---

### Task 10: Integration Testing & Polish

**Files:**
- All modified files
- Modify: `tests/` (update broken tests)

**Step 1: Start the server and test manually**

```bash
cd /Users/macbookpro/code/wanderquest
python -m uvicorn src.main:app --reload --port 8000
```

Open http://localhost:8000 and verify:
- [ ] Page loads with neutral editor UI
- [ ] Logo appears in canvas on load
- [ ] Icon rail visible on right side
- [ ] Panels open/close correctly
- [ ] Can upload an image
- [ ] Image processes and appears in oval frame with logo
- [ ] Shape selector (oval/rect/square) works
- [ ] B&W settings work (threshold, edges, etc.)
- [ ] Date toggle works, layout 1/2 switches
- [ ] Ink & Aging sliders affect output
- [ ] Ratio presets change canvas dimensions
- [ ] Download produces transparent PNG

**Step 2: Fix any issues found**

Common issues to watch for:
- cairosvg font rendering (may need system fonts or font config)
- SVG namespace handling in ElementTree
- Ellipse path parsing edge cases
- Image scaling/clipping alignment

**Step 3: Update/fix broken tests**

```bash
python -m pytest tests/ -v
```

Fix any remaining test failures from the refactoring.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete brand configurator redesign with SVG templates and new UI"
```

---

## Task Dependency Graph

```
Task 1 (Assets) ─────────────────────────────┐
Task 2 (Models) ──────┐                      │
Task 3 (SVG Loader) ──┼── Task 4 (Composition)──┐
Task 5 (Ink Effects) ──┘                         ├── Task 6 (Pipeline)
Task 7 (Dead Code) ─────────────────────────────┘      │
Task 8 (HTML) ─── Task 9 (JS) ──────────────────────── Task 10 (Integration)
```

**Parallelizable:** Tasks 1+2+5+7 can run in parallel. Tasks 3→4 are sequential. Tasks 8→9 are sequential. Task 6 depends on 2+4+5. Task 10 depends on everything.
