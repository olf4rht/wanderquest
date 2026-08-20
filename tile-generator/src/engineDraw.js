// engineDraw.js — Engine A: draw-symmetry
// Live fluid strokes with Catmull-Rom smoothing + rAF rendering

import * as State from './state.js';
import { transformsFor, apply } from './symmetry.js';
import { binarize, cleanMask, traceContours, rdp as imgRdp } from './imageTile.js';

const NS = 'http://www.w3.org/2000/svg';

let svg, symbolG, committedG, liveG;
let refLayerG, domainGuideG;
let drawing = false;
let rawPoints = [];
let liveEls = [];
let tool = 'brush';
let rafId = null;
let dirty = false;

// Move-reference mode
let refMoveMode = false;
let refDragStart = null;
let refDragOrigin = null;

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

export function destroy() {
  if (!svg) return;
  svg.removeEventListener('pointerdown', onDown);
  svg.removeEventListener('pointermove', onMove);
  svg.removeEventListener('pointerup', onUp);
  svg.removeEventListener('pointerleave', onUp);
}

export function setTool(t) { tool = t; }
export function getTool() { return tool; }

export function setRefMoveMode(on) { refMoveMode = on; }
export function getRefMoveMode() { return refMoveMode; }

export function undo() {
  const s = State.get();
  if (s.draw.strokes.length === 0) return;
  State.merge('draw', { strokes: s.draw.strokes.slice(0, -1) });
}

export function clear() {
  State.merge('draw', { strokes: [] });
}

// =========================================================
// Pointer handling
// =========================================================

function svgCoord(e) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const ctm = svg.getScreenCTM().inverse();
  const t = pt.matrixTransform(ctm);
  return [t.x, t.y];
}

function snap(x, y) {
  const g = State.get().draw.grid;
  if (!g) return [x, y];
  const sp = State.get().size / g;
  return [Math.round(x / sp) * sp, Math.round(y / sp) * sp];
}

function toCenter(x, y) {
  const h = State.get().size / 2;
  return [x - h, y - h];
}

function onDown(e) {
  if (State.get().engine !== 'draw') return;

  // Move-reference mode
  if (refMoveMode) {
    const ref = State.get().draw.reference;
    if (!ref.src || ref.locked) return;
    svg.setPointerCapture(e.pointerId);
    const [mx, my] = svgCoord(e);
    refDragStart = { x: mx, y: my };
    refDragOrigin = { x: ref.x, y: ref.y };
    return;
  }

  if (tool === 'erase') { eraseAt(e); return; }

  drawing = true;
  svg.setPointerCapture(e.pointerId);
  const [sx, sy] = snap(...svgCoord(e));
  rawPoints = [toCenter(sx, sy)];

  // Create live stroke elements (one per symmetry transform)
  const s = State.get();
  const transforms = transformsFor(s.draw.symmetry);
  liveG.innerHTML = '';
  liveEls = transforms.map(() => {
    const el = document.createElementNS(NS, 'path');
    if (s.draw.solid) {
      el.setAttribute('fill', s.inks[0]);
      el.setAttribute('stroke', 'none');
    } else {
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', s.inks[0]);
      el.setAttribute('stroke-width', s.draw.strokeWidth);
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('stroke-linejoin', 'round');
    }
    el.setAttribute('opacity', '0.6');
    liveG.appendChild(el);
    return el;
  });

  dirty = true;
  rafLoop();
}

function onMove(e) {
  // Move-reference mode
  if (refMoveMode && refDragStart) {
    const [mx, my] = svgCoord(e);
    const dx = mx - refDragStart.x;
    const dy = my - refDragStart.y;
    const ref = State.get().draw.reference;
    State.merge('draw', { reference: { ...ref, x: refDragOrigin.x + dx, y: refDragOrigin.y + dy } });
    return;
  }

  if (!drawing) return;
  const [sx, sy] = snap(...svgCoord(e));
  const p = toCenter(sx, sy);

  // Min distance filter to avoid duplicate points
  const last = rawPoints[rawPoints.length - 1];
  if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return;

  rawPoints.push(p);
  dirty = true;
}

function rafLoop() {
  if (dirty) {
    updateLiveStroke();
    dirty = false;
  }
  if (drawing) {
    rafId = requestAnimationFrame(rafLoop);
  }
}

