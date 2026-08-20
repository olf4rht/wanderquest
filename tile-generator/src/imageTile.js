// imageTile.js — image → flat silhouette tile extraction (client-side, zero deps)

const MAX_DIM = 256;

/**
 * Full extraction pipeline.
 * @param {HTMLImageElement} img
 * @param {object} opts
 * @returns {{ d: string, empty: boolean }}
 */
export function extract(img, opts = {}) {
  const {
    threshold = 128, invert = false, keepHoles = false,
    detail = 50, smooth = false, anchor = 'center',
  } = opts;

  const { imageData, w, h } = rasterize(img);
  const mask = binarize(imageData, w, h, threshold, invert);
  cleanMask(mask, w, h, keepHoles);

  if (!mask.some(v => v)) return { d: '', empty: true };

  const contours = traceContours(mask, w, h);
  if (contours.length === 0) return { d: '', empty: true };

  // detail 100 = faithful (small epsilon), 0 = very simplified (large epsilon)
  const eps = 0.3 + (100 - detail) * 0.06;
  const simplified = contours.map(c => rdp(c, eps)).filter(c => c.length >= 3);
  if (simplified.length === 0) return { d: '', empty: true };

  const d = buildPath(simplified, smooth, anchor);
  return { d, empty: false };
}

/**
 * Render a unit-cell path into a preview SVG element.
 */
export function renderPreview(svgEl, pathD, ink, bg) {
  const NS = 'http://www.w3.org/2000/svg';
  svgEl.innerHTML = '';
  const rect = document.createElementNS(NS, 'rect');
  rect.setAttribute('width', '1');
  rect.setAttribute('height', '1');
  rect.setAttribute('fill', bg || '#F4F1E9');
  svgEl.appendChild(rect);

  if (pathD) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', ink || '#1B3A8B');
    svgEl.appendChild(path);
  }
}

// =============================================
// 1. Rasterize & downscale
// =============================================

export function rasterize(img) {
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  return { imageData: ctx.getImageData(0, 0, w, h), w, h };
}

// =============================================
// 2. Binarize
// =============================================

export function binarize(imageData, w, h, threshold, invert) {
  const data = imageData.data;
  const mask = new Uint8Array(w * h);

  // Detect meaningful alpha
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) { hasAlpha = true; break; }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let val;
      if (hasAlpha) {
        val = data[i + 3] > 128 ? 1 : 0;
      } else {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        val = lum < threshold ? 1 : 0;
      }
      if (invert) val = 1 - val;
      mask[y * w + x] = val;
    }
  }
  return mask;
}

// =============================================
// 3. Clean — largest component + fill holes
// =============================================

export function cleanMask(mask, w, h, keepHoles) {
  // Label connected components via flood fill
  const labels = new Int32Array(w * h).fill(-1);
  const sizes = [];
  let nextLabel = 0;

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0 || labels[i] >= 0) continue;

    const label = nextLabel++;
    const stack = [i];
    labels[i] = label;
    let size = 0;

    while (stack.length > 0) {
      const ci = stack.pop();
      size++;
      const cx = ci % w, cy = (ci - cx) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        if (mask[ni] === 1 && labels[ni] < 0) {
          labels[ni] = label;
          stack.push(ni);
        }
      }
    }
    sizes.push(size);
  }

  if (sizes.length === 0) return;

  // Keep only largest
  let maxLabel = 0;
  for (let i = 1; i < sizes.length; i++) {
    if (sizes[i] > sizes[maxLabel]) maxLabel = i;
  }
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1 && labels[i] !== maxLabel) mask[i] = 0;
  }

  // Fill interior holes
  if (!keepHoles) {
    const reachable = new Uint8Array(w * h);
    const stack = [];

    // Seed from border background pixels
    for (let x = 0; x < w; x++) {
      seed(x, 0);
      seed(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
      seed(0, y);
      seed(w - 1, y);
    }

    function seed(x, y) {
      const i = y * w + x;
      if (mask[i] === 0 && !reachable[i]) { reachable[i] = 1; stack.push(i); }
    }

    while (stack.length > 0) {
      const ci = stack.pop();
      const cx = ci % w, cy = (ci - cx) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        if (mask[ni] === 0 && !reachable[ni]) {
          reachable[ni] = 1;
          stack.push(ni);
        }
      }
    }

    // Interior holes = unreachable background
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0 && !reachable[i]) mask[i] = 1;
    }
  }
}

// =============================================
// 4. Marching squares contour tracing
// =============================================

// Edge indices: 0=top, 1=right, 2=bottom, 3=left
// Offsets relative to cell top-left corner (col, row)
const EDGE_DX = [0.5, 1, 0.5, 0];
const EDGE_DY = [0, 0.5, 1, 0.5];

