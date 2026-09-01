// symmetry.js — transform math for symmetry groups
// Matrices stored as [a, b, c, d] for 2x2: new_x = a*x + b*y, new_y = c*x + d*y

export function transformsFor(mode) {
  switch (mode) {
    case 'mirror':  return mirror();
    case 'rot4':    return rotations(4);
    case 'rot6':    return rotations(6);
    case 'rot8':    return rotations(8);
    case 'd4':      return dihedral4();
    default:        return [ident()];
  }
}

export function apply(m, x, y) {
  return [m[0] * x + m[1] * y, m[2] * x + m[3] * y];
}

function ident() { return [1, 0, 0, 1]; }

function rot(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c, -s, s, c];
}

function rotations(n) {
  return Array.from({ length: n }, (_, k) => rot(k * 2 * Math.PI / n));
}

function mirror() {
  return [ident(), [-1, 0, 0, 1]];
}

function dihedral4() {
  const rots = rotations(4);
  const ref = [-1, 0, 0, 1];
  const reflected = rots.map(m => mul(ref, m));
  return [...rots, ...reflected];
}

function mul(a, b) {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ];
}
