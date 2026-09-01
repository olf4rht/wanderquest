"""SVG template loader with region parsing and date text updates.

Loads the 9 layout SVGs (3 shapes x 3 date modes) from static/assets/layouts/,
extracts the image-region geometry, and supports modifying date text and
preparing templates for compositing.
"""

from __future__ import annotations

import os
import re
import xml.etree.ElementTree as ET
from typing import Optional

# Register SVG namespace so serialization doesn't add ns0: prefixes
ET.register_namespace("", "http://www.w3.org/2000/svg")

SVG_NS = "http://www.w3.org/2000/svg"

# Base directory for layout SVG files
_LAYOUTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "static", "assets", "layouts",
)


def get_template_key(shape: str, date_enabled: bool, date_layout: int = 0) -> str:
    """Map shape x date_mode to template filename (without .svg).

    Args:
        shape: One of "oval", "rect", "square".
        date_enabled: Whether date display is on.
        date_layout: 1 or 2 when date_enabled is True; ignored otherwise.

    Returns:
        Template key string, e.g. "oval_shape_image" or "date_layout_1_rect_shape".
    """
    if not date_enabled:
        return f"{shape}_shape_image"
    return f"date_layout_{date_layout}_{shape}_shape"


def load_template(key: str) -> str:
    """Load an SVG template file and return its raw content.

    Args:
        key: Template key from get_template_key().

    Returns:
        Raw SVG string.

    Raises:
        FileNotFoundError: If the template file doesn't exist.
    """
    path = os.path.join(_LAYOUTS_DIR, f"{key}.svg")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _find_element_by_id(root: ET.Element, target_id: str) -> Optional[ET.Element]:
    """Find an element anywhere in the tree by its id attribute."""
    for elem in root.iter():
        if elem.get("id") == target_id:
            return elem
    return None


def _find_group_by_id(root: ET.Element, target_id: str) -> Optional[ET.Element]:
    """Find a group (g) element by its id, searching all elements."""
    for elem in root.iter():
        if elem.get("id") == target_id:
            return elem
    return None


def _extract_numbers_from_path(d: str) -> list[float]:
    """Extract all numeric values from an SVG path d attribute."""
    return [float(x) for x in re.findall(r"-?\d+\.?\d*", d)]


def get_image_region(svg_content: str) -> dict:
    """Extract geometry of the image-region element from SVG content.

    For rect elements returns:
        {"type": "rect", "x": float, "y": float, "width": float, "height": float, "rx": float}

    For path elements (oval/ellipse) returns:
        {"type": "ellipse", "cx": float, "cy": float, "rx": float, "ry": float}
    """
    root = ET.fromstring(svg_content)
    elem = _find_element_by_id(root, "image-region")
    if elem is None:
        raise ValueError("No element with id='image-region' found in SVG")

    # Strip namespace prefix for tag comparison
    tag = elem.tag
    if "}" in tag:
        tag = tag.split("}", 1)[1]

    if tag == "rect":
        return {
            "type": "rect",
            "x": float(elem.get("x", "0")),
            "y": float(elem.get("y", "0")),
            "width": float(elem.get("width", "0")),
            "height": float(elem.get("height", "0")),
            "rx": float(elem.get("rx", "0")),
        }
    elif tag == "path":
        d = elem.get("d", "")
        numbers = _extract_numbers_from_path(d)
        # Path coordinates come in x,y pairs (and control points).
        # Extract all x coords (even indices) and y coords (odd indices).
        xs = numbers[0::2]
        ys = numbers[1::2]
        min_x = min(xs)
        max_x = max(xs)
        min_y = min(ys)
        max_y = max(ys)
        cx = (min_x + max_x) / 2.0
        cy = (min_y + max_y) / 2.0
        rx = (max_x - min_x) / 2.0
        ry = (max_y - min_y) / 2.0
        return {
            "type": "ellipse",
            "cx": cx,
            "cy": cy,
            "rx": rx,
            "ry": ry,
        }
    else:
        raise ValueError(f"Unexpected image-region element type: {tag}")


def prepare_template_svg(svg_content: str) -> str:
    """Prepare SVG template for compositing.

    - Sets image-region fill to "none" (transparent).
    - Sets the background rect (1080x1080) fill to "none".

    Returns:
        Modified SVG string.
    """
    root = ET.fromstring(svg_content)

    # Make image-region transparent
    img_region = _find_element_by_id(root, "image-region")
    if img_region is not None:
        img_region.set("fill", "none")

    # Make background rect transparent (the full-size rect with fill="white")
    for elem in root.iter():
        tag = elem.tag
        if "}" in tag:
            tag = tag.split("}", 1)[1]
        if tag == "rect" and elem.get("width") == "1080" and elem.get("height") == "1080":
            if elem.get("fill") == "white":
                elem.set("fill", "none")

    return ET.tostring(root, encoding="unicode", xml_declaration=False)


def update_date_text(svg_content: str, date_start: str, date_end: str) -> str:
    """Update date text in layout 1 SVGs.

    Args:
        svg_content: Raw SVG string of a date_layout_1 template.
        date_start: Start date in "DD.MM.YYYY" format.
        date_end: End date in "DD.MM.YYYY" format.

    Returns:
        Modified SVG string with updated date tspan values.
    """
    root = ET.fromstring(svg_content)

    def _parse_date(date_str: str) -> list[str]:
        parts = date_str.split(".")
        dd = parts[0]
        mm = parts[1]
        yy = parts[2][-2:]  # last 2 digits of year
        return [dd, mm, yy]

    def _update_group_tspans(root: ET.Element, group_id: str, values: list[str]):
        group = _find_group_by_id(root, group_id)
        if group is None:
            return
        # Find all tspan elements within this group
        tspans = []
        for elem in group.iter():
            tag = elem.tag
            if "}" in tag:
                tag = tag.split("}", 1)[1]
            if tag == "tspan":
                tspans.append(elem)
        # Update text values: DD, MM, YY
        for i, tspan in enumerate(tspans):
            if i < len(values):
                tspan.text = values[i]

    start_values = _parse_date(date_start)
    end_values = _parse_date(date_end)

    _update_group_tspans(root, "date-start", start_values)
    _update_group_tspans(root, "date-end", end_values)

    return ET.tostring(root, encoding="unicode", xml_declaration=False)
