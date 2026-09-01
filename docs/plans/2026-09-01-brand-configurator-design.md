# WANDERQUEST Brand Logo Configurator — Design Doc

## Purpose

Redesign the WANDERQUEST stamp generator into a brand-logo configurator for "Al Jidhr / الجذر". Users upload an image, pick a frame shape, tune B&W processing and ink aging, set canvas size, and export a transparent PNG. The brand logo and layouts are fixed SVG templates — the app composes into them.

## Architecture

**Keep**: Python/FastAPI backend for image processing. Vanilla JS frontend.

**Rewrite**: UI shell (new neutral editor), composition logic (SVG template-based), request model (simplified).

### Backend changes

| File | Action |
|------|--------|
| `src/lineart.py` | Keep — all B&W processing math |
| `src/cleanup.py` | Keep — threshold, denoise, crop, line thickness |
| `src/ink_effect.py` | Modify — remove colorization (always black), keep texture/wear/bleed/roughness |
| `src/composition.py` | Rewrite — SVG template compositing replaces frame drawing |
| `src/text_renderer.py` | Remove — no user text |
| `src/stamp_generator.py` | Modify — new pipeline: lineart → cleanup → template composite → ink effects |
| `src/routers/stamp.py` | Modify — simplified request model |

### Frontend changes

| File | Action |
|------|--------|
| `static/index.html` | Rewrite — new editor shell |
| `static/app.js` | Rewrite — new panel system, controls, preview |

## SVG Template System

9 templates in `static/assets/layouts/` = 3 shapes × 3 date modes:

| | Date OFF | Date Layout 1 | Date Layout 2 |
|---|---|---|---|
| **Oval** | oval_shape_image | date_layout_1_oval_shape | date_layout_2_oval_shape |
| **Rect** | rect_shape_image | date_layout_1_rect_shape | date_layout_2_rect_shape |
| **Square** | square_shape_image | date_layout_1_square_shape | date_layout_2_square_shape |

Selection: `shape` × `date mode` → pick template.

### Template structure (from SVGs)

All templates are 1080×1080 viewBox. Each contains:

- `id="image-region"` — ellipse path (oval) or rect (rect/square) with `fill="#D9D9D9"`. Defines where processed image goes + clip shape.
- Logo wordmark — baked as path outlines in the SVG.
- Frame outlines — e.g. oval has double stroke (6px inner + 2px outer).

**Image region geometry** (read from SVGs, not hardcoded):
- Oval: ellipse path ~(367,342)-(715,511), center ~(540,427)
- Rect: `<rect x="353" y="330" w="375" h="194" rx="24">`
- Square: `<rect x="353" y="233" w="375" h="375" rx="23">`

### Date elements

**Layout 1** (`date-start`, `date-end`, `Line 5`):
- Circled digits (DD MM YY) in pill shapes, connected by a line
- Live `<text>` elements using **GT Pressura Trial VF** font
- Start group at x=351, end group at x=627, line from x=465 to x=616 at y=292

**Layout 2** (`date-rotated`):
- Rotated text curving around the frame edge
- Rendered using **Courier New** font
- In the template SVGs this is pre-rendered as outlines; for live rendering we'll generate the rotated text programmatically

## UI Design

### Shell
- Page background: `#ECECEA`
- Canvas: white, `border-radius: 52px`, centered, soft shadow
- Right-side icon rail: white pill, `border-radius: 28px`, width 56px

### Icon Rail (top → bottom)
1. Ratio indicator (e.g. "1:1") → Canvas/Ratio panel
2. Image icon → Image panel
3. Stamp/printer icon → Ink & Aging panel
4. Export icon (dark bg `#2A2A27`, white arrow) → Export panel

### Panels
Floating cards anchored left of the rail. One open at a time.
- White fill, `border-radius: 20px`, border `#E2E2DC`, drop shadow

### Design Tokens
- Primary text: `#2A2A27`
- Secondary text: `#62625C`
- Active/selected: `#3B6FF5`
- Slider track bg: `#F1F1EC`, fill: `#E2E2DC`
- Dark button: `#2A2A27` fill, `border-radius: 13px`

## Panels & Controls

### 2.1 Canvas/Ratio
- Ratio presets: 16:9, 9:16, 1:1, 4:3 (circle buttons, selected = blue border)
- Width/Height px fields with slider bars
- Shows "1920 × 1080 PX" readout
- Default: 1:1

### 2.2 Image
- Upload dropzone (drag-drop + file picker)
- Shape selector: oval / rectangle / square (segmented pills)
- Image Settings:
  - Threshold level (0-255, default 75)
  - Edges (0-1, default 0.70)
  - Black point (0-255, default 0)
  - White point (0-255, default 255)
  - Invert (toggle, default off)
  - Line thickness (1-5, default 2)
  - Subject scale (0.2-0.9, default 0.50)
- Date toggle (default per redline):
  - Date range: start → end (DD.MM.YYYY)
  - Date layout selector: 1 / 2

### 2.3 Ink & Aging (always active, no toggle)
- Ink density (0-1, default 0.50)
- Wear (0-1, default 0.30)
- Edge bleed (0-1, default 0.20)

### 2.4 Export
- Download PNG button
- Always transparent background
- At canvas ratio pixel dimensions

## Pipeline (per render)

1. Take uploaded image → apply B&W processing chain (grayscale → levels → threshold → edges → invert → line thickness → subject scale)
2. Select layout SVG based on shape × date mode
3. Parse SVG, extract `image-region` geometry
4. Place processed image into region (object-fit: cover, clip to shape)
5. Apply ink & aging (density, wear, edge bleed) — ink always black
6. Compose with template (logo + outlines + date elements)
7. Rasterize at canvas dimensions, transparent background

## API

```
POST /api/generate {
    image_id, shape, date_enabled, date_layout,
    date_start, date_end,
    threshold_level, edge_strength, black_point, white_point,
    invert, line_thickness, subject_scale,
    ink_density, wear, edge_bleed,
    canvas_width, canvas_height
}
→ transparent PNG blob
```

## Defaults on Load
- Ratio: 1:1
- Shape: oval (default)
- Brand logo shown with default stamp settings
- Ink & aging already applied
- Image settings: Threshold 75, Edges 0.70, Black 0, White 255, Invert off, Line 2, Scale 0.50

## Removed
- Color section / ink color picker
- Text section (primary, secondary, font, placement)
- Shape & Border section (old outer stamp shape)
- Brown artisanal theme

## Assets
- `static/assets/logo.svg` — brand wordmark
- `static/assets/layouts/` — 9 SVG templates
- `static/assets/fonts/Courrier_new.ttf` — for date layout 2
- `static/assets/fonts/GT-Pressura-Extended-Medium-Trial.woff2` — for date layout 1
