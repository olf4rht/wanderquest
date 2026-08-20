// engineDraw.js — Engine A: draw-symmetry
// Live fluid strokes with Catmull-Rom smoothing + rAF rendering

import * as State from './state.js';
import { transformsFor, apply } from './symmetry.js';

const NS = 'http://www.w3.org/2000/svg';

let svg, symbolG, committedG, liveG;
let refLayerG, domainGuideG;
let drawing = false;
let rawPoints = [];
let liveEls = [];
let tool = 'brush';
let rafId = null;
let dirty = false;

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

      const d = smoothPath(pts, s.draw.solid, stroke.w);
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', d);
      if (s.draw.solid) {
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
