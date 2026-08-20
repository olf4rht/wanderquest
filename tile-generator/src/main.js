// main.js — bootstrap, state init, UI wiring, engine switching

import * as State from './state.js';
import { CITY } from './city.js';
import * as DrawEngine from './engineDraw.js';
import * as MathEngine from './engineMath.js';
import { MOTIF_LIST } from './engineMath.js';
import { compose } from './compose.js';
import { exportSVG, exportPNG, copyPNG, saveJSON, loadJSON } from './export.js';
import { extract, renderPreview } from './imageTile.js';

// ---- Init state from city config ----
const city = CITY.sidi_bou_said;
const def = city.defaults;

const INITIAL = {
  engine: def.engine,
  city: 'sidi_bou_said',
  size: 720,
  inks: [...city.inks],
  bg: city.bg,
  texture: { on: true, distress: 45 },
  draw: {
    grid: def.draw.grid,
    symmetry: def.draw.symmetry,
    strokeWidth: def.draw.strokeWidth,
    solid: def.draw.solid,
    smoothing: def.draw.smoothing,
    strokes: [],
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
  },
  math: {
    N: def.math.N,
    legend: def.math.legend.map(l => ({ ...l })),
    rule: def.math.rule,
    params: { rotStep: 1, seed: 0 },
    customTiles: [],
  },
};

// ---- DOM refs ----
const svgEl = document.getElementById('canvas');
const symbolG = document.getElementById('symbol');
const drawControls = document.getElementById('draw-controls');
const mathControls = document.getElementById('math-controls');

// ---- Init engines ----
DrawEngine.init(svgEl, symbolG);

// ---- Render on state change ----
State.subscribe(s => {
  compose(svgEl, s);
  if (s.engine === 'draw') {
    DrawEngine.render(s);
  } else {
    MathEngine.render(s, symbolG);
  }
  syncUI(s);
});

// ---- Wire: engine toggle ----
document.querySelectorAll('[data-engine]').forEach(btn => {
  btn.addEventListener('click', () => State.set({ engine: btn.dataset.engine }));
});

// ---- Wire: draw controls ----
on('symmetry', 'change', e => State.merge('draw', { symmetry: e.target.value }));
on('grid', 'input', e => { val('grid-val', e.target.value); State.merge('draw', { grid: int(e.target.value) }); });
on('stroke-width', 'input', e => { val('sw-val', e.target.value); State.merge('draw', { strokeWidth: int(e.target.value) }); });
on('solid', 'change', e => State.merge('draw', { solid: e.target.checked }));
on('smoothing', 'input', e => { val('smooth-val', e.target.value); State.merge('draw', { smoothing: int(e.target.value) }); });

document.getElementById('btn-brush').addEventListener('click', () => {
  DrawEngine.setTool('brush');
  updateToolButtons();
});
document.getElementById('btn-erase').addEventListener('click', () => {
  DrawEngine.setTool('erase');
  updateToolButtons();
});
document.getElementById('btn-undo').addEventListener('click', () => DrawEngine.undo());
document.getElementById('btn-clear').addEventListener('click', () => DrawEngine.clear());

// ---- Wire: math controls ----
on('grid-n', 'input', e => { val('n-val', e.target.value); State.merge('math', { N: int(e.target.value) }); });
on('rule', 'change', e => State.merge('math', { rule: e.target.value }));
on('rot-step', 'input', e => {
  val('rs-val', e.target.value);
  const s = State.get();
  State.merge('math', { params: { ...s.math.params, rotStep: int(e.target.value) } });
});
document.getElementById('btn-reroll').addEventListener('click', () => {
  const s = State.get();
  State.merge('math', { params: { ...s.math.params, seed: s.math.params.seed + 1 } });
});

// ---- Wire: palette ----
on('ink-0', 'input', e => {
  const inks = [...State.get().inks];
  inks[0] = e.target.value;
  State.set({ inks });
});
on('ink-1', 'input', e => {
  const inks = [...State.get().inks];
  while (inks.length < 2) inks.push(inks[0]);
  inks[1] = e.target.value;
  State.set({ inks });
});
on('bg-color', 'input', e => State.set({ bg: e.target.value }));

// ---- Wire: texture ----
on('texture-on', 'change', e => {
  State.set({ texture: { ...State.get().texture, on: e.target.checked } });
});
on('distress', 'input', e => {
  val('dist-val', e.target.value);
  State.set({ texture: { ...State.get().texture, distress: int(e.target.value) } });
});

