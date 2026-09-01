# Reference Image + Auto-Trace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a reference image underlay for tracing and an auto-trace button that vectorizes the reference into editable draw strokes, all within Engine A (Draw).

**Architecture:** New `reference` state on `state.draw` holds the uploaded dataURL + transform parameters. A new `<g id="ref-layer">` renders the image below the symbol layer. Auto-trace reuses the existing `imageTile.js` pipeline (binarize → clean → marching-squares → RDP → smooth) but outputs stroke objects instead of unit-cell paths. A fundamental-domain guide overlay shows the active symmetry wedge. Exports explicitly exclude the reference layer.

**Tech Stack:** Vanilla JS, SVG, Canvas API (for rasterize/binarize). Zero new dependencies.

---

## Architecture Notes

### SVG layer order (back → front)
```
<svg id="canvas">
  <defs>...</defs>
  <rect id="bg-rect"/>           ← background
  <g id="ref-layer">             ← NEW: reference image (pointer-events: none)
    <image .../>                  ← the uploaded reference
  </g>
  <g id="domain-guide"/>         ← NEW: symmetry wedge overlay (pointer-events: none)
  <g id="symbol">                ← existing: draw strokes / math tiles
    <g> committedG </g>
    <g> liveG </g>
  </g>
</svg>
```

### State shape addition
```js
state.draw.reference = {
  src:        null,    // dataURL string
  visible:    true,
  opacity:    0.35,
  rotate:     0,       // degrees
  scale:      1,       // 0.25–4
  x: 0, y: 0,         // pan offset in SVG px
  flipH:      false,
  desaturate: true,
  showDomain: true,
  locked:     false,
}
```

### Stroke extension
Traced strokes get `fromTrace: true` so "Clear trace" can target them:
```js
{ points: [[x,y],...], w: strokeWidth, fromTrace: true }
```

### Key file changes
| File | Change |
|------|--------|
| `state.js` | No changes (generic merge handles nested objects) |
| `engineDraw.js` | Add ref-layer rendering, domain guide rendering, "move reference" pointer mode, trace→stroke conversion |
| `imageTile.js` | Export inner pipeline functions (`rasterize`, `binarize`, `cleanMask`, `traceContours`, `rdp`) for reuse |
| `main.js` | Add REFERENCE + TRACE UI sections, wire controls, update syncUI, extend save/load JSON |
| `compose.js` | No changes needed (ref-layer is outside `#symbol`, not affected by texture filter) |
| `export.js` | Strip `#ref-layer` and `#domain-guide` from SVG clone before export; strip from PNG rasterize |
| `index.html` | Add REFERENCE and TRACE section markup to draw-controls |
| `styles.css` | Add styles for new sections |

---

## Task 1: Export imageTile.js internals for reuse

The auto-trace pipeline needs the same binarize/clean/trace/rdp functions that `imageTile.js` already has, but they're currently private. Export them so `engineDraw.js` can import them.

**Files:**
- Modify: `tile-generator/src/imageTile.js`

**Step 1: Add `export` to pipeline functions**

Change these function declarations from private to exported (no logic changes):

```js
// In imageTile.js, change:
// function rasterize(img) {        → export function rasterize(img) {
// function binarize(...)           → export function binarize(...)
// function cleanMask(...)          → export function cleanMask(...)
// function traceContours(mask,...) → export function traceContours(mask,...)
// function rdp(points, epsilon)    → export function rdp(points, epsilon)
// function chainSegments(segments) — keep private (internal to traceContours)
```

Add `export` keyword to these 5 functions:
- `rasterize` (line ~59)
- `binarize` (line ~77)
- `cleanMask` (line ~108)
- `traceContours` (line ~220)
- `rdp` (line ~305)

**Step 2: Verify existing image tile panel still works**

Run the app, switch to Math engine, click "Add tile from image", upload an image, verify it still extracts and adds to legend. The `extract()` function calls these same functions internally so there's no behavior change.

**Step 3: Commit**

```bash
git add tile-generator/src/imageTile.js
git commit -m "refactor: export imageTile pipeline functions for reuse by auto-trace"
```

---

## Task 2: Add reference state + SVG layers

Add the reference state fields and create the SVG layer elements.

**Files:**
- Modify: `tile-generator/src/main.js` (INITIAL state)
- Modify: `tile-generator/src/engineDraw.js` (create layers in `init`)

**Step 1: Add reference defaults to INITIAL state in main.js**

In `main.js`, inside the `INITIAL` object's `draw` property, add:

```js
// After: strokes: [],
reference: {
  src: null,
  visible: true,
  opacity: 0.35,
  rotate: 0,
  scale: 1,
  x: 0, y: 0,
  flipH: false,
  desaturate: true,
  showDomain: true,
  locked: false,
},
```

**Step 2: Create ref-layer and domain-guide groups in engineDraw.init**

In `engineDraw.js`, modify the `init` function. After getting `svg` and `symbolG` refs, create and insert new layers *before* `symbolG`:

```js
export function init(svgEl, symG) {
  svg = svgEl;
  symbolG = symG;

  // Create reference and domain guide layers BEFORE symbolG
  refLayerG = document.createElementNS(NS, 'g');
  refLayerG.setAttribute('id', 'ref-layer');
  refLayerG.setAttribute('pointer-events', 'none');
  svg.insertBefore(refLayerG, symbolG);

  domainGuideG = document.createElementNS(NS, 'g');
  domainGuideG.setAttribute('id', 'domain-guide');
  domainGuideG.setAttribute('pointer-events', 'none');
  svg.insertBefore(domainGuideG, symbolG);

  committedG = document.createElementNS(NS, 'g');
  liveG = document.createElementNS(NS, 'g');
  symbolG.appendChild(committedG);
  symbolG.appendChild(liveG);

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointerleave', onUp);
}
```