// Lookup: case → list of [edgeA, edgeB] segments
const MS_TABLE = [
  [],              // 0
  [[3, 2]],        // 1
  [[2, 1]],        // 2
  [[3, 1]],        // 3
  [[1, 0]],        // 4
  [[3, 0], [2, 1]],// 5  saddle
  [[2, 0]],        // 6
  [[3, 0]],        // 7
  [[0, 3]],        // 8
  [[0, 2]],        // 9
  [[0, 1], [3, 2]],// 10 saddle
  [[0, 1]],        // 11
  [[1, 3]],        // 12
  [[1, 2]],        // 13
  [[2, 3]],        // 14
  [],              // 15
];

export function traceContours(mask, w, h) {
  function px(x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return 0;
    return mask[y * w + x];
  }

  // Generate all line segments
  const segments = [];
  for (let row = -1; row < h; row++) {
    for (let col = -1; col < w; col++) {
      const tl = px(col, row), tr = px(col + 1, row);
      const bl = px(col, row + 1), br = px(col + 1, row + 1);
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;

      for (const [ea, eb] of MS_TABLE[c]) {
        segments.push([
          [col + EDGE_DX[ea], row + EDGE_DY[ea]],
          [col + EDGE_DX[eb], row + EDGE_DY[eb]],
        ]);
      }
    }
  }

  return chainSegments(segments);
}

function chainSegments(segments) {
  if (segments.length === 0) return [];

  // Use fixed-precision keys to avoid floating point mismatches
  const key = ([x, y]) => `${(x * 2) | 0},${(y * 2) | 0}`;

  // Adjacency: point → list of { pt, key, used }
  const adj = new Map();
  for (const [a, b] of segments) {
    const ka = key(a), kb = key(b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    const ea = { pt: b, key: kb, used: false };
    const eb = { pt: a, key: ka, used: false };
    // Cross-link so we can mark both directions
    ea.twin = eb;
    eb.twin = ea;
    adj.get(ka).push(ea);
    adj.get(kb).push(eb);
  }

  const contours = [];

  for (const [startKey, edges] of adj) {
    for (const startEdge of edges) {
      if (startEdge.used) continue;

      const contour = [];
      let curKey = startKey;
      let curEdge = startEdge;

      while (curEdge && !curEdge.used) {
        curEdge.used = true;
        if (curEdge.twin) curEdge.twin.used = true;
        contour.push(curEdge.pt);
        curKey = curEdge.key;

        // Find next unused edge from this point
        const nextEdges = adj.get(curKey);
        curEdge = null;
        if (nextEdges) {
          for (const e of nextEdges) {
            if (!e.used) { curEdge = e; break; }
          }
        }
      }

      if (contour.length >= 3) contours.push(contour);
    }
  }

  return contours;
}

// =============================================
// 5. RDP simplification
// =============================================

export function rdp(points, epsilon) {
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

// =============================================
// 6 & 7. Path building + normalization
// =============================================

function buildPath(contours, smooth, anchor) {
  // Bounding box of all contours
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours) {
    for (const [x, y] of c) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const pad = 0.04;
  const usable = 1 - pad * 2;

  // Transform function: image coords → unit cell coords
  let xform;

  if (anchor === 'edges') {
    // Anisotropic: stretch to fill
    xform = ([x, y]) => [
      pad + (x - minX) / bw * usable,
      pad + (y - minY) / bh * usable,
    ];
  } else {
    // Uniform scale, positioned by anchor
    const scale = usable / Math.max(bw, bh);
    const sw = bw * scale, sh = bh * scale;
    let tx, ty;
    switch (anchor) {
      case 'top':    tx = (1 - sw) / 2; ty = pad; break;
      case 'bottom': tx = (1 - sw) / 2; ty = 1 - pad - sh; break;
      case 'left':   tx = pad;           ty = (1 - sh) / 2; break;
      case 'right':  tx = 1 - pad - sw;  ty = (1 - sh) / 2; break;
      default:       tx = (1 - sw) / 2;  ty = (1 - sh) / 2; break; // center
    }
    xform = ([x, y]) => [tx + (x - minX) * scale, ty + (y - minY) * scale];
  }

  return contours.map(c => {
    const pts = c.map(xform);
    return smooth ? smoothContour(pts) : straightContour(pts);
  }).join(' ');
}

function straightContour(pts) {
  if (pts.length < 2) return '';
  return `M${f(pts[0][0])},${f(pts[0][1])}` +
    pts.slice(1).map(([x, y]) => ` L${f(x)},${f(y)}`).join('') + ' Z';
}

function smoothContour(pts) {
  if (pts.length < 3) return straightContour(pts);

  const p = [pts[pts.length - 1], ...pts, pts[0], pts[1]];
  let d = `M${f(p[1][0])},${f(p[1][1])}`;

  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + ' Z';
}

function f(n) { return n.toFixed(4); }
