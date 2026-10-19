from __future__ import annotations
import hashlib
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
    image_scale: float = 1.0
    color_mode: str = "unicolor"
    color_latin: str = "#000000"
    color_arabic: str = "#000000"
    color_arabic_stroke: str = "#000000"
    color_image: str = "#000000"
    color_image_stroke: str = "#000000"
    color_image_bg: str = "transparent"
    threshold_level: int = 75
    edge_strength: float = 0.70
    black_point: int = 0
    white_point: int = 255
    invert: bool = False
    canvas_width: int = 1080
    canvas_height: int = 1080
    logo_variant: int = 1


# ---------------------------------------------------------------------------
# Pipeline cache — avoids re-running expensive stages when only later
# parameters change (e.g. tweaking ink_density shouldn't redo lineart).
#
# Two cache slots:
#   _cleanup_cache: output of stages 1-2 (lineart + cleanup)
#   _compose_cache: output of stage 3 (SVG composition)
# Each slot stores (key, Image) where key is a hash of the parameters
# that affect that stage.  Only the most recent result is kept.
# ---------------------------------------------------------------------------
_cleanup_cache: tuple[str, Image.Image] | None = None
_compose_cache: tuple[str, Image.Image] | None = None
_final_cache: tuple[str, Image.Image] | None = None


def _make_key(*parts) -> str:
    return hashlib.sha256(repr(parts).encode()).hexdigest()


def generate_stamp(image_bytes: bytes, config: StampConfig) -> Image.Image:
    """Generate a brand logo stamp from an uploaded image.

    Pipeline: lineart → cleanup → SVG template compose → ink effects → scale

    Intermediate results are cached so that changing only late-stage
    parameters (ink, wear, bleed) skips the expensive early stages.
    """
    global _cleanup_cache, _compose_cache, _final_cache

    # --- Full result cache: skip everything if exact same config ---
    image_hash = hashlib.sha256(image_bytes).hexdigest()
    final_key = _make_key(
        image_hash,
        config.threshold_level, config.edge_strength,
        config.black_point, config.white_point, config.invert,
        config.line_thickness, config.shape, config.date_enabled,
        config.date_layout, config.date_start, config.date_end,
        config.subject_scale, config.image_scale, config.ink_density, config.wear,
        config.edge_bleed, config.canvas_width, config.canvas_height,
        config.logo_variant, config.color_mode, config.color_latin,
        config.color_arabic, config.color_arabic_stroke,
        config.color_image, config.color_image_stroke, config.color_image_bg,
    )
    if _final_cache and _final_cache[0] == final_key:
        return _final_cache[1].copy()

    # --- Cache key for stages 1-2 (lineart + cleanup) ---
    cleanup_key = _make_key(
        image_hash,
        config.threshold_level, config.edge_strength,
        config.black_point, config.white_point, config.invert,
        config.line_thickness,
    )

    if _cleanup_cache and _cleanup_cache[0] == cleanup_key:
        lineart = _cleanup_cache[1]
    else:
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
        _cleanup_cache = (cleanup_key, lineart)
        # Invalidate compose cache when lineart changes
        _compose_cache = None

    # --- Cache key for stage 3 (composition) ---
    compose_key = _make_key(
        cleanup_key,
        config.shape, config.date_enabled, config.date_layout,
        config.date_start, config.date_end, config.subject_scale, config.image_scale,
        config.logo_variant, config.color_mode, config.color_latin,
        config.color_arabic, config.color_arabic_stroke,
        config.color_image, config.color_image_stroke, config.color_image_bg,
    )

    if _compose_cache and _compose_cache[0] == compose_key:
        composed = _compose_cache[1].copy()
    else:
        # Stage 3: Compose into SVG layout template
        composed = compose_stamp(
            processed_image=lineart,
            shape=config.shape,
            date_enabled=config.date_enabled,
            date_layout=config.date_layout,
            date_start=config.date_start,
            date_end=config.date_end,
            subject_scale=config.subject_scale,
            image_scale=config.image_scale,
            logo_variant=config.logo_variant,
            color_mode=config.color_mode,
            color_latin=config.color_latin,
            color_arabic=config.color_arabic,
            color_arabic_stroke=config.color_arabic_stroke,
            color_image=config.color_image,
            color_image_stroke=config.color_image_stroke,
            color_image_bg=config.color_image_bg,
        )
        _compose_cache = (compose_key, composed.copy())

    # Stage 4: Ink & aging effects (always active, fast enough to run each time)
    composed = apply_stamp_roughness(composed, config.wear)
    composed = apply_ink_texture(composed, config.ink_density)
    composed = apply_wear(composed, config.wear)
    composed = apply_edge_bleed(composed, config.edge_bleed)

    # Stage 5: Fit into output canvas (no distortion)
    out_w, out_h = config.canvas_width, config.canvas_height
    if (out_w, out_h) != composed.size:
        # Scale to fit within canvas, preserving aspect ratio
        src_w, src_h = composed.size
        scale = min(out_w / src_w, out_h / src_h)
        new_w = round(src_w * scale)
        new_h = round(src_h * scale)
        scaled = composed.resize((new_w, new_h), Image.LANCZOS)

        # Center on transparent canvas
        canvas = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
        x = (out_w - new_w) // 2
        y = (out_h - new_h) // 2
        canvas.paste(scaled, (x, y), scaled)
        composed = canvas

    _final_cache = (final_key, composed.copy())
    return composed
