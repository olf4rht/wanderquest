from __future__ import annotations
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
        try:
            char_img = char_img.rotate(rotation, expand=True, resample=Image.Resampling.BICUBIC)
        except AttributeError:
            char_img = char_img.rotate(rotation, expand=True, resample=Image.BICUBIC)

        # Paste centered on position, with bounds checking
        paste_x = int(x - char_img.width // 2)
        paste_y = int(y - char_img.height // 2)

        # Clamp to non-negative to avoid alpha_composite errors
        paste_x = max(0, paste_x)
        paste_y = max(0, paste_y)

        # Only paste if within canvas bounds
        if paste_x < result.width and paste_y < result.height:
            result.alpha_composite(char_img, (paste_x, paste_y))

    return result
