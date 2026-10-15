from __future__ import annotations
import cv2
import numpy as np
from PIL import Image, ImageFilter


# ---------------------------------------------------------------------------
# Precomputed noise cache — all noise uses fixed seeds so the arrays are
# identical every call for a given (h, w).  Generate once, reuse forever.
# ---------------------------------------------------------------------------
_noise_cache: dict[tuple[int, int], dict] = {}


def _get_noise(h: int, w: int) -> dict:
    """Return precomputed noise arrays for dimensions (h, w)."""
    key = (h, w)
    if key in _noise_cache:
        return _noise_cache[key]

    rng77 = np.random.RandomState(77)
    roughness_noise = rng77.rand(h, w)
    fine_noise = rng77.rand(h, w)
    disp_raw = rng77.rand(h, w)  # base for dx
    disp_raw2 = rng77.rand(h, w)  # base for dy

    # Ink texture: multi-octave Perlin-like noise
    try:
        resample = Image.Resampling.BILINEAR
    except AttributeError:
        resample = Image.BILINEAR
    ink_noise = np.zeros((h, w), dtype=np.float32)
    for scale in [4, 8, 16, 32]:
        small_h = h // scale + 1
        small_w = w // scale + 1
        small = np.random.RandomState(42).rand(small_h, small_w).astype(np.float32)
        small_uint8 = (small * 255).clip(0, 255).astype(np.uint8)
        resized = np.array(
            Image.fromarray(small_uint8, mode="L").resize((w, h), resample)
        ).astype(np.float32) / 255.0
        ink_noise += resized
    ink_noise = ink_noise / ink_noise.max()

    # Wear: fixed random pattern + blurred
    rng123 = np.random.RandomState(123)
    wear_raw = rng123.rand(h, w)

    _noise_cache[key] = {
        "roughness": roughness_noise,
        "fine": fine_noise,
        "disp_x": disp_raw,
        "disp_y": disp_raw2,
        "ink": ink_noise,
        "wear_raw": wear_raw,
        "col_idx": np.arange(w, dtype=np.float32),
        "row_idx": np.arange(h, dtype=np.float32),
    }
    return _noise_cache[key]


def apply_stamp_roughness(img: Image.Image, intensity: float = 0.5) -> Image.Image:
    """Distress all linework to look hand-stamped. Adds edge roughness,
    small gaps, and uneven pressure to borders, text, and image alike."""
    arr = np.array(img)
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3].astype(np.float32)
    nc = _get_noise(h, w)

    ink_binary = (alpha > 128).astype(np.uint8) * 255

    # Small random erosion to create gaps at edges
    kernel_size = max(2, int(2 + intensity * 2))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    eroded = cv2.erode(ink_binary, kernel, iterations=1)

    # Random noise mask — some eroded pixels stay, some don't
    restore_mask = nc["roughness"] > (intensity * 0.4)
    roughened = np.where(restore_mask, ink_binary, eroded)

    # Fine-grain noise to simulate paper texture breaking through ink
    knockout = nc["fine"] < (intensity * 0.08)
    roughened[knockout & (roughened > 128)] = 0

    # Slight displacement to simulate uneven rubber contact
    displacement_strength = max(1, int(intensity * 3))
    dx = (nc["disp_x"] * 2 - 1) * displacement_strength
    dy = (nc["disp_y"] * 2 - 1) * displacement_strength
    map_x = np.clip(nc["col_idx"][None, :] + dx, 0, w - 1).astype(np.float32)
    map_y = np.clip(nc["row_idx"][:, None] + dy, 0, h - 1).astype(np.float32)
    roughened = cv2.remap(roughened, map_x, map_y, cv2.INTER_LINEAR)

    result = arr.copy()
    new_alpha = np.minimum(alpha, roughened.astype(np.float32))
    result[:, :, 3] = new_alpha.clip(0, 255).astype(np.uint8)

    return Image.fromarray(result, mode="RGBA")


def apply_ink_texture(img: Image.Image, density: float = 0.5) -> Image.Image:
    """Add uneven ink coverage texture. density: 0.0 (light) to 1.0 (heavy)."""
    arr = np.array(img).astype(np.float32)
    h, w = arr.shape[:2]
    nc = _get_noise(h, w)

    ink_mask = arr[:, :, :3].mean(axis=2) < 200
    strength = 1.0 - density
    alpha_mod = 1.0 - (nc["ink"] * strength * 0.4)
    arr[:, :, 3] = arr[:, :, 3] * np.where(ink_mask, alpha_mod, 1.0)

    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), mode="RGBA")


def apply_wear(img: Image.Image, intensity: float = 0.3) -> Image.Image:
    """Add wear: random gaps in lines, faded spots. intensity: 0.0 (none) to 1.0 (heavy)."""
    arr = np.array(img).astype(np.float32)
    h, w = arr.shape[:2]
    nc = _get_noise(h, w)

    wear_mask = nc["wear_raw"] < (intensity * 0.15)

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

    arr_orig = np.array(img).astype(np.float32)
    arr_blur = np.array(blurred).astype(np.float32)
    blend = amount * 0.5
    result = arr_orig * (1.0 - blend) + arr_blur * blend

    return Image.fromarray(result.clip(0, 255).astype(np.uint8), mode="RGBA")
