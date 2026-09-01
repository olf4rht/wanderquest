// engineMath.js — Engine B: math-rule tessellation

// --- motif primitives (unit cell 0,0 → 1,1) ---

const MOTIFS = {
  solid(ink) {
    const p = doc('path');
    p.setAttribute('d', 'M0,0 L1,0 L1,1 L0,1 Z');
    p.setAttribute('fill', ink);
    return p;
  },
  diag_split(ink) {
    const p = doc('path');
    p.setAttribute('d', 'M0,0 L1,0 L1,1 Z');
    p.setAttribute('fill', ink);
    return p;
  },
  quarter_disc(ink) {
    const p = doc('path');
    p.setAttribute('d', 'M0,0 L1,0 A1,1 0 0,1 0,1 Z');
    p.setAttribute('fill', ink);
    return p;
  },
  dot(ink) {
    const c = doc('circle');
    c.setAttribute('cx', '0.5');
    c.setAttribute('cy', '0.5');
    c.setAttribute('r', '0.28');
    c.setAttribute('fill', ink);
    return c;
  },
  leaf(ink) {
    const p = doc('path');
    p.setAttribute('d', 'M0.5,0.08 Q0.92,0.5 0.5,0.92 Q0.08,0.5 0.5,0.08 Z');
    p.setAttribute('fill', ink);
    return p;
  },
  eight_star_quadrant(ink) {
    // One quadrant of an 8-pointed star centered at (0,0) corner of cell.
    // Four cells meeting at a corner assemble the full star.
    const R = 0.88, r = 0.36;
    const c1 = r * Math.cos(Math.PI / 8), s1 = r * Math.sin(Math.PI / 8);
    const c2 = R * Math.cos(Math.PI / 4), s2 = R * Math.sin(Math.PI / 4);
    const c3 = r * Math.cos(3 * Math.PI / 8), s3 = r * Math.sin(3 * Math.PI / 8);
    const d = `M0,0 L${R},0 L${c1.toFixed(3)},${s1.toFixed(3)} L${c2.toFixed(3)},${s2.toFixed(3)} L${c3.toFixed(3)},${s3.toFixed(3)} L0,${R} Z`;
    const p = doc('path');
    p.setAttribute('d', d);
    p.setAttribute('fill', ink);
    return p;
  },
};

export const MOTIF_LIST = Object.keys(MOTIFS);

function doc(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

// --- rules ---

function modAdd(row, col, K) {
  return { tileIndex: (row + col) % K, rot: 0 };
}

function rotation(row, col, K, rotStep) {
  return { tileIndex: row % K, rot: ((row * rotStep + col * rotStep)) % 4 };
}

function checker(row, col) {
  return { tileIndex: (row + col) % 2, rot: (row + col) % 2 === 1 ? 2 : 0 };
}

function substitution(row, col, K) {
  const bRow = Math.floor(row / K);
  const bCol = Math.floor(col / K);
  const parent = (bRow + bCol) % K;
  const sRow = row % K;
  const sCol = col % K;
  return { tileIndex: (parent + sRow + sCol) % K, rot: (sRow + sCol) % 4 };
}

function applyRule(rule, row, col, K, params) {
  switch (rule) {
    case 'mod_add':      return modAdd(row, col, K);
    case 'rotation':     return rotation(row, col, K, params.rotStep || 1);
    case 'checker':      return checker(row, col);
    case 'substitution': return substitution(row, col, K);
    default:             return modAdd(row, col, K);
  }
}

// --- seed-based legend permutation ---

function permute(legend, seed) {
  if (seed === 0) return legend;
  const idx = legend.map((_, i) => i);
  let s = seed;
  for (let i = idx.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.map(i => legend[i]);
}

// --- render ---

export function render(s, symbolG) {
  symbolG.innerHTML = '';

  const { N, legend, rule, params } = s.math;
  const K = legend.length;
  if (K === 0) return;
  const cs = s.size / N;
  const perm = permute(legend, params.seed || 0);

  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const { tileIndex, rot } = applyRule(rule, row, col, K, params);
      const tile = perm[tileIndex % K];
      const ink = s.inks[tile.ink] || s.inks[0];

      const g = doc('g');
      g.setAttribute('transform',
        `translate(${col * cs},${row * cs}) scale(${cs}) translate(0.5,0.5) rotate(${rot * 90}) translate(-0.5,-0.5)`
      );

      const motifFn = MOTIFS[tile.motif];
      if (motifFn) {
        g.appendChild(motifFn(ink));
      } else {
        // Custom tile — look up path data
        const custom = (s.math.customTiles || []).find(t => t.id === tile.motif);
        if (!custom) continue;
        const p = doc('path');
        p.setAttribute('d', custom.d);
        p.setAttribute('fill', ink);
        g.appendChild(p);
      }

      symbolG.appendChild(g);
    }
  }
}
