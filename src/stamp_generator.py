from __future__ import annotations
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
