"""Tests for src/svg_template.py — SVG template loading, region parsing, and date updates."""

import xml.etree.ElementTree as ET

import pytest

from src.svg_template import (
    get_template_key,
    load_template,
    get_image_region,
    prepare_template_svg,
    update_date_text,
)


# ---------------------------------------------------------------------------
# get_template_key
# ---------------------------------------------------------------------------

class TestGetTemplateKey:
    """Test key generation for all 9 shape x date_mode combinations."""

    @pytest.mark.parametrize("shape,expected", [
        ("oval", "oval_shape_image"),
        ("rect", "rect_shape_image"),
        ("square", "square_shape_image"),
    ])
    def test_no_date(self, shape, expected):
        assert get_template_key(shape, date_enabled=False) == expected

    @pytest.mark.parametrize("shape,expected", [
        ("oval", "date_layout_1_oval_shape"),
        ("rect", "date_layout_1_rect_shape"),
        ("square", "date_layout_1_square_shape"),
    ])
    def test_date_layout_1(self, shape, expected):
        assert get_template_key(shape, date_enabled=True, date_layout=1) == expected

    @pytest.mark.parametrize("shape,expected", [
        ("oval", "date_layout_2_oval_shape"),
        ("rect", "date_layout_2_rect_shape"),
        ("square", "date_layout_2_square_shape"),
    ])
    def test_date_layout_2(self, shape, expected):
        assert get_template_key(shape, date_enabled=True, date_layout=2) == expected


# ---------------------------------------------------------------------------
# load_template
# ---------------------------------------------------------------------------

ALL_KEYS = [
    "oval_shape_image",
    "rect_shape_image",
    "square_shape_image",
    "date_layout_1_oval_shape",
    "date_layout_1_rect_shape",
    "date_layout_1_square_shape",
    "date_layout_2_oval_shape",
    "date_layout_2_rect_shape",
    "date_layout_2_square_shape",
]


class TestLoadTemplate:

    @pytest.mark.parametrize("key", ALL_KEYS)
    def test_loads_all_templates(self, key):
        content = load_template(key)
        assert isinstance(content, str)
        assert "<svg" in content
        assert "</svg>" in content

    def test_nonexistent_template_raises(self):
        with pytest.raises(FileNotFoundError):
            load_template("nonexistent_template")


# ---------------------------------------------------------------------------
# get_image_region
# ---------------------------------------------------------------------------

class TestGetImageRegion:

    def test_oval_returns_ellipse(self):
        svg = load_template("oval_shape_image")
        region = get_image_region(svg)
        assert region["type"] == "ellipse"
        # The oval path spans roughly x: 367..715, y: 342..512
        assert 350 < region["cx"] < 560
        assert 350 < region["cy"] < 520
        assert region["rx"] > 100
        assert region["ry"] > 50

    def test_rect_returns_rect(self):
        svg = load_template("rect_shape_image")
        region = get_image_region(svg)
        assert region["type"] == "rect"
        assert region["x"] == 353.0
        assert region["y"] == 330.0
        assert region["width"] == 375.0
        assert region["height"] == 194.0
        assert region["rx"] == 24.0

    def test_square_returns_rect(self):
        svg = load_template("square_shape_image")
        region = get_image_region(svg)
        assert region["type"] == "rect"
        assert region["x"] == 353.0
        assert region["y"] == 233.0
        assert region["width"] == 375.0
        assert region["height"] == 375.0
        assert region["rx"] == 23.0

    def test_date_layout_1_rect(self):
        svg = load_template("date_layout_1_rect_shape")
        region = get_image_region(svg)
        assert region["type"] == "rect"
        assert region["width"] == 376.001
        assert region["height"] == 194.0

    def test_date_layout_1_oval(self):
        svg = load_template("date_layout_1_oval_shape")
        region = get_image_region(svg)
        assert region["type"] == "ellipse"
        assert region["rx"] > 100
        assert region["ry"] > 50

    def test_date_layout_2_oval(self):
        svg = load_template("date_layout_2_oval_shape")
        region = get_image_region(svg)
        assert region["type"] == "ellipse"