Add module-level variables at the top (near existing `let svg, symbolG, ...`):

```js
let refLayerG, domainGuideG;
```

**Step 3: Verify app boots without errors**

Open `http://localhost:8000/tile-generator/`, open browser console, verify no errors. The new groups should be empty and invisible.

**Step 4: Commit**

```bash
git add tile-generator/src/main.js tile-generator/src/engineDraw.js
git commit -m "feat: add reference state defaults and SVG layer groups"
```

---

## Task 3: Reference image rendering

Render the uploaded reference image into the ref-layer group with all transforms applied.

**Files:**
- Modify: `tile-generator/src/engineDraw.js`

**Step 1: Add renderReference function**

Add this function to `engineDraw.js` (after the `render` export):

```js
export function renderReference(s) {
  refLayerG.innerHTML = '';
  const ref = s.draw.reference;
  if (!ref.src || !ref.visible) return;

  const size = s.size;
  const img = document.createElementNS(NS, 'image');
  img.setAttribute('href', ref.src);
  img.setAttribute('width', size);
  img.setAttribute('height', size);
  img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  img.setAttribute('opacity', ref.opacity);

  // Build transform: translate to center, apply scale/rotate/flip, translate back, then pan
  const h = size / 2;
  const parts = [];
  parts.push(`translate(${ref.x + h}, ${ref.y + h})`);
  parts.push(`rotate(${ref.rotate})`);
  parts.push(`scale(${ref.flipH ? -ref.scale : ref.scale}, ${ref.scale})`);
  parts.push(`translate(${-h}, ${-h})`);
  img.setAttribute('transform', parts.join(' '));

  if (ref.desaturate) {
    img.setAttribute('filter', 'saturate(0)');
  }

  refLayerG.appendChild(img);

  // Clip to the square canvas
  let clipPath = svg.querySelector('#ref-clip');
  if (!clipPath) {
    const defs = svg.querySelector('defs');
    clipPath = document.createElementNS(NS, 'clipPath');
    clipPath.setAttribute('id', 'ref-clip');
    const clipRect = document.createElementNS(NS, 'rect');
    clipRect.setAttribute('x', '0');
    clipRect.setAttribute('y', '0');
    clipRect.setAttribute('width', size);
    clipRect.setAttribute('height', size);
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
  }
  refLayerG.setAttribute('clip-path', 'url(#ref-clip)');
}
```

**Step 2: Call renderReference from the state subscriber**

In `main.js`, inside the `State.subscribe` callback, add after the `DrawEngine.render(s)` call:

```js
// Change from:
if (s.engine === 'draw') {
  DrawEngine.render(s);
}
// To:
if (s.engine === 'draw') {
  DrawEngine.render(s);
  DrawEngine.renderReference(s);
} else {
  // Hide reference when not in draw mode
  DrawEngine.renderReference({ ...s, draw: { ...s.draw, reference: { ...s.draw.reference, visible: false } } });
}
```

Actually, simpler approach — just always call renderReference and let it check engine mode:

```js
State.subscribe(s => {
  compose(svgEl, s);
  if (s.engine === 'draw') {
    DrawEngine.render(s);
    DrawEngine.renderReference(s);
    DrawEngine.renderDomainGuide(s);
  } else {
    DrawEngine.renderReference({ ...s, draw: { ...s.draw, reference: { ...s.draw.reference, src: null } } });
    DrawEngine.renderDomainGuide({ ...s, draw: { ...s.draw, reference: { ...s.draw.reference, showDomain: false } } });
    MathEngine.render(s, symbolG);
  }
  syncUI(s);
});
```

We'll add `renderDomainGuide` as a stub for now (Task 5), but for this task just add `renderReference`. Wire the domain guide call in Task 5.

**Step 3: Verify by manually setting state**

In browser console, test:
```js
// Can't easily do this without exposing State, so we'll test via the UI once Task 4 adds the upload control.
```

For now, verify app loads without error and the ref-layer group exists in the DOM inspector.

**Step 4: Commit**

```bash
git add tile-generator/src/engineDraw.js tile-generator/src/main.js
git commit -m "feat: render reference image in ref-layer with transforms"
```

---

## Task 4: Reference image upload UI + controls

Add the REFERENCE panel section with upload, visibility, opacity, rotate, scale, pan, flip, desaturate, lock, and "Move reference" controls.

**Files:**
- Modify: `tile-generator/index.html`
- Modify: `tile-generator/styles.css`
- Modify: `tile-generator/src/main.js`

**Step 1: Add REFERENCE section to index.html**

Insert this block inside `#draw-controls`, after the existing tool-group div (the Brush/Erase/Undo/Clear buttons):

