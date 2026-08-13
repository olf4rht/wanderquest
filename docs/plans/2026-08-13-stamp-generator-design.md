# WanderQuest Stamp Generator - Design Document

## Overview

A web app that converts uploaded photos into rubber stamp-style images. Uses a hybrid approach: AI-powered line art extraction (Replicate API) combined with algorithmic post-processing for ink texture, aging, and customization.

Personal/side project scope.

## Architecture

```
Browser (HTML/CSS/JS) → FastAPI Backend (Python) → Replicate API (ControlNet)
```

- **Backend**: Python 3.12, FastAPI, uvicorn
- **Image processing**: Pillow, OpenCV
- **AI**: Replicate Python SDK (line art extraction via ControlNet)
- **Frontend**: Vanilla HTML/CSS/JS, no framework
- **No database** - stateless, process-and-return

## Image Processing Pipeline

```
Photo → [1. Line Art] → [2. Cleanup] → [3. Composition] → [4. Ink Effect] → [5. Export] → Stamp
```

### Stage 1 - Line Art Extraction (Replicate)
Send uploaded photo to a ControlNet/lineart model on Replicate. Returns clean black-and-white line drawing.

### Stage 2 - Cleanup & Isolation
- Threshold line art to pure black/white
- Remove background noise
- Auto-crop to subject
- Adjust line thickness via morphological operations (dilate/erode)

### Stage 3 - Composition
- Place line art within chosen stamp shape (circle, rectangle, oval, rounded rectangle)
- Render user text along paths (curved for circular stamps, straight for rectangular)
- Add decorative border elements (single line, double line, ornamental)

### Stage 4 - Ink Effect
- Colorize to chosen ink color
- Apply ink texture: uneven coverage, slight bleeding at edges
- Add wear/aging: small gaps in lines, faded spots, paper texture bleed-through
- Adjust ink density (light press vs heavy press)

### Stage 5 - Export
- Render final image as PNG (transparent or white background)
- Configurable output resolution

## Customization Controls

### Color
- Ink color picker (free choice) with presets: classic red, navy blue, forest green, black, purple

### Text
- Primary text (e.g., "Cafeteria El Carmen")
- Secondary text (e.g., tagline, date, location)
- Font selection: 5-6 stamp-appropriate fonts (blackletter, serif, sans-serif, handwritten, stencil)
- Text placement: top arc, bottom arc, above image, below image

### Shape & Border
- Stamp shape: circle, rectangle, oval, rounded rectangle
- Border style: none, single line, double line, rough/hand-carved edge
- Border thickness

### Ink & Aging
- Ink density slider (light to heavy)
- Wear/aging slider (pristine to heavily worn)
- Edge bleed slider (crisp to bleeding ink)
- Background: transparent or paper texture

### Image
- Line thickness slider (thin/detailed to thick/bold)
- Subject scale within stamp frame

## UI Layout

Single-page app with controls sidebar on the left, large live preview on the right.

- Controls panel (left): upload button, grouped control sections (color, text, shape, ink, image)
- Preview area (right): live-updating stamp preview, download buttons (PNG, SVG)
- All customization controls update preview instantly (algorithmic, no API call)
- Replicate call happens once on upload only
- Mobile: controls stack above preview

## Key Decisions

- **Replicate over local models**: Simpler setup, negligible cost for personal use, better quality
- **Vanilla frontend over framework**: Scope doesn't warrant React/Vue complexity
- **Stateless**: No user accounts, no saved stamps, no database
- **Live preview**: All post-upload controls are purely algorithmic for instant feedback