function updateLiveStroke() {
  const s = State.get();
  const transforms = transformsFor(s.draw.symmetry);
  const half = s.size / 2;
  const eps = (s.draw.smoothing || 0) * 0.05 + 0.5;
  const thinned = rawPoints.length > 3 ? rdp(rawPoints, eps) : rawPoints;

  transforms.forEach((m, i) => {
    if (!liveEls[i]) return;
    const pts = thinned.map(([x, y]) => {
      const [tx, ty] = apply(m, x, y);
      return [tx + half, ty + half];
    });
    const d = smoothPath(pts, s.draw.solid, s.draw.strokeWidth);
    liveEls[i].setAttribute('d', d);
  });
}

function onUp() {
  // Move-reference mode
  if (refMoveMode && refDragStart) {
    refDragStart = null;
    refDragOrigin = null;
    return;
  }

  if (!drawing) return;
  drawing = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  // Clear live elements
  liveG.innerHTML = '';
  liveEls = [];

  if (rawPoints.length > 1) {
    const s = State.get();
    const stroke = { points: rawPoints.map(p => [...p]), w: s.draw.strokeWidth };
    State.merge('draw', { strokes: [...s.draw.strokes, stroke] });
  }
  rawPoints = [];
  dirty = false;
}

function eraseAt(e) {
  const [ex, ey] = toCenter(...svgCoord(e));
  const s = State.get();
  const radius = s.size / 20;
  let minDist = Infinity, minIdx = -1;

  s.draw.strokes.forEach((stroke, si) => {
    stroke.points.forEach(([px, py]) => {
      const d = Math.hypot(px - ex, py - ey);
      if (d < minDist) { minDist = d; minIdx = si; }
    });
  });

  if (minIdx >= 0 && minDist < radius) {
    State.merge('draw', { strokes: s.draw.strokes.filter((_, i) => i !== minIdx) });
  }
}

// =========================================================
// Render reference image
// =========================================================

export function renderReference(s) {
  refLayerG.innerHTML = '';
  const ref = s.draw.reference;
  if (!ref.src || !ref.visible) return;

  const h = s.size / 2;
  const defs = svg.querySelector('defs');

  // Ensure clip path exists
  let clip = defs.querySelector('#ref-clip');
  if (!clip) {
    clip = document.createElementNS(NS, 'clipPath');
    clip.setAttribute('id', 'ref-clip');
    const clipRect = document.createElementNS(NS, 'rect');
    clipRect.setAttribute('x', '0');
    clipRect.setAttribute('y', '0');
    clipRect.setAttribute('width', s.size);
    clipRect.setAttribute('height', s.size);
    clip.appendChild(clipRect);
    defs.appendChild(clip);
  }

  const img = document.createElementNS(NS, 'image');
  img.setAttribute('href', ref.src);
  img.setAttribute('width', s.size);
  img.setAttribute('height', s.size);
  img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  img.setAttribute('opacity', ref.opacity);

  const flipH = ref.flipH ? -ref.scale : ref.scale;
  const scaleY = ref.scale;
  const tx = ref.x + h;
  const ty = ref.y + h;
  img.setAttribute('transform',
    `translate(${tx},${ty}) rotate(${ref.rotate}) scale(${flipH},${scaleY}) translate(${-h},${-h})`
  );

  if (ref.desaturate) {
    img.setAttribute('filter', 'saturate(0)');
  }

  refLayerG.setAttribute('clip-path', 'url(#ref-clip)');
  refLayerG.appendChild(img);
}

// =========================================================
// Render fundamental domain guide overlay
// =========================================================