// ---- Wire: export ----
document.getElementById('btn-copy-png').addEventListener('click', () => copyPNG(svgEl, State.get().size));
document.getElementById('btn-export-svg').addEventListener('click', () => exportSVG(svgEl));
document.getElementById('btn-export-png').addEventListener('click', () => exportPNG(svgEl, State.get().size));
document.getElementById('btn-save-json').addEventListener('click', () => saveJSON(State.snapshot()));
document.getElementById('btn-load-json').addEventListener('click', () => {
  document.getElementById('json-input').click();
});
document.getElementById('json-input').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const loaded = await loadJSON(f);
    State.init(loaded);
  } catch (err) {
    console.error('Failed to load JSON:', err);
  }
  e.target.value = '';
});

// ---- Legend editor ----
function allMotifNames(s) {
  const customs = (s.math.customTiles || []).map(t => t.id);
  return [...MOTIF_LIST, ...customs];
}

function motifDisplayName(name, s) {
  const custom = (s.math.customTiles || []).find(t => t.id === name);
  if (custom) return custom.source || name;
  return name.replace(/_/g, ' ');
}

function buildLegend(s) {
  const box = document.getElementById('legend-entries');
  box.innerHTML = '';
  const legend = s.math.legend;
  const motifs = allMotifNames(s);

  legend.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'legend-row';

    const idx = document.createElement('span');
    idx.className = 'legend-idx';
    idx.textContent = i;
    row.appendChild(idx);

    // motif
    const mSel = document.createElement('select');
    mSel.className = 'ctrl-select legend-select';
    motifs.forEach(m => {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = motifDisplayName(m, s);
      o.selected = m === entry.motif;
      mSel.appendChild(o);
    });
    mSel.addEventListener('change', () => {
      const leg = State.get().math.legend.map((e, j) => j === i ? { ...e, motif: mSel.value } : { ...e });
      State.merge('math', { legend: leg });
    });
    row.appendChild(mSel);

    // ink
    const iSel = document.createElement('select');
    iSel.className = 'ctrl-select legend-ink';
    s.inks.forEach((_, k) => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = `Ink ${k}`;
      o.selected = k === entry.ink;
      iSel.appendChild(o);
    });
    iSel.addEventListener('change', () => {
      const leg = State.get().math.legend.map((e, j) => j === i ? { ...e, ink: int(iSel.value) } : { ...e });
      State.merge('math', { legend: leg });
    });
    row.appendChild(iSel);

    // remove
    if (legend.length > 2) {
      const rm = document.createElement('button');
      rm.className = 'ctrl-btn sm';
      rm.textContent = '\u00d7';
      rm.addEventListener('click', () => {
        const leg = State.get().math.legend.filter((_, j) => j !== i).map((e, j) => ({ ...e, id: j }));
        State.merge('math', { legend: leg });
      });
      row.appendChild(rm);
    }

    box.appendChild(row);
  });

  // add tile (built-in)
  if (legend.length < 6) {
    const add = document.createElement('button');
    add.className = 'ctrl-btn';
    add.textContent = '+ Add tile';
    add.addEventListener('click', () => {
      const cur = State.get().math.legend;
      State.merge('math', { legend: [...cur, { id: cur.length, motif: 'solid', ink: 0 }] });
    });
    box.appendChild(add);
  }

  // add tile from image
  const imgBtn = document.createElement('button');
  imgBtn.className = 'ctrl-btn';
  imgBtn.style.marginTop = '4px';
  imgBtn.style.width = '100%';
  imgBtn.textContent = 'Add tile from image';
  imgBtn.addEventListener('click', () => openImageTilePanel());
  box.appendChild(imgBtn);

  // custom tile tray
  const customs = s.math.customTiles || [];
  if (customs.length > 0) {
    const tray = document.createElement('div');
    tray.className = 'custom-tray';
    customs.forEach(ct => {
      const chip = document.createElement('div');
      chip.className = 'custom-chip';
      // Mini SVG preview
      const mini = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      mini.setAttribute('viewBox', '0 0 1 1');
      mini.setAttribute('width', '22');
      mini.setAttribute('height', '22');
      const mPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      mPath.setAttribute('d', ct.d);
      mPath.setAttribute('fill', s.inks[ct.ink] || s.inks[0]);
      mini.appendChild(mPath);
      chip.appendChild(mini);
      const label = document.createElement('span');
      label.className = 'custom-chip-label';
      label.textContent = ct.source || ct.id;
      chip.appendChild(label);
      // Delete button
      const del = document.createElement('button');
      del.className = 'ctrl-btn sm';
      del.textContent = '\u00d7';
      del.addEventListener('click', () => {
        const cur = State.get().math.customTiles.filter(t => t.id !== ct.id);
        State.merge('math', { customTiles: cur });
      });
      chip.appendChild(del);
      tray.appendChild(chip);
    });
    box.appendChild(tray);
  }
}