```html
<!-- Reference image -->
<div class="section" id="ref-controls">
  <div class="section-title">Reference</div>

  <div class="ref-upload-row">
    <button class="ctrl-btn" id="btn-ref-upload">Image</button>
    <button class="ctrl-btn" id="btn-ref-replace" disabled>Replace</button>
    <button class="ctrl-btn" id="btn-ref-remove" disabled>Remove</button>
    <input type="file" id="ref-file-input" accept="image/*" hidden>
  </div>

  <div class="ctrl-label">
    Visible
    <input type="checkbox" id="ref-visible" checked class="ctrl-check" disabled>
  </div>

  <div class="ctrl-label">
    Lock
    <input type="checkbox" id="ref-locked" class="ctrl-check" disabled>
  </div>

  <div class="ctrl-label">Opacity <span class="ctrl-val" id="ref-opacity-val">0.35</span></div>
  <input type="range" id="ref-opacity" min="0.05" max="1" value="0.35" step="0.05" class="ctrl-range" disabled>

  <div class="ctrl-label">Rotate <span class="ctrl-val" id="ref-rotate-val">0</span></div>
  <input type="range" id="ref-rotate" min="-180" max="180" value="0" step="5" class="ctrl-range" disabled>

  <div class="ctrl-label">Scale <span class="ctrl-val" id="ref-scale-val">1</span></div>
  <input type="range" id="ref-scale" min="0.25" max="4" value="1" step="0.05" class="ctrl-range" disabled>

  <div class="ctrl-label">
    Flip H
    <input type="checkbox" id="ref-fliph" class="ctrl-check" disabled>
  </div>

  <div class="ctrl-label">
    Desaturate
    <input type="checkbox" id="ref-desaturate" checked class="ctrl-check" disabled>
  </div>

  <div class="ctrl-label">
    Show domain guide
    <input type="checkbox" id="ref-show-domain" checked class="ctrl-check" disabled>
  </div>

  <button class="ctrl-btn" id="btn-ref-move" disabled>Move reference</button>
  <div class="ref-hint">Trace inside the highlighted wedge — symmetry mirrors it around the tile.</div>
</div>
```

**Step 2: Add styles to styles.css**

```css
/* Reference section */
.ref-upload-row {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}
.ref-upload-row .ctrl-btn { flex: 1; font-size: 11px; }
.ref-hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--label);
  font-style: italic;
  line-height: 1.4;
}
#btn-ref-move.active {
  background: var(--active);
  color: var(--active-fg);
}
```

**Step 3: Wire reference upload in main.js**

Add this wiring code in `main.js` (after the existing draw control wiring):

```js
// ---- Wire: reference controls ----
const refFileInput = document.getElementById('ref-file-input');
const refControls = [
  'ref-visible', 'ref-locked', 'ref-opacity', 'ref-rotate', 'ref-scale',
  'ref-fliph', 'ref-desaturate', 'ref-show-domain', 'btn-ref-move',
  'btn-ref-replace', 'btn-ref-remove',
];

function setRefControlsEnabled(enabled) {
  refControls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
}

function loadReferenceImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    State.merge('draw', {
      reference: {
        ...State.get().draw.reference,
        src: reader.result,
      },
    });
    setRefControlsEnabled(true);
  };
  reader.readAsDataURL(file);
}

document.getElementById('btn-ref-upload').addEventListener('click', () => refFileInput.click());
document.getElementById('btn-ref-replace').addEventListener('click', () => refFileInput.click());
document.getElementById('btn-ref-remove').addEventListener('click', () => {
  State.merge('draw', {
    reference: { ...State.get().draw.reference, src: null },
  });
  setRefControlsEnabled(false);
});
refFileInput.addEventListener('change', () => {
  if (refFileInput.files[0]) loadReferenceImage(refFileInput.files[0]);
  refFileInput.value = '';
});

on('ref-visible', 'change', e => State.merge('draw', { reference: { ...State.get().draw.reference, visible: e.target.checked } }));
on('ref-locked', 'change', e => State.merge('draw', { reference: { ...State.get().draw.reference, locked: e.target.checked } }));
on('ref-opacity', 'input', e => {
  val('ref-opacity-val', e.target.value);
  State.merge('draw', { reference: { ...State.get().draw.reference, opacity: parseFloat(e.target.value) } });
});
on('ref-rotate', 'input', e => {
  val('ref-rotate-val', e.target.value);
  State.merge('draw', { reference: { ...State.get().draw.reference, rotate: int(e.target.value) } });
});
on('ref-scale', 'input', e => {
  val('ref-scale-val', e.target.value);
  State.merge('draw', { reference: { ...State.get().draw.reference, scale: parseFloat(e.target.value) } });
});
on('ref-fliph', 'change', e => State.merge('draw', { reference: { ...State.get().draw.reference, flipH: e.target.checked } }));
on('ref-desaturate', 'change', e => State.merge('draw', { reference: { ...State.get().draw.reference, desaturate: e.target.checked } }));
on('ref-show-domain', 'change', e => State.merge('draw', { reference: { ...State.get().draw.reference, showDomain: e.target.checked } }));
```

**Step 4: Sync reference UI in syncUI**

Add to `syncUI(s)` in `main.js`:

```js
// Reference controls sync
const hasRef = !!(s.draw.reference && s.draw.reference.src);
setRefControlsEnabled(hasRef);
if (hasRef) {
  document.getElementById('ref-visible').checked = s.draw.reference.visible;
  document.getElementById('ref-locked').checked = s.draw.reference.locked;
  document.getElementById('ref-opacity').value = s.draw.reference.opacity;
  val('ref-opacity-val', s.draw.reference.opacity);
  document.getElementById('ref-rotate').value = s.draw.reference.rotate;
  val('ref-rotate-val', s.draw.reference.rotate);
  document.getElementById('ref-scale').value = s.draw.reference.scale;
  val('ref-scale-val', s.draw.reference.scale);
  document.getElementById('ref-fliph').checked = s.draw.reference.flipH;
  document.getElementById('ref-desaturate').checked = s.draw.reference.desaturate;
  document.getElementById('ref-show-domain').checked = s.draw.reference.showDomain;
}
```

**Step 5: Test**

