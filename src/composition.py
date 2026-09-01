"""SVG template-based stamp composition.

Composes a processed B&W image into an SVG layout template,
rendering the final 1080x1080 RGBA stamp.
"""

from __future__ import annotations

import io
import os

import cairosvg
import numpy as np
from PIL import Image, ImageDraw

from src.svg_template import (
    get_image_region,
    get_template_key,
    load_template,
    prepare_template_svg,
    update_date_text,
)

# Ensure cairosvg can find the cairo library on macOS (Homebrew)
os.environ.setdefault("DYLD_FALLBACK_LIBRARY_PATH", "/opt/homebrew/lib")

CANVAS_SIZE = 1080


def compose_stamp(
    processed_image: Image.Image,
    shape: str,
    date_enabled: bool,
    date_layout: int,
    date_start: str,
    date_end: str,
    subject_scale: float,
) -> Image.Image:
    """Compose a processed grayscale image into an SVG stamp template.

    Args:
        processed_image: Grayscale (L mode) image where dark pixels = ink.
        shape: One of "oval", "rect", "square".
        date_enabled: Whether to show date text.
        date_layout: 1 or 2 (only used when date_enabled is True).
        date_start: Start date in "DD.MM.YYYY" format.
        date_end: End date in "DD.MM.YYYY" format.
        subject_scale: Scale factor for the subject image (0.2 - 0.9).
            At 0.5 the image fills the region 1:1.

    Returns:
        RGBA Image of size 1080x1080.
    """
    # 1. Get template key
    key = get_template_key(shape, date_enabled, date_layout)

    # 2. Load the SVG template
    svg_content = load_template(key)

    # 3. If date_enabled and layout 1, update date text
    if date_enabled and date_layout == 1 and date_start and date_end:
        svg_content = update_date_text(svg_content, date_start, date_end)

    # 4. Get image-region geometry
    region = get_image_region(svg_content)

    # 5. Prepare template SVG (make image-region and background transparent)
    overlay_svg = prepare_template_svg(svg_content)

    # 6. Render the prepared SVG to PNG via cairosvg
    overlay_png = cairosvg.svg2png(
        bytestring=overlay_svg.encode("utf-8"),
        output_width=CANVAS_SIZE,
        output_height=CANVAS_SIZE,
    )
    overlay = Image.open(io.BytesIO(overlay_png)).convert("RGBA")

    # 7. Create transparent RGBA canvas
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))

    # 8. Place the processed image into the image-region
    _place_image_in_region(canvas, processed_image, region, subject_scale)

    # 9. Composite the SVG overlay on top
    canvas = Image.alpha_composite(canvas, overlay)

    # 10. Return result
    return canvas


def _place_image_in_region(
    canvas: Image.Image,
    subject: Image.Image,
    region: dict,
    subject_scale: float,
) -> None:
    """Place the processed grayscale image into the template image-region.

    Modifies `canvas` in-place by pasting the image clipped to the region shape.

    Args:
        canvas: The RGBA canvas to paste onto.
        subject: Grayscale (L mode) image, dark pixels = ink.
        region: Geometry dict from get_image_region().
        subject_scale: 0.2-0.9; at 0.5 the image fills the region exactly.
    """
    # Determine region bounding box
    if region["type"] == "ellipse":
        cx, cy = region["cx"], region["cy"]
        rx, ry = region["rx"], region["ry"]
        reg_x = cx - rx
        reg_y = cy - ry
        reg_w = rx * 2
        reg_h = ry * 2
    else:  # rect
        reg_x = region["x"]
        reg_y = region["y"]
        reg_w = region["width"]
        reg_h = region["height"]

    reg_x, reg_y = int(round(reg_x)), int(round(reg_y))
    reg_w, reg_h = int(round(reg_w)), int(round(reg_h))

    if reg_w <= 0 or reg_h <= 0:
        return

    # Scale subject to cover the region, adjusted by subject_scale.
    # subject_scale=0.5 → 1:1 cover; <0.5 → smaller; >0.5 → larger (more crop)
    scale_factor = subject_scale / 0.5  # normalize so 0.5 → 1.0

    src_w, src_h = subject.size
    # Compute cover scale (fill the region completely)
    cover_scale = max(reg_w / max(src_w, 1), reg_h / max(src_h, 1))
    final_scale = cover_scale * scale_factor

    new_w = max(1, int(round(src_w * final_scale)))
    new_h = max(1, int(round(src_h * final_scale)))

    try:
        resample = Image.LANCZOS
    except AttributeError:
        resample = Image.Resampling.LANCZOS

    resized = subject.resize((new_w, new_h), resample)

    # Center the resized image over the region
    offset_x = reg_x + (reg_w - new_w) // 2
    offset_y = reg_y + (reg_h - new_h) // 2

    # Convert grayscale to RGBA: dark pixels → black with proportional alpha, white → transparent
    arr = np.array(resized, dtype=np.uint8)
    alpha = 255 - arr  # dark → high alpha, white → 0
    rgba_arr = np.zeros((new_h, new_w, 4), dtype=np.uint8)
    # RGB stays 0 (black); alpha channel from darkness
    rgba_arr[:, :, 3] = alpha
    subject_rgba = Image.fromarray(rgba_arr, "RGBA")

    # Create clip mask for the region shape
    clip_mask = Image.new("L", (reg_w, reg_h), 0)
    draw = ImageDraw.Draw(clip_mask)

    if region["type"] == "ellipse":
        draw.ellipse([0, 0, reg_w - 1, reg_h - 1], fill=255)
    else:  # rect
        corner_radius = int(round(region.get("rx", 0)))
        if corner_radius > 0:
            draw.rounded_rectangle(
                [0, 0, reg_w - 1, reg_h - 1],
                radius=corner_radius,
                fill=255,
            )
        else:
            draw.rectangle([0, 0, reg_w - 1, reg_h - 1], fill=255)

    # Create a full-canvas-size image for the placed subject
    placed = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    placed.paste(subject_rgba, (offset_x, offset_y))

    # Create a full-canvas-size clip mask
    full_clip = Image.new("L", (CANVAS_SIZE, CANVAS_SIZE), 0)
    full_clip.paste(clip_mask, (reg_x, reg_y))

    # Apply clip mask to placed image alpha
    placed_arr = np.array(placed)
    clip_arr = np.array(full_clip)
    placed_arr[:, :, 3] = np.minimum(placed_arr[:, :, 3], clip_arr)
    clipped = Image.fromarray(placed_arr, "RGBA")

    # Composite onto canvas
    canvas.paste(Image.alpha_composite(canvas, clipped), (0, 0))
