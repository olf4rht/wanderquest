from __future__ import annotations
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
    try:
        resample = Image.LANCZOS
    except AttributeError:
        try:
            resample = Image.Resampling.LANCZOS
        except AttributeError:
            resample = Image.ANTIALIAS
    subject_resized.thumbnail((target_size, target_size), resample)

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