Open the app in Draw mode. The REFERENCE section should appear with all controls disabled. Click "Image", select a PNG/JPG. The reference should appear behind the drawing area at 35% opacity, desaturated. Adjust opacity, rotate, scale, flip, desaturate sliders and verify they update live. Toggle visibility off/on. Click Remove and verify the reference disappears and controls go disabled again.

**Step 6: Commit**

```bash
git add tile-generator/index.html tile-generator/styles.css tile-generator/src/main.js
git commit -m "feat: add reference image upload UI with transform controls"
```

---

## Task 5: Move-reference pointer mode

Allow the user to pan the reference image by entering "Move reference" mode.

**Files:**
- Modify: `tile-generator/src/engineDraw.js`
- Modify: `tile-generator/src/main.js`

**Step 1: Add move-reference mode to engineDraw.js**

Add a module-level mode variable and functions:

```js
let refMoveMode = false;
let refDragStart = null;
let refDragOrigin = null;

export function setRefMoveMode(on) { refMoveMode = on; }
export function getRefMoveMode() { return refMoveMode; }
```

Modify `onDown` to check for refMoveMode before normal drawing:

```js
function onDown(e) {
  if (State.get().engine !== 'draw') return;

  // Move-reference mode: drag to pan the reference
  if (refMoveMode) {
    const ref = State.get().draw.reference;
    if (!ref.src || ref.locked) return;
    refDragStart = svgCoord(e);
    refDragOrigin = [ref.x, ref.y];
    svg.setPointerCapture(e.pointerId);
    return;
  }

  if (tool === 'erase') { eraseAt(e); return; }
  // ... rest of existing onDown
```

Modify `onMove`:

```js
function onMove(e) {
  // Move-reference drag
  if (refMoveMode && refDragStart) {
    const [cx, cy] = svgCoord(e);
    const dx = cx - refDragStart[0];
    const dy = cy - refDragStart[1];
    State.merge('draw', {
      reference: {
        ...State.get().draw.reference,
        x: refDragOrigin[0] + dx,
        y: refDragOrigin[1] + dy,
      },
    });
    return;
  }

  if (!drawing) return;
  // ... rest of existing onMove
```

Modify `onUp`:

```js
function onUp() {
  if (refMoveMode && refDragStart) {
    refDragStart = null;
    refDragOrigin = null;
    return;
  }

  if (!drawing) return;
  // ... rest of existing onUp
```

**Step 2: Wire the Move Reference button in main.js**

```js
document.getElementById('btn-ref-move').addEventListener('click', () => {
  const isActive = DrawEngine.getRefMoveMode();
  DrawEngine.setRefMoveMode(!isActive);
  document.getElementById('btn-ref-move').classList.toggle('active', !isActive);
  svgEl.style.cursor = !isActive ? 'grab' : 'crosshair';
});
```

**Step 3: Test**

Upload a reference image. Click "Move reference" (button should highlight). Drag on the canvas — the reference image should pan. Release. Click "Move reference" again to deactivate. Draw mode should resume (cursor back to crosshair, drawing works).

**Step 4: Commit**

```bash
git add tile-generator/src/engineDraw.js tile-generator/src/main.js
git commit -m "feat: add move-reference pointer mode for panning reference image"
```

---

## Task 6: Fundamental-domain guide overlay

Render faint lines showing the active symmetry's fundamental domain (wedge) so users know where to trace.

**Files:**
- Modify: `tile-generator/src/engineDraw.js`

**Step 1: Add renderDomainGuide function**

```js
export function renderDomainGuide(s) {
  domainGuideG.innerHTML = '';
  const ref = s.draw.reference;
  if (!ref || !ref.showDomain || !ref.src) return;

  const h = s.size / 2;
  const r = h; // radius to edge
  const mode = s.draw.symmetry;
  const lineStyle = 'stroke:#1B3A8B;stroke-opacity:0.2;stroke-width:1.5;stroke-dasharray:6,4;fill:none';

  // Draw axes through center based on symmetry mode
  const lines = [];
  const wedgePath = [];

  switch (mode) {
    case 'mirror':
      // Vertical axis — fundamental domain is left half
      lines.push([h, 0, h, s.size]);
      // Shade right half faintly
      wedgePath.push(`M${h},0 L${s.size},0 L${s.size},${s.size} L${h},${s.size} Z`);
      break;

    case 'rot4':
      // 4-fold: 90 degree wedge (top-right quadrant)
      lines.push([h, 0, h, s.size]); // vertical
      lines.push([0, h, s.size, h]); // horizontal
      break;

    case 'rot6': {
      // 6-fold: 60 degree sectors from center
      for (let k = 0; k < 6; k++) {
        const angle = k * Math.PI / 3;
        lines.push([h, h, h + r * Math.cos(angle), h + r * Math.sin(angle)]);
      }
      break;
    }

    case 'rot8': {
      // 8-fold: 45 degree sectors from center
      for (let k = 0; k < 8; k++) {
        const angle = k * Math.PI / 4;
        lines.push([h, h, h + r * Math.cos(angle), h + r * Math.sin(angle)]);
      }
      break;
    }

    case 'd4': {
      // Dihedral-4: 8 copies — 45 degree wedge
      // Draw all 4 axes (horizontal, vertical, 2 diagonals)
      lines.push([h, 0, h, s.size]); // vertical
      lines.push([0, h, s.size, h]); // horizontal
      lines.push([0, 0, s.size, s.size]); // diagonal
      lines.push([s.size, 0, 0, s.size]); // anti-diagonal
      break;
    }
  }

  // Draw lines
  lines.forEach(([x1, y1, x2, y2]) => {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('style', lineStyle);
    domainGuideG.appendChild(line);
  });

  // Draw wedge highlight (faint fill on the fundamental domain)
  if (wedgePath.length === 0) {
    // Build a wedge path for rotation symmetries
    let wedgeAngle;
    switch (mode) {
      case 'rot4': wedgeAngle = Math.PI / 2; break;
      case 'rot6': wedgeAngle = Math.PI / 3; break;
      case 'rot8': wedgeAngle = Math.PI / 4; break;
      case 'd4':   wedgeAngle = Math.PI / 4; break;
      default:     wedgeAngle = 0;
    }
    if (wedgeAngle > 0) {
      // Wedge from 12 o'clock (negative y) clockwise
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + wedgeAngle;
      const x1 = h + r * Math.cos(startAngle);
      const y1 = h + r * Math.sin(startAngle);
      const x2 = h + r * Math.cos(endAngle);
      const y2 = h + r * Math.sin(endAngle);
      const largeArc = wedgeAngle > Math.PI ? 1 : 0;
      const wd = `M${h},${h} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`;
      wedgePath.push(wd);
    }
  }

  wedgePath.forEach(d => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', '#1B3A8B');
    p.setAttribute('fill-opacity', '0.05');
    p.setAttribute('stroke', 'none');
    domainGuideG.appendChild(p);
  });
}
```