# ---------------------------------------------------------------------------
# prepare_template_svg
# ---------------------------------------------------------------------------

class TestPrepareTemplateSvg:

    @pytest.mark.parametrize("key", ALL_KEYS)
    def test_image_region_transparent(self, key):
        svg = load_template(key)
        prepared = prepare_template_svg(svg)
        root = ET.fromstring(prepared)
        # Find image-region element
        for elem in root.iter():
            if elem.get("id") == "image-region":
                assert elem.get("fill") == "none", (
                    f"image-region fill should be 'none' in {key}"
                )
                break
        else:
            pytest.fail(f"No image-region found in prepared SVG for {key}")

    @pytest.mark.parametrize("key", ALL_KEYS)
    def test_background_transparent(self, key):
        svg = load_template(key)
        prepared = prepare_template_svg(svg)
        root = ET.fromstring(prepared)
        # Find the full-size background rect
        found_bg = False
        for elem in root.iter():
            tag = elem.tag
            if "}" in tag:
                tag = tag.split("}", 1)[1]
            if tag == "rect" and elem.get("width") == "1080" and elem.get("height") == "1080":
                assert elem.get("fill") == "none", (
                    f"Background rect fill should be 'none' in {key}"
                )
                found_bg = True
                break
        assert found_bg, f"No 1080x1080 background rect found in {key}"

    def test_preserves_other_elements(self):
        svg = load_template("rect_shape_image")
        prepared = prepare_template_svg(svg)
        # The brand logo paths should still be present
        assert "Layer_1" in prepared
        assert "Group 72" in prepared


# ---------------------------------------------------------------------------
# update_date_text
# ---------------------------------------------------------------------------

class TestUpdateDateText:

    def _get_tspan_texts(self, svg_str: str, group_id: str) -> list[str]:
        root = ET.fromstring(svg_str)
        for elem in root.iter():
            if elem.get("id") == group_id:
                tspans = []
                for sub in elem.iter():
                    tag = sub.tag
                    if "}" in tag:
                        tag = tag.split("}", 1)[1]
                    if tag == "tspan":
                        tspans.append(sub.text)
                return tspans
        return []

    def test_updates_start_date(self):
        svg = load_template("date_layout_1_oval_shape")
        updated = update_date_text(svg, "15.03.2025", "20.07.2026")
        tspans = self._get_tspan_texts(updated, "date-start")
        assert tspans == ["15", "03", "25"]

    def test_updates_end_date(self):
        svg = load_template("date_layout_1_oval_shape")
        updated = update_date_text(svg, "15.03.2025", "20.07.2026")
        tspans = self._get_tspan_texts(updated, "date-end")
        assert tspans == ["20", "07", "26"]

    def test_rect_layout_1_dates(self):
        svg = load_template("date_layout_1_rect_shape")
        updated = update_date_text(svg, "01.12.2024", "31.01.2025")
        start = self._get_tspan_texts(updated, "date-start")
        end = self._get_tspan_texts(updated, "date-end")
        assert start == ["01", "12", "24"]
        assert end == ["31", "01", "25"]

    def test_square_layout_1_dates(self):
        svg = load_template("date_layout_1_square_shape")
        updated = update_date_text(svg, "09.11.2023", "22.02.2024")
        start = self._get_tspan_texts(updated, "date-start")
        end = self._get_tspan_texts(updated, "date-end")
        assert start == ["09", "11", "23"]
        assert end == ["22", "02", "24"]

    def test_original_values_replaced(self):
        """Default values (05, 06, 27 / 08, 06, 27) should be gone after update."""
        svg = load_template("date_layout_1_oval_shape")
        updated = update_date_text(svg, "15.03.2025", "20.07.2026")
        # Original start DD was "05", should now be "15"
        start = self._get_tspan_texts(updated, "date-start")
        assert start[0] == "15"
        assert start[0] != "05"
