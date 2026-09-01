// city.js — city config (only Sidi Bou Said in V1)

export const CITY = {
  sidi_bou_said: {
    name: "Sidi Bou Sa\u00efd",
    inks: ["#1B3A8B"],
    bg: "#F4F1E9",
    defaults: {
      engine: "draw",
      draw: { symmetry: "d4", grid: 0, strokeWidth: 14, solid: true, smoothing: 40 },
      math: {
        N: 6,
        rule: "mod_add",
        legend: [
          { id: 0, motif: "eight_star_quadrant", ink: 0 },
          { id: 1, motif: "diag_split", ink: 0 },
          { id: 2, motif: "dot", ink: 0 },
        ],
      },
    },
    motifs: [
      "door-nail 8-point star",
      "crescent",
      "khomsa (hand of Fatima)",
      "moucharabieh lattice",
      "horseshoe arch",
    ],
  },
};