**Step 2: Wire renderDomainGuide in main.js state subscriber**

In the `State.subscribe` callback in `main.js`:

```js
if (s.engine === 'draw') {
  DrawEngine.render(s);
  DrawEngine.renderReference(s);
  DrawEngine.renderDomainGuide(s);
} else {
  DrawEngine.renderReference({ ...s, draw: { ...s.draw, reference: { ...s.draw.reference, src: null } } });
  DrawEngine.renderDomainGuide({ ...s, draw: { ...s.draw, reference: { ...s.draw.reference, showDomain: false } } });
  MathEngine.render(s, symbolG);
}
```

**Step 3: Test**

Upload a reference image. With "Show domain guide" checked, switch between symmetry modes (mirror, rot4, rot6, rot8, d4). Verify:
- `mirror`: vertical line through center, right half faintly shaded
- `rot4`: cross through center, top-right wedge highlighted
- `rot6`: 6 radial lines, 60° wedge highlighted
- `rot8`: 8 radial lines, 45° wedge highlighted
- `d4`: 4 axes (cross + diagonals), 45° wedge highlighted

Uncheck "Show domain guide" — lines and wedge disappear. Remove reference — guide disappears.

**Step 4: Commit**

```bash
git add tile-generator/src/engineDraw.js tile-generator/src/main.js
git commit -m "feat: add fundamental-domain guide overlay for symmetry modes"
```

---

## Task 7: Auto-trace — convert reference to strokes

The core feature: vectorize the reference image into stroke objects using the imageTile pipeline.

**Files:**
- Modify: `tile-generator/src/engineDraw.js`

**Step 1: Add autoTrace function**

This function takes the reference image dataURL, runs the binarize→clean→trace→rdp pipeline, and converts contours into stroke objects compatible with `state.draw.strokes`.

```js
import { rasterize as imgRasterize, binarize, cleanMask, traceContours, rdp as imgRdp } from './imageTile.js';

// ...

/**
 * Auto-trace: vectorize the reference image into draw strokes.
 * @param {object} opts - { threshold, invert, keepHoles, detail, smooth, traceMode, foldWithSymmetry }
 * @returns {Array} strokes - array of stroke objects, or null if failed
 */
export function autoTrace(opts = {}) {
  const s = State.get();
  const ref = s.draw.reference;
  if (!ref.src) return null;

  const {
    threshold = 128,
    invert = false,
    keepHoles = false,
    detail = 50,
    smooth = true,
    traceMode = 'silhouette',
    foldWithSymmetry = false,
  } = opts;

  // Load image from dataURL
  const img = new Image();
  img.src = ref.src;

  // rasterize needs a loaded image — since src is a dataURL, it loads synchronously
  // but let's use the canvas approach directly
  const size = s.size;

  // Rasterize dataURL to canvas pixel data
  const canvas = document.createElement('canvas');
  const maxDim = 256;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

  // Binarize
  const mask = binarize(imageData, w, h, threshold, invert);

  // If foldWithSymmetry, clip mask to fundamental domain
  if (foldWithSymmetry) {
    clipMaskToDomain(mask, w, h, s.draw.symmetry);
  }

  // Clean
  cleanMask(mask, w, h, keepHoles);

  if (!mask.some(v => v)) return null;

  // Trace contours
  const contours = traceContours(mask, w, h);
  if (contours.length === 0) return null;

  // Simplify
  const eps = 0.3 + (100 - detail) * 0.06;
  const simplified = contours.map(c => imgRdp(c, eps)).filter(c => c.length >= 3);
  if (simplified.length === 0) return null;

  // Convert pixel-space contours → center-relative SVG-space strokes
  const half = size / 2;
  // Map from rasterized coords (0..w, 0..h) to SVG coords centered on canvas
  // The image fills the canvas square, so map proportionally
  const strokes = simplified.map(contour => {
    const points = contour.map(([px, py]) => {
      const sx = (px / w) * size - half;
      const sy = (py / h) * size - half;
      return [sx, sy];
    });

    // Optionally smooth via Catmull-Rom (just keep the points; smoothPath handles rendering)
    return {
      points,
      w: s.draw.strokeWidth,
      fromTrace: true,
      closed: true,
      traceMode,
    };
  });

  return strokes;
}

/**
 * Clip a binary mask to the fundamental domain of the given symmetry mode.
 * Zeroes out pixels outside the domain.
 */
function clipMaskToDomain(mask, w, h, symmetry) {
  const cx = w / 2, cy = h / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;

      // Coordinates relative to center
      const rx = x - cx, ry = y - cy;
      const angle = Math.atan2(ry, rx); // -PI..PI

      let inside = true;
      switch (symmetry) {
        case 'mirror':
          // Left half: x <= cx
          inside = x <= cx;
          break;
        case 'rot4':
          // Top-right quadrant: angle between -PI/2 and 0
          inside = angle >= -Math.PI / 2 && angle <= 0;
          break;
        case 'rot6':
          // 60-degree wedge from -PI/2
          inside = angle >= -Math.PI / 2 && angle <= -Math.PI / 2 + Math.PI / 3;
          break;
        case 'rot8':
          // 45-degree wedge from -PI/2
          inside = angle >= -Math.PI / 2 && angle <= -Math.PI / 2 + Math.PI / 4;
          break;
        case 'd4':
          // 45-degree wedge from -PI/2
          inside = angle >= -Math.PI / 2 && angle <= -Math.PI / 2 + Math.PI / 4;
          break;
      }

      if (!inside) mask[y * w + x] = 0;
    }
  }
}
```

