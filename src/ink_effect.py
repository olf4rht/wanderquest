from __future__ import annotations
import cv2
import numpy as np
from PIL import Image, ImageFilter


def apply_stamp_roughness(img: Image.Image, intensity: float = 0.5) -> Image.Image:
    """Distress all linework to look hand-stamped. Adds edge roughness,
    small gaps, and uneven pressure to borders, text, and image alike."""
    arr = np.array(img)
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3].astype(np.float32)

    # 1. Edge roughness: erode/dilate with a noisy kernel to make edges irregular
    rng = np.random.RandomState(77)
    ink_binary = (alpha > 128).astype(np.uint8) * 255

    # Small random erosion to create gaps at edges
    kernel_size = max(2, int(2 + intensity * 2))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    eroded = cv2.erode(ink_binary, kernel, iterations=1)

    # Random noise mask — some eroded pixels stay, some don't
    noise = rng.rand(h, w)
    # Keep original where noise is above threshold (preserves most of the stamp)
    restore_mask = noise > (intensity * 0.4)
    roughened = np.where(restore_mask, ink_binary, eroded)

    # 2. Add fine-grain noise to simulate paper texture breaking through ink
    fine_noise = rng.rand(h, w)
    # Only knock out pixels that are ink AND where noise is very low
    knockout = fine_noise < (intensity * 0.08)
    roughened[knockout & (roughened > 128)] = 0

    # 3. Slight displacement to simulate uneven rubber contact
    displacement_strength = max(1, int(intensity * 3))
    dx = (rng.rand(h, w) * 2 - 1) * displacement_strength
    dy = (rng.rand(h, w) * 2 - 1) * displacement_strength
    # Apply displacement via remap
    map_x = np.clip(np.arange(w)[None, :] + dx, 0, w - 1).astype(np.float32)
    map_y = np.clip(np.arange(h)[:, None] + dy, 0, h - 1).astype(np.float32)
    roughened = cv2.remap(roughened, map_x, map_y, cv2.INTER_LINEAR)

    # Apply roughened alpha back
    result = arr.copy()
    # Blend: where ink was removed, reduce alpha
    new_alpha = np.minimum(alpha, roughened.astype(np.float32))
    result[:, :, 3] = new_alpha.clip(0, 255).astype(np.uint8)

    return Image.fromarray(result, mode="RGBA")


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
        small_h = h // scale + 1
        small_w = w // scale + 1
        small = np.random.RandomState(42).rand(small_h, small_w).astype(np.float32)
        # Convert to uint8 for Pillow compatibility, then resize
        small_uint8 = (small * 255).clip(0, 255).astype(np.uint8)
        try:
            resample = Image.Resampling.BILINEAR
        except AttributeError:
            resample = Image.BILINEAR
        resized = np.array(
            Image.fromarray(small_uint8, mode="L").resize((w, h), resample)
        ).astype(np.float32) / 255.0
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