// ---- Image tile panel ----
let _itPanel = null;

function openImageTilePanel() {
  if (_itPanel) _itPanel.remove();

  const NS = 'http://www.w3.org/2000/svg';
  const s = State.get();

  // Panel state
  let loadedImg = null;
  let opts = { threshold: 128, invert: false, keepHoles: false, detail: 50, smooth: false, anchor: 'center' };
  let currentD = '';

  const panel = document.createElement('div');
  panel.className = 'it-panel';
  _itPanel = panel;

  // Drop zone / file input
  const dropZone = document.createElement('div');
  dropZone.className = 'it-drop';
  dropZone.textContent = 'Drop image or click to select';
  const fileIn = document.createElement('input');
  fileIn.type = 'file';
  fileIn.accept = 'image/*';
  fileIn.hidden = true;

  dropZone.addEventListener('click', () => fileIn.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  fileIn.addEventListener('change', () => { if (fileIn.files[0]) loadFile(fileIn.files[0]); });

  panel.appendChild(dropZone);
  panel.appendChild(fileIn);

  // Preview SVG
  const previewSvg = document.createElementNS(NS, 'svg');
  previewSvg.setAttribute('viewBox', '0 0 1 1');
  previewSvg.setAttribute('width', '120');
  previewSvg.setAttribute('height', '120');
  previewSvg.style.display = 'none';
  previewSvg.style.margin = '8px auto';
  previewSvg.style.border = '1px solid var(--panel-border)';
  previewSvg.style.borderRadius = '4px';
  previewSvg.style.background = '#F4F1E9';
  panel.appendChild(previewSvg);

  // Error message
  const errMsg = document.createElement('div');
  errMsg.className = 'it-error';
  errMsg.style.display = 'none';
  panel.appendChild(errMsg);

  // Controls (hidden until image loaded)
  const controls = document.createElement('div');
  controls.className = 'it-controls';
  controls.style.display = 'none';

  // Threshold
  controls.appendChild(makeLabel('Threshold', 'it-thresh-val', opts.threshold));
  const threshSlider = makeRange(1, 255, opts.threshold, 1, v => {
    opts.threshold = int(v);
    val('it-thresh-val', v);
    rerun();
  });
  controls.appendChild(threshSlider);

  // Invert
  controls.appendChild(makeCheck('Invert', opts.invert, v => { opts.invert = v; rerun(); }));

  // Keep holes
  controls.appendChild(makeCheck('Keep holes', opts.keepHoles, v => { opts.keepHoles = v; rerun(); }));

  // Detail
  controls.appendChild(makeLabel('Detail', 'it-detail-val', opts.detail));
  const detailSlider = makeRange(0, 100, opts.detail, 5, v => {
    opts.detail = int(v);
    val('it-detail-val', v);
    rerun();
  });
  controls.appendChild(detailSlider);

  // Smooth corners
  controls.appendChild(makeCheck('Smooth corners', opts.smooth, v => { opts.smooth = v; rerun(); }));

  // Anchor
  const anchorLabel = document.createElement('div');
  anchorLabel.className = 'ctrl-label';
  anchorLabel.textContent = 'Anchor';
  controls.appendChild(anchorLabel);
  const anchorSel = document.createElement('select');
  anchorSel.className = 'ctrl-select';
  for (const a of ['center', 'top', 'bottom', 'left', 'right', 'edges']) {
    const o = document.createElement('option');
    o.value = a;
    o.textContent = a;
    o.selected = a === opts.anchor;
    anchorSel.appendChild(o);
  }
  anchorSel.addEventListener('change', () => { opts.anchor = anchorSel.value; rerun(); });
  controls.appendChild(anchorSel);

  panel.appendChild(controls);

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.className = 'tool-group';
  btnRow.style.marginTop = '10px';

  const addBtn = document.createElement('button');
  addBtn.className = 'ctrl-btn';
  addBtn.textContent = 'Add to legend';
  addBtn.disabled = true;
  addBtn.addEventListener('click', () => {
    if (!currentD) return;
    const s = State.get();
    const n = (s.math.customTiles || []).length;
    const id = `custom_${n}`;
    const tile = {
      id, kind: 'custom', d: currentD, holes: opts.keepHoles,
      anchor: opts.anchor, ink: 0, source: loadedImg._filename || 'image',
    };
    const customTiles = [...(s.math.customTiles || []), tile];
    // Also add to legend
    const legend = [...s.math.legend, { id: s.math.legend.length, motif: id, ink: 0 }];
    State.merge('math', { customTiles, legend });
    closePanel();
  });
  btnRow.appendChild(addBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'ctrl-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closePanel);
  btnRow.appendChild(cancelBtn);

  panel.appendChild(btnRow);

  // Insert into math controls
  const mathSection = document.getElementById('math-controls');
  mathSection.appendChild(panel);

  // --- helpers ---

  function loadFile(file) {
    const img = new Image();
    img._filename = file.name.replace(/\.[^.]+$/, '');
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      loadedImg = img;
      dropZone.textContent = file.name;
      controls.style.display = '';
      previewSvg.style.display = 'block';
      rerun();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showError('Could not load image.');
    };
    img.src = url;
  }

  function rerun() {
    if (!loadedImg) return;
    const result = extract(loadedImg, opts);
    if (result.empty) {
      showError("Couldn't find a clear shape \u2014 adjust Threshold / Invert.");
      addBtn.disabled = true;
      currentD = '';
      renderPreview(previewSvg, '', s.inks[0], s.bg);
    } else {
      errMsg.style.display = 'none';
      currentD = result.d;
      addBtn.disabled = false;
      renderPreview(previewSvg, currentD, s.inks[0], s.bg);
    }
  }

  function showError(msg) {
    errMsg.textContent = msg;
    errMsg.style.display = '';
  }

  function closePanel() {
    if (_itPanel) { _itPanel.remove(); _itPanel = null; }
  }

  // UI element builders
  function makeLabel(text, valId, initial) {
    const lbl = document.createElement('div');
    lbl.className = 'ctrl-label';
    lbl.innerHTML = `${text} <span class="ctrl-val" id="${valId}">${initial}</span>`;
    return lbl;
  }

  function makeRange(min, max, value, step, onChange) {
    const r = document.createElement('input');
    r.type = 'range';
    r.className = 'ctrl-range';
    r.min = min; r.max = max; r.value = value; r.step = step;
    r.addEventListener('input', () => onChange(r.value));
    return r;
  }

  function makeCheck(label, checked, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-label';
    wrap.textContent = label;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'ctrl-check';
    cb.checked = checked;
    cb.addEventListener('change', () => onChange(cb.checked));
    wrap.appendChild(cb);
    return wrap;
  }
}

// ---- Sync UI to state ----
function syncUI(s) {
  // Engine toggle
  document.querySelectorAll('[data-engine]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.engine === s.engine);
  });
  drawControls.hidden = s.engine !== 'draw';
  mathControls.hidden = s.engine !== 'math';
  svgEl.style.cursor = s.engine === 'draw' ? 'crosshair' : 'default';

  // Slider displays
  val('grid-val', s.draw.grid || 'OFF');
  val('sw-val', s.draw.strokeWidth);
  val('smooth-val', s.draw.smoothing);
  val('n-val', s.math.N);
  val('rs-val', s.math.params.rotStep);
  val('dist-val', s.texture.distress);

  // Legend
  buildLegend(s);

  updateToolButtons();
}

function updateToolButtons() {
  const t = DrawEngine.getTool();
  document.getElementById('btn-brush').classList.toggle('active', t === 'brush');
  document.getElementById('btn-erase').classList.toggle('active', t === 'erase');
}

// ---- Helpers ----
function on(id, evt, fn) { document.getElementById(id).addEventListener(evt, fn); }
function val(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function int(v) { return parseInt(v, 10); }

// ---- Boot ----
State.init(INITIAL);