**Step 2: Update render to handle trace strokes**

The existing `render` function already renders all strokes with symmetry. Traced strokes with `traceMode === 'silhouette'` should render as filled closed shapes, while `outline` should render as stroked lines. Modify the render function to handle this:

In the `render` function's `s.draw.strokes.forEach` loop, after building the path `d`, adjust fill/stroke based on `stroke.traceMode`:

```js
// Replace the fill/stroke logic in render():
const isSilhouette = stroke.traceMode === 'silhouette';
const useSolid = isSilhouette || s.draw.solid;

if (useSolid) {
  el.setAttribute('fill', s.inks[0]);
  el.setAttribute('stroke', 'none');
} else {
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', s.inks[0]);
  el.setAttribute('stroke-width', stroke.w);
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
}
```

Also, for silhouette strokes, force the path to close by ensuring it ends with `Z`. Update the `smoothPath` call:

```js
const forceClosed = stroke.closed || stroke.traceMode === 'silhouette';
const d = smoothPath(pts, forceClosed, stroke.w);
```

**Step 3: Add clearTrace helper**

```js
export function clearTrace() {
  const s = State.get();
  State.merge('draw', {
    strokes: s.draw.strokes.filter(st => !st.fromTrace),
  });
}
```

**Step 4: Commit**

```bash
git add tile-generator/src/engineDraw.js
git commit -m "feat: add autoTrace function converting reference image to editable strokes"
```

---

## Task 8: Auto-trace UI — TRACE subsection + controls

Add the AUTO-TRACE button and trace-specific controls to the panel.

**Files:**
- Modify: `tile-generator/index.html`
- Modify: `tile-generator/styles.css`
- Modify: `tile-generator/src/main.js`

**Step 1: Add TRACE section to index.html**

Insert this block in `#draw-controls`, after `#ref-controls`:

```html
<!-- Auto-trace controls -->
<div class="section" id="trace-controls">
  <div class="section-title">Trace</div>

  <button class="ctrl-btn" id="btn-auto-trace" disabled style="width:100%;margin-bottom:8px">Auto-Trace</button>

  <div class="ctrl-label">Mode</div>
  <select id="trace-mode" class="ctrl-select" disabled>
    <option value="silhouette" selected>Silhouette (filled)</option>
    <option value="outline">Outline (stroked)</option>
  </select>

  <div class="ctrl-label">Threshold <span class="ctrl-val" id="trace-thresh-val">128</span></div>
  <input type="range" id="trace-threshold" min="1" max="255" value="128" step="1" class="ctrl-range" disabled>

  <div class="ctrl-label">
    Invert
    <input type="checkbox" id="trace-invert" class="ctrl-check" disabled>
  </div>

  <div class="ctrl-label">
    Keep holes
    <input type="checkbox" id="trace-keep-holes" class="ctrl-check" disabled>
  </div>

  <div class="ctrl-label">Detail <span class="ctrl-val" id="trace-detail-val">50</span></div>
  <input type="range" id="trace-detail" min="0" max="100" value="50" step="5" class="ctrl-range" disabled>

  <div class="ctrl-label">
    Smooth
    <input type="checkbox" id="trace-smooth" checked class="ctrl-check" disabled>
  </div>

  <div class="ctrl-label">
    Fold with symmetry
    <input type="checkbox" id="trace-fold" class="ctrl-check" disabled>
  </div>

  <div class="tool-group" style="margin-top:8px">
    <button class="ctrl-btn" id="btn-retrace" disabled>Re-trace</button>
    <button class="ctrl-btn" id="btn-clear-trace" disabled>Clear trace</button>
  </div>

  <div id="trace-error" class="it-error" style="display:none"></div>
</div>
```

**Step 2: Wire trace controls in main.js**

