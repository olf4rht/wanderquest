from __future__ import annotations
from PIL import Image
from src.lineart import extract_lineart
from src.cleanup import threshold_image, remove_noise, auto_crop, adjust_line_thickness
from src.composition import create_stamp_frame, place_image_in_frame
from src.ink_effect import apply_stamp_roughness, colorize, apply_ink_texture, apply_wear, apply_edge_bleed
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

    # Stage 4: Stamp roughness (distresses borders, text, and image equally)
    composed = apply_stamp_roughness(composed, config.wear)

    # Stage 5: Ink effects
    composed = colorize(composed, config.color)
    composed = apply_ink_texture(composed, config.ink_density)
    composed = apply_wear(composed, config.wear)
    composed = apply_edge_bleed(composed, config.edge_bleed)

    # Stage 6: Background
    if config.background == "white":
        bg = Image.new("RGBA", composed.size, (255, 255, 255, 255))
        bg = Image.alpha_composite(bg, composed)
        return bg.convert("RGB")

    return composed