export function renderDomainGuide(s) {
  domainGuideG.innerHTML = '';
  const ref = s.draw.reference;
  if (!ref.showDomain || !ref.src) return;

  const h = s.size / 2;
  const sym = s.draw.symmetry;
  const lineAttrs = {
    stroke: '#1B3A8B',
    'stroke-opacity': '0.2',
    'stroke-width': '1.5',
    'stroke-dasharray': '6,4',
    fill: 'none',
  };

  function makeLine(x1, y1, x2, y2) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    for (const [k, v] of Object.entries(lineAttrs)) l.setAttribute(k, v);
    domainGuideG.appendChild(l);
  }

  function makeWedgePath(d) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', '#1B3A8B');
    p.setAttribute('fill-opacity', '0.05');
    domainGuideG.appendChild(p);
  }

  // Helper: point on circle at angle (0 = right, angles in radians)
  function pt(angle, r) {
    return [h + r * Math.cos(angle), h + r * Math.sin(angle)];
  }

  const r = h; // radius to edge

  if (sym === 'mirror') {
    // Vertical axis
    makeLine(h, 0, h, s.size);
    // Left half is the domain
    makeWedgePath(`M${h},0 L0,0 L0,${s.size} L${h},${s.size} Z`);

  } else if (sym === 'rot4') {
    // Cross: vertical + horizontal
    makeLine(h, 0, h, s.size);
    makeLine(0, h, s.size, h);
    // Top-right 90deg wedge (12 o'clock to 3 o'clock)
    makeWedgePath(`M${h},${h} L${h},0 L${s.size},0 L${s.size},${h} Z`);

  } else if (sym === 'rot6') {
    // 6 radial lines
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI / 2 + i * (Math.PI / 3);
      const [ex, ey] = pt(angle, r);
      makeLine(h, h, ex, ey);
    }
    // 60deg wedge from 12 o'clock
    const a0 = -Math.PI / 2;
    const a1 = a0 + Math.PI / 3;
    const [x0, y0] = pt(a0, r);
    const [x1, y1] = pt(a1, r);
    makeWedgePath(`M${h},${h} L${x0},${y0} L${x1},${y1} Z`);

  } else if (sym === 'rot8') {
    // 8 radial lines
    for (let i = 0; i < 8; i++) {
      const angle = -Math.PI / 2 + i * (Math.PI / 4);
      const [ex, ey] = pt(angle, r);
      makeLine(h, h, ex, ey);
    }
    // 45deg wedge from 12 o'clock
    const a0 = -Math.PI / 2;
    const a1 = a0 + Math.PI / 4;
    const [x0, y0] = pt(a0, r);
    const [x1, y1] = pt(a1, r);
    makeWedgePath(`M${h},${h} L${x0},${y0} L${x1},${y1} Z`);

  } else if (sym === 'd4') {
    // Cross + diagonals (4 axes = 8 lines)
    makeLine(h, 0, h, s.size);
    makeLine(0, h, s.size, h);
    makeLine(0, 0, s.size, s.size);
    makeLine(s.size, 0, 0, s.size);
    // 45deg wedge from 12 o'clock
    const a0 = -Math.PI / 2;
    const a1 = a0 + Math.PI / 4;
    const [x0, y0] = pt(a0, r);
    const [x1, y1] = pt(a1, r);
    makeWedgePath(`M${h},${h} L${x0},${y0} L${x1},${y1} Z`);
  }
}

// =========================================================
// Auto-trace: vectorize reference image into draw strokes
// =========================================================

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function clipMaskToDomain(mask, w, h, symmetry) {
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const angle = Math.atan2(dy, dx);
      let keep = true;
      switch (symmetry) {
        case 'mirror':
          keep = x <= cx;
          break;
        case 'rot4':
          // 90° wedge from 12 o'clock: angle in [-PI/2, 0]
          keep = angle >= -Math.PI / 2 && angle <= 0;
          break;
        case 'rot6':
          // 60° wedge from 12 o'clock: angle in [-PI/2, -PI/2 + PI/3]
          keep = angle >= -Math.PI / 2 && angle <= -Math.PI / 2 + Math.PI / 3;
          break;
        case 'rot8':
          // 45° wedge from 12 o'clock: angle in [-PI/2, -PI/2 + PI/4]
          keep = angle >= -Math.PI / 2 && angle <= -Math.PI / 2 + Math.PI / 4;
          break;
        case 'd4':
          // 45° wedge from 12 o'clock
          keep = angle >= -Math.PI / 2 && angle <= -Math.PI / 2 + Math.PI / 4;
          break;
      }
      if (!keep) mask[y * w + x] = 0;
    }
  }
  return mask;
}