```js
// ---- Wire: trace controls ----
const traceControlIds = [
  'btn-auto-trace', 'trace-mode', 'trace-threshold', 'trace-invert',
  'trace-keep-holes', 'trace-detail', 'trace-smooth', 'trace-fold',
  'btn-retrace', 'btn-clear-trace',
];

function setTraceControlsEnabled(enabled) {
  traceControlIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
}

function getTraceOpts() {
  return {
    threshold: int(document.getElementById('trace-threshold').value),
    invert: document.getElementById('trace-invert').checked,
    keepHoles: document.getElementById('trace-keep-holes').checked,
    detail: int(document.getElementById('trace-detail').value),
    smooth: document.getElementById('trace-smooth').checked,
    traceMode: document.getElementById('trace-mode').value,
    foldWithSymmetry: document.getElementById('trace-fold').checked,
  };
}

function runTrace() {
  const traceErr = document.getElementById('trace-error');
  traceErr.style.display = 'none';

  // Remove previous trace strokes before re-tracing
  DrawEngine.clearTrace();

  const strokes = DrawEngine.autoTrace(getTraceOpts());
  if (!strokes || strokes.length === 0) {
    traceErr.textContent = "Couldn't trace a clear shape — adjust Threshold/Invert.";
    traceErr.style.display = '';
    return;
  }

  // Add traced strokes to state
  const s = State.get();
  State.merge('draw', {
    strokes: [...s.draw.strokes, ...strokes],
  });
}

document.getElementById('btn-auto-trace').addEventListener('click', runTrace);
document.getElementById('btn-retrace').addEventListener('click', runTrace);
document.getElementById('btn-clear-trace').addEventListener('click', () => DrawEngine.clearTrace());

// Update trace slider displays
on('trace-threshold', 'input', e => val('trace-thresh-val', e.target.value));
on('trace-detail', 'input', e => val('trace-detail-val', e.target.value));
```

**Step 3: Enable/disable trace controls based on reference state**

In `syncUI`, update:

```js
// Trace controls — enable only when reference is loaded
const hasRef = !!(s.draw.reference && s.draw.reference.src);
setRefControlsEnabled(hasRef);
setTraceControlsEnabled(hasRef);
```

**Step 4: Test**

1. Upload a reference image (something with clear contrast like a black icon on white)
2. Click "Auto-Trace" — the reference should be vectorized into filled strokes
3. The strokes should appear in the symbol layer, colored with the primary ink
4. Try adjusting Threshold, Invert, Detail, Smooth and clicking Re-trace
5. Try "Clear trace" — traced strokes disappear but hand-drawn strokes remain
6. Try adding hand-drawn strokes on top of the trace — both should coexist
7. Try undo — should remove strokes one by one (both traced and hand-drawn)
8. Toggle "Fold with symmetry" ON, change symmetry to d4, Re-trace — only the wedge should be traced and symmetry should replicate it

**Step 5: Commit**

```bash
git add tile-generator/index.html tile-generator/styles.css tile-generator/src/main.js
git commit -m "feat: add auto-trace UI with threshold, detail, and fold controls"
```

---

## Task 9: Handle autoTrace image loading asynchronously

The `autoTrace` function currently assumes `new Image()` with a dataURL src loads synchronously. This is true in most browsers for dataURLs, but we should make it robust. Also, the image must have `naturalWidth`/`naturalHeight` set.

**Files:**
- Modify: `tile-generator/src/engineDraw.js`
- Modify: `tile-generator/src/main.js`

**Step 1: Make autoTrace async**

Change `autoTrace` to return a Promise:

```js
export async function autoTrace(opts = {}) {
  const s = State.get();
  const ref = s.draw.reference;
  if (!ref.src) return null;

  // ... same opts destructuring ...

  // Load image from dataURL
  const img = await loadImage(ref.src);
  if (!img) return null;

  // ... rest of pipeline using img ...
}

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
```

**Step 2: Update callers to await**

In `main.js`, change `runTrace`:

```js
async function runTrace() {
  const traceErr = document.getElementById('trace-error');
  traceErr.style.display = 'none';

  DrawEngine.clearTrace();

  const strokes = await DrawEngine.autoTrace(getTraceOpts());
  if (!strokes || strokes.length === 0) {
    traceErr.textContent = "Couldn't trace a clear shape — adjust Threshold/Invert.";
    traceErr.style.display = '';
    return;
  }

  const s = State.get();
  State.merge('draw', {
    strokes: [...s.draw.strokes, ...strokes],
  });
}
```

**Step 3: Test**

Same test as Task 8 — verify auto-trace still works correctly with the async version.

**Step 4: Commit**

```bash
git add tile-generator/src/engineDraw.js tile-generator/src/main.js
git commit -m "fix: make autoTrace async for robust image loading"
```

---

## Task 10: Export safety — exclude reference from SVG/PNG

Ensure exports never include the reference image or domain guide.

**Files:**
- Modify: `tile-generator/src/export.js`

**Step 1: Strip ref-layer and domain-guide from export clones**

In `exportSVG`, after cloning the SVG, remove the non-exportable layers:

```js
export function exportSVG(svgEl) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // Remove non-exportable layers
  stripNonExportable(clone);
  const xml = new XMLSerializer().serializeToString(clone);
  download(new Blob([xml], { type: 'image/svg+xml' }), 'tile-symbol.svg');
}
```

In `rasterize` (used by `exportPNG` and `copyPNG`), do the same:

```js
function rasterize(svgEl, size, cb) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  stripNonExportable(clone);
  // ... rest unchanged
}
```

Add the helper:

```js
function stripNonExportable(svgClone) {
  const refLayer = svgClone.querySelector('#ref-layer');
  if (refLayer) refLayer.remove();
  const domainGuide = svgClone.querySelector('#domain-guide');
  if (domainGuide) domainGuide.remove();
  const refClip = svgClone.querySelector('#ref-clip');
  if (refClip) refClip.remove();
}
```

**Step 2: Test**

