from __future__ import annotations
from PIL import Image
from src.lineart import extract_lineart
from src.cleanup import threshold_image, remove_noise, auto_crop, adjust_line_thickness
from src.composition import compose_stamp
from src.ink_effect import apply_stamp_roughness, apply_ink_texture, apply_wear, apply_edge_bleed
from dataclasses import dataclass


@dataclass
class StampConfig:
    shape: str = "oval"                   # oval, rect, square
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


def generate_stamp(image_bytes: bytes, config: StampConfig) -> Image.Image:
    """Generate a brand logo stamp from an uploaded image.

    Pipeline: lineart → cleanup → SVG template compose → ink effects → scale
    """
    # Stage 1: Line art extraction
    lineart = extract_lineart(
        image_bytes, config.threshold_level, config.edge_strength,
        config.black_point, config.white_point, config.invert,
    )

    # Stage 2: Cleanup
    lineart = threshold_image(lineart)
    lineart = remove_noise(lineart)
    lineart = auto_crop(lineart)
    lineart = adjust_line_thickness(lineart, config.line_thickness)

    # Stage 3: Compose into SVG layout template
    composed = compose_stamp(
        processed_image=lineart,
        shape=config.shape,
        date_enabled=config.date_enabled,
        date_layout=config.date_layout,
        date_start=config.date_start,
        date_end=config.date_end,
        subject_scale=config.subject_scale,
    )

    # Stage 4: Ink & aging effects (always active)
    composed = apply_stamp_roughness(composed, config.wear)
    composed = apply_ink_texture(composed, config.ink_density)
    composed = apply_wear(composed, config.wear)
    composed = apply_edge_bleed(composed, config.edge_bleed)

    # Stage 5: Scale to output dimensions
    out_w, out_h = config.canvas_width, config.canvas_height
    if (out_w, out_h) != composed.size:
        composed = composed.resize((out_w, out_h), Image.LANCZOS)

    return composed
