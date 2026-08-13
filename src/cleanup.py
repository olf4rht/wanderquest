from __future__ import annotations
import cv2
import numpy as np
from PIL import Image


def threshold_image(img: Image.Image, threshold: int = 128) -> Image.Image:
    arr = np.array(img)
    _, binary = cv2.threshold(arr, threshold, 255, cv2.THRESH_BINARY)
    return Image.fromarray(binary, mode="L")


def remove_noise(img: Image.Image, kernel_size: int = 3) -> Image.Image:
    arr = np.array(img)
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    # Open operation removes small noise
    cleaned = cv2.morphologyEx(arr, cv2.MORPH_OPEN, kernel)
    return Image.fromarray(cleaned, mode="L")


def auto_crop(img: Image.Image, padding: int = 20) -> Image.Image:
    arr = np.array(img)
    # Find bounding box of non-white pixels
    coords = np.argwhere(arr < 128)
    if len(coords) == 0:
        return img
    y_min, x_min = coords.min(axis=0)
    y_max, x_max = coords.max(axis=0)
    # Add padding
    h, w = arr.shape
    y_min = max(0, y_min - padding)
    x_min = max(0, x_min - padding)
    y_max = min(h, y_max + padding)
    x_max = min(w, x_max + padding)
    return img.crop((x_min, y_min, x_max, y_max))


def adjust_line_thickness(img: Image.Image, thickness: int = 1) -> Image.Image:
    if thickness == 1:
        return img
    arr = np.array(img)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (thickness, thickness))
    if thickness > 1:
        # Dilate black lines (erode white = dilate inverted)
        inverted = cv2.bitwise_not(arr)
        dilated = cv2.dilate(inverted, kernel, iterations=1)
        result = cv2.bitwise_not(dilated)
    else:
        result = arr
    return Image.fromarray(result, mode="L")