1. Upload a reference, draw some strokes, auto-trace
2. Export SVG — open in a text editor, verify there's no `<image>` tag, no `#ref-layer`, no `#domain-guide`
3. Export PNG — verify the PNG contains only the symbol, not the reference underlay
4. Copy PNG — same verification

**Step 3: Commit**

```bash
git add tile-generator/src/export.js
git commit -m "fix: exclude reference image and domain guide from SVG/PNG exports"
```

---

## Task 11: Save/Load JSON with reference

Include the reference dataURL in saved JSON (with opt-out checkbox) and restore it on load.

**Files:**
- Modify: `tile-generator/index.html`
- Modify: `tile-generator/src/main.js`

**Step 1: Add "Include reference" checkbox to Export section in index.html**

In the Export section, after the export-grid div:

```html
<div class="ctrl-label" style="margin-top:6px">
  Include reference in project file
  <input type="checkbox" id="save-include-ref" checked class="ctrl-check">
</div>
```

**Step 2: Modify save handler in main.js**

```js
document.getElementById('btn-save-json').addEventListener('click', () => {
  const snap = State.snapshot();
  const includeRef = document.getElementById('save-include-ref').checked;
  if (!includeRef && snap.draw && snap.draw.reference) {
    snap.draw.reference = { ...snap.draw.reference, src: null };
  }
  saveJSON(snap);
});
```

**Step 3: Ensure loadJSON restores reference**

The existing `State.init(loaded)` already does a deep clone of the loaded state. Since `reference` is now part of `state.draw`, it will be restored automatically. But we need to handle old JSON files that don't have `reference`:

In `main.js`, update the JSON load handler:

```js
document.getElementById('json-input').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const loaded = await loadJSON(f);
    // Backfill reference if missing (old files)
    if (loaded.draw && !loaded.draw.reference) {
      loaded.draw.reference = { ...INITIAL.draw.reference };
    }
    State.init(loaded);
  } catch (err) {
    console.error('Failed to load JSON:', err);
  }
  e.target.value = '';
});
```

**Step 4: Test**

1. Upload a reference, draw strokes, auto-trace
2. Save JSON with "Include reference" checked — verify the JSON file contains the dataURL in `draw.reference.src`
3. Clear everything (or reload), Load JSON — reference image should reappear with transforms, strokes restored
4. Save JSON with "Include reference" unchecked — verify `draw.reference.src` is null in the file
5. Load an OLD json file (without reference field) — should load without errors

**Step 5: Commit**

```bash
git add tile-generator/index.html tile-generator/src/main.js
git commit -m "feat: save/load reference image in project JSON with opt-out checkbox"
```

---

## Task 12: Drag-and-drop for reference upload + polish

Add drag-and-drop support to the canvas area for reference images and final UX polish.

**Files:**
- Modify: `tile-generator/src/main.js`
- Modify: `tile-generator/styles.css`

**Step 1: Add drag-drop on the SVG canvas for reference images**

In `main.js`:

```js
// ---- Drag-drop reference image onto canvas ----
svgEl.parentElement.addEventListener('dragover', e => {
  if (State.get().engine !== 'draw') return;
  e.preventDefault();
  svgEl.parentElement.classList.add('ref-drag-over');
});
svgEl.parentElement.addEventListener('dragleave', () => {
  svgEl.parentElement.classList.remove('ref-drag-over');
});
svgEl.parentElement.addEventListener('drop', e => {
  svgEl.parentElement.classList.remove('ref-drag-over');
  if (State.get().engine !== 'draw') return;
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    loadReferenceImage(file);
  }
});
```

**Step 2: Add drag-over visual feedback style**

```css
.preview.ref-drag-over svg {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
}
```

**Step 3: Test end-to-end**

Walk through the full Definition of Done checklist:

1. Upload a PNG/JPG tile → appears as faint, transformable underlay; all controls work
2. Drawing over reference uses live symmetry; domain guide shows wedge and updates with symmetry mode
3. AUTO-TRACE vectorizes reference into editable strokes in one click; brush/erase/undo/symmetry all work on them
4. `silhouette` gives filled shapes, `outline` gives stroked lines; all trace controls affect the result
5. Fold with symmetry ON traces only the domain wedge and replicates; OFF shows whole traced tile
6. Re-trace replaces prior trace; Clear trace removes only traced strokes
7. SVG and PNG exports contain only the symbol; Save/Load JSON round-trips guide + strokes; zero new dependencies

**Step 4: Commit**

```bash
git add tile-generator/src/main.js tile-generator/styles.css
git commit -m "feat: add drag-drop reference upload and UX polish"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Export imageTile.js pipeline internals | `imageTile.js` |
| 2 | Add reference state + SVG layers | `main.js`, `engineDraw.js` |
| 3 | Reference image rendering | `engineDraw.js`, `main.js` |
| 4 | Reference upload UI + controls | `index.html`, `styles.css`, `main.js` |
| 5 | Move-reference pointer mode | `engineDraw.js`, `main.js` |
| 6 | Fundamental-domain guide overlay | `engineDraw.js`, `main.js` |
| 7 | Auto-trace core (reference → strokes) | `engineDraw.js` |
| 8 | Auto-trace UI (TRACE subsection) | `index.html`, `styles.css`, `main.js` |
| 9 | Make autoTrace async | `engineDraw.js`, `main.js` |
| 10 | Export safety (strip ref from SVG/PNG) | `export.js` |
| 11 | Save/Load JSON with reference | `index.html`, `main.js` |
| 12 | Drag-drop + polish | `main.js`, `styles.css` |