export async function autoTrace(opts = {}) {
  const s = State.get();
  const ref = s.draw.reference;
  if (!ref.src) return null;

  const {
    threshold = 128, invert = false, keepHoles = false,
    detail = 50, smooth = false, traceMode = 'silhouette',
    foldWithSymmetry = false,
  } = opts;

  const img = await loadImage(ref.src);
  if (!img) return null;

  // Rasterize to canvas (max 256px, preserving aspect ratio)
  const maxDim = 256;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

  const mask = binarize(imageData, w, h, threshold, invert);

  if (foldWithSymmetry) {
    clipMaskToDomain(mask, w, h, s.draw.symmetry);
  }

  cleanMask(mask, w, h, keepHoles);

  if (!mask.some(v => v)) return null;

  const contours = traceContours(mask, w, h);
  if (contours.length === 0) return null;

  const eps = 0.3 + (100 - detail) * 0.06;
  const simplified = contours.map(c => imgRdp(c, eps)).filter(c => c.length >= 3);
  if (simplified.length === 0) return null;

  // Convert pixel-space contours to center-relative SVG-space stroke objects
  const size = s.size;
  const half = size / 2;
  const strokeWidth = s.draw.strokeWidth;

  const strokes = simplified.map(contour => {
    const points = contour.map(([px, py]) => [
      (px / w) * size - half,
      (py / h) * size - half,
    ]);
    return {
      points,
      w: strokeWidth,
      fromTrace: true,
      closed: true,
      traceMode,
    };
  });

  return strokes;
}

export function clearTrace() {
  const s = State.get();
  State.merge('draw', { strokes: s.draw.strokes.filter(st => !st.fromTrace) });
}

// =========================================================
// Render committed strokes (called from state subscriber)
// =========================================================

export function render(s) {
  committedG.innerHTML = '';
  const transforms = transformsFor(s.draw.symmetry);
  const half = s.size / 2;
  const eps = (s.draw.smoothing || 0) * 0.05 + 0.5;

  s.draw.strokes.forEach(stroke => {
    const thinned = stroke.points.length > 3 ? rdp(stroke.points, eps) : stroke.points;

    transforms.forEach(m => {
      const pts = thinned.map(([x, y]) => {
        const [tx, ty] = apply(m, x, y);
        return [tx + half, ty + half];
      });

      // Determine fill mode: trace strokes have their own mode
      const isSilhouette = stroke.traceMode === 'silhouette';
      const isOutline = stroke.traceMode === 'outline';
      const useSolid = isSilhouette || (!isOutline && s.draw.solid);
      const forceClosed = stroke.closed || isSilhouette;

      const d = smoothPath(pts, forceClosed, stroke.w);
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', d);
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
      committedG.appendChild(el);
    });
  });
}

// =========================================================
// Geometry: Catmull-Rom smoothing + RDP thinning
// =========================================================

/**
 * Build a smooth SVG path from points using Catmull-Rom → cubic Bézier.
 * If solid=true, close the path. Auto-close if endpoints are near.
 */
function smoothPath(points, solid, strokeWidth) {
  if (points.length === 0) return '';
  if (points.length === 1) {
    // Single dot
    const [x, y] = points[0];
    return `M${f(x)},${f(y)} l0.1,0`;
  }
  if (points.length === 2) {
    const [[x1, y1], [x2, y2]] = points;
    let d = `M${f(x1)},${f(y1)} L${f(x2)},${f(y2)}`;
    if (solid) d += ' Z';
    return d;
  }

  // Auto-close: if endpoints within strokeWidth*1.5, loop smoothly
  const first = points[0], last = points[points.length - 1];
  const gap = Math.hypot(last[0] - first[0], last[1] - first[1]);
  const autoClose = solid && gap < (strokeWidth || 14) * 1.5;

  // For a smooth closed loop, wrap points so the spline can interpolate through the seam
  const p = autoClose
    ? [points[points.length - 1], ...points, points[0], points[1]]
    : points;

  const startIdx = autoClose ? 1 : 0;
  const endIdx = autoClose ? p.length - 2 : p.length - 1;

  let d = `M${f(p[startIdx][0])},${f(p[startIdx][1])}`;

  for (let i = startIdx; i < endIdx; i++) {
    const p0 = p[i - 1] || p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] || p2;

    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }

  if (solid) d += ' Z';
  return d;
}

function f(n) { return n.toFixed(1); }

/**
 * Ramer-Douglas-Peucker point thinning.
 * Removes points that contribute less than epsilon to the shape.
 */
function rdp(points, epsilon) {
  if (points.length <= 2) return points;

  const [sx, sy] = points[0];
  const [ex, ey] = points[points.length - 1];
  const dx = ex - sx, dy = ey - sy;
  const lenSq = dx * dx + dy * dy;
  let maxDist = 0, maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    let dist;
    if (lenSq === 0) {
      dist = Math.hypot(px - sx, py - sy);
    } else {
      // Perpendicular distance to line segment
      const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lenSq));
      dist = Math.hypot(px - (sx + t * dx), py - (sy + t * dy));
    }
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, maxIdx + 1), epsilon);
    const right = rdp(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}
