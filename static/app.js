// static/app.js — WanderQuest Brand Configurator (API & generation logic)
(function () {
'use strict';

const API_BASE = 'https://wanderquest-jkf8.onrender.com';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let imageId = null;
let currentBlobUrl = null;
let lastRawBlob = null;  // cache untinted server response
let currentLogoVariant = 1;
let colorMode = 'unicolor';
let stampColor = '#000000';
let bgColor = 'transparent';
let biFill = '#000000';
let biStroke = '#B13623';
let biBg = 'transparent';
let multiImage = '#000000';
let multiImageStroke = '#3E160E';
let multiImageBg = 'transparent';
let multiArabic = '#908C60';
let multiArabicStroke = '#3E160E';
let multiLatin = '#3E160E';
let multiBg = 'transparent';

// ---------------------------------------------------------------------------
// DOM references (use different names to avoid colliding with inline script)
// ---------------------------------------------------------------------------
const _fileInput = document.getElementById('fileInput');
const _preview = document.getElementById('preview');
const _placeholder = document.getElementById('placeholder');

// ---------------------------------------------------------------------------
// Utility: debounce
// ---------------------------------------------------------------------------
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ---------------------------------------------------------------------------
// Error toast
// ---------------------------------------------------------------------------
function showError(message) {
  let el = document.getElementById('error-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'error-toast';
    el.style.cssText =
      'position:fixed;top:16px;left:50%;transform:translateX(-50%);' +
      'background:#d32f2f;color:#fff;padding:12px 24px;border-radius:6px;' +
      'font-size:14px;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.3);' +
      'transition:opacity .3s;';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.opacity = '0'; }, 4000);
}

// ---------------------------------------------------------------------------
// Collect config from UI
// ---------------------------------------------------------------------------
function getConfig() {
  const activePill = document.querySelector('#shapePills .pill-btn.active');
  let shape = activePill ? activePill.dataset.shape : 'oval';
  if (shape === 'rectangle') shape = 'rect';

  const activeLayout = document.querySelector('.layout-btn.selected');
  const dateLayout = activeLayout ? parseInt(activeLayout.dataset.layout, 10) : 1;

  return {
    image_id: imageId,
    shape: shape,
    date_enabled: document.getElementById('dateToggle').checked,
    date_layout: dateLayout,
    date_start: document.getElementById('dateStart').value,
    date_end: document.getElementById('dateEnd').value,
    ink_density: 0.50,
    wear: parseFloat(document.getElementById('wear').value),
    edge_bleed: 0.20,
    line_thickness: 2,
    subject_scale: parseFloat(document.getElementById('subject-scale').value),
    image_scale: parseFloat(document.getElementById('image-scale').value),
    threshold_level: parseInt(document.getElementById('threshold-level').value, 10),
    edge_strength: 0.70,
    black_point: parseInt(document.getElementById('black-point').value, 10),
    white_point: parseInt(document.getElementById('white-point').value, 10),
    invert: document.getElementById('invert-toggle').checked,
    canvas_width: parseInt(document.getElementById('canvasWidth').value, 10),
    canvas_height: parseInt(document.getElementById('canvasHeight').value, 10),
    logo_variant: currentLogoVariant,
    color_mode: colorMode,
    color_latin: multiLatin,
    color_arabic: multiArabic,
    color_arabic_stroke: multiArabicStroke,
    color_image: multiImage,
    color_image_stroke: multiImageStroke,
    color_image_bg: multiImageBg,
  };
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
async function uploadImage(file) {
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(API_BASE + '/api/upload', { method: 'POST', body: formData });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Upload failed');
    }
    const data = await response.json();
    imageId = data.image_id;
    await generateStamp();
  } catch (e) {
    showError(e.message || 'Upload failed');
  }
}

// ---------------------------------------------------------------------------
// Generate stamp
// ---------------------------------------------------------------------------
let generationId = 0;

async function generateStamp() {
  if (!imageId) return;

  const thisId = ++generationId;

  // Show loading state (reduced opacity) for visual feedback
  if (_preview.src) _preview.style.opacity = '0.5';

  try {
    const config = getConfig();
    const response = await fetch(API_BASE + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    // Stale response — a newer request was made while this one was in flight
    if (thisId !== generationId) return;

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Generation failed');
    }

    const blob = await response.blob();
    if (thisId !== generationId) return;

    lastRawBlob = blob;
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    const tinted = await applyColors(blob);
    currentBlobUrl = URL.createObjectURL(tinted);

    _preview.src = currentBlobUrl;
    _preview.hidden = false;
    _preview.style.opacity = '1';
    _placeholder.style.display = 'none';
  } catch (e) {
    if (thisId !== generationId) return;
    _preview.style.opacity = '1';
    showError(e.message || 'Generation failed');
  }
}

const debouncedGenerate = debounce(generateStamp, 300);
const debouncedGenerateFast = debounce(generateStamp, 120);
const debouncedGenerateSlow = debounce(generateStamp, 500);

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------
async function downloadStamp() {
  if (!imageId) return;
  try {
    const config = getConfig();
    config.export = true;
    const response = await fetch(API_BASE + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Export failed');
    const rawBlob = await response.blob();
    const tinted = await applyColors(rawBlob);
    const bg = getActiveBgColor();
    const blob = (bg !== 'transparent') ? await addBackground(tinted, bg) : tinted;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stamp.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    showError(e.message || 'Export failed');
  }
}

// ---------------------------------------------------------------------------
// Event listeners (API-related only; UI visual state handled by inline script)
// ---------------------------------------------------------------------------

// File upload
_fileInput.addEventListener('change', () => {
  if (_fileInput.files.length > 0) uploadImage(_fileInput.files[0]);
});

// Ink/wear/bleed sliders — faster debounce (server caches expensive stages)
['wear'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', debouncedGenerateFast);
});

// Image processing sliders — normal debounce (triggers full pipeline)
['threshold-level', 'black-point', 'white-point',
 'subject-scale', 'image-scale', 'canvasWidth', 'canvasHeight'
].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', debouncedGenerate);
});

// Shape pills — defer to let inline script toggle .active first
document.querySelectorAll('#shapePills .pill-btn').forEach(btn => {
  btn.addEventListener('click', () => setTimeout(generateStamp, 0));
});

// Date toggle — immediate
document.getElementById('dateToggle').addEventListener('change', () => generateStamp());

// Date layout buttons — defer to let inline script toggle .selected first
document.querySelectorAll('.layout-btn').forEach(btn => {
  btn.addEventListener('click', () => setTimeout(generateStamp, 0));
});

// Invert toggle — immediate
document.getElementById('invert-toggle').addEventListener('change', () => generateStamp());

// Ratio buttons — defer to let inline script update dimensions first
document.querySelectorAll('.ratio-btn').forEach(btn => {
  btn.addEventListener('click', () => setTimeout(generateStamp, 0));
});

// Date text inputs — debounced (slower)
['dateStart', 'dateEnd'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', debouncedGenerateSlow);
});

// Download
document.getElementById('download-btn').addEventListener('click', downloadStamp);

// ---------------------------------------------------------------------------
// Logo variant switching
// ---------------------------------------------------------------------------
const logoOptions = document.querySelectorAll('.logo-option');

async function loadLogoVariant(variant) {
  try {
    const resp = await fetch('/assets/logo_' + variant + '.svg');
    if (!resp.ok) return;
    const svgText = await resp.text();
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const formData = new FormData();
    formData.append('file', blob, 'logo_' + variant + '.svg');
    const uploadResp = await fetch(API_BASE + '/api/upload', { method: 'POST', body: formData });
    if (!uploadResp.ok) return;
    const data = await uploadResp.json();
    imageId = data.image_id;
    await generateStamp();
  } catch (e) {
    showError(e.message || 'Failed to load logo');
  }
}

logoOptions.forEach(btn => {
  btn.addEventListener('click', () => {
    logoOptions.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    // Extract variant number from data-logo (e.g. "var_1" → 1, "var_2" → 2)
    const varNum = parseInt(btn.dataset.logo.replace('var_', ''), 10);
    currentLogoVariant = varNum || 1;
    loadLogoVariant(btn.dataset.logo);
  });
});

// ---------------------------------------------------------------------------
// Auto-load default logo on page start
// ---------------------------------------------------------------------------
loadLogoVariant('var_1');

// ---------------------------------------------------------------------------
// Color tinting
// ---------------------------------------------------------------------------
function loadImage(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = URL.createObjectURL(blob);
  });
}

function tintImage(blob, color) {
  return new Promise(async (resolve) => {
    if (color === '#000000') { resolve(blob); return; }
    const img = await loadImage(blob);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    c.toBlob((b) => resolve(b), 'image/png');
  });
}

function applyBicolor(blob, fillColor, strokeColor) {
  return new Promise(async (resolve) => {
    const img = await loadImage(blob);
    const w = img.width, h = img.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    // Create stroke (dilated outline) layer
    const strokePx = Math.max(3, Math.round(w * 2.5 / 1080));
    for (let dy = -strokePx; dy <= strokePx; dy++) {
      for (let dx = -strokePx; dx <= strokePx; dx++) {
        if (dx * dx + dy * dy <= strokePx * strokePx) {
          ctx.drawImage(img, dx, dy);
        }
      }
    }
    // Tint stroke layer
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = strokeColor;
    ctx.fillRect(0, 0, w, h);

    // Draw fill layer on top
    ctx.globalCompositeOperation = 'source-over';
    const fillCanvas = document.createElement('canvas');
    fillCanvas.width = w; fillCanvas.height = h;
    const fctx = fillCanvas.getContext('2d');
    fctx.drawImage(img, 0, 0);
    fctx.globalCompositeOperation = 'source-in';
    fctx.fillStyle = fillColor;
    fctx.fillRect(0, 0, w, h);
    ctx.drawImage(fillCanvas, 0, 0);

    c.toBlob((b) => resolve(b), 'image/png');
  });
}

function addBackground(blob, bgColor) {
  return new Promise(async (resolve) => {
    const img = await loadImage(blob);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    c.toBlob((b) => resolve(b), 'image/png');
  });
}

// Get the active color for the stamp based on current mode
function getActiveStampColor() {
  if (colorMode === 'unicolor') return stampColor;
  if (colorMode === 'bicolor') return biFill;
  return multiImage; // multicolor default — will be enhanced with separate layers
}

function getActiveBgColor() {
  if (colorMode === 'unicolor') return bgColor;
  if (colorMode === 'bicolor') return biBg;
  return multiBg;
}

// Apply colors to the raw stamp blob based on current mode
async function applyColors(blob) {
  if (colorMode === 'unicolor') {
    return tintImage(blob, stampColor);
  }
  if (colorMode === 'bicolor') {
    return applyBicolor(blob, biFill, biStroke);
  }
  // Multicolor — coloring is done server-side
  return blob;
}

// ---------------------------------------------------------------------------
// Color system — brand palette with dot + popover
// ---------------------------------------------------------------------------
const BRAND_COLORS = [
  '#000000', '#FFFFFF', '#F6F6F6', '#C4C4C4', '#908C60',
  '#FFFAE2', '#FFF3C0', '#D6C4A3', '#B8AB7F', '#C7A04E',
  '#EFB332', '#974229', '#B13623', '#3E160E',
];

const LIGHT_COLORS = new Set(['#FFFFFF', '#F6F6F6', '#FFFAE2', '#FFF3C0']);

const previewArea = document.getElementById('artboard');
const popover = document.getElementById('swatchPopover');
const popoverGrid = document.getElementById('swatchPopoverGrid');
let activePopoverDot = null;
let activePopoverCallback = null;

function updateDotColor(dot, color) {
  dot.classList.toggle('dot-light', LIGHT_COLORS.has(color));
  dot.classList.toggle('dot-transparent', color === 'transparent');
  if (color === 'transparent') {
    dot.style.background = '';
  } else {
    dot.style.background = color;
  }
}

function openSwatchPopover(dot, currentColor, includeTransparent, onSelect) {
  // Close if same dot clicked again
  if (activePopoverDot === dot && popover.style.display !== 'none') {
    closePopover();
    return;
  }

  // Deactivate previous dot
  if (activePopoverDot) activePopoverDot.classList.remove('active');
  activePopoverDot = dot;
  activePopoverCallback = onSelect;
  dot.classList.add('active');

  // Build grid
  popoverGrid.innerHTML = '';
  const colors = includeTransparent ? ['transparent', ...BRAND_COLORS] : BRAND_COLORS;
  colors.forEach(color => {
    const btn = document.createElement('button');
    btn.className = 'swatch' + (color === currentColor ? ' selected' : '');
    btn.dataset.color = color;
    if (color === 'transparent') {
      btn.classList.add('swatch-transparent');
      btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><rect width="14" height="14" fill="#ccc"/><rect x="14" y="14" width="14" height="14" fill="#ccc"/><rect x="14" width="14" height="14" fill="#fff"/><rect y="14" width="14" height="14" fill="#fff"/></svg>';
    } else {
      btn.style.background = color;
      if (LIGHT_COLORS.has(color)) btn.classList.add('swatch-light');
    }
    btn.addEventListener('click', () => {
      popoverGrid.querySelectorAll('.swatch').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      updateDotColor(dot, color);
      onSelect(color);
    });
    popoverGrid.appendChild(btn);
  });

  // Position popover next to the dot's row
  const row = dot.closest('.color-row');
  const panel = document.getElementById('colorPanel');
  const rowRect = row.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  popover.style.display = '';
  popover.style.top = (rowRect.top - panelRect.top) + 'px';

  // Show
  popover.style.display = '';
}

function closePopover() {
  popover.style.display = 'none';
  if (activePopoverDot) activePopoverDot.classList.remove('active');
  activePopoverDot = null;
  activePopoverCallback = null;
}

// Close popover on outside click
document.addEventListener('click', (e) => {
  if (popover.style.display === 'none') return;
  if (popover.contains(e.target)) return;
  if (e.target.classList.contains('color-dot')) return;
  closePopover();
});

function updateBgPreview() {
  const bg = getActiveBgColor();
  if (bg === 'transparent') {
    previewArea.style.background = 'repeating-conic-gradient(#e0e0e0 0% 25%, #fff 0% 50%) 50% / 20px 20px';
  } else {
    previewArea.style.background = bg;
  }
}

function updateIconColor() {
  const iconPath = document.querySelector('#colorIcon path');
  const color = getActiveStampColor();
  if (iconPath) iconPath.setAttribute('fill', color);
}

async function retintStamp() {
  if (!lastRawBlob) return;
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  const tinted = await applyColors(lastRawBlob);
  currentBlobUrl = URL.createObjectURL(tinted);
  _preview.src = currentBlobUrl;
}

function applyAndRefresh() {
  updateBgPreview();
  updateIconColor();
  if (colorMode === 'multicolor') {
    debouncedGenerate();
  } else {
    retintStamp();
  }
}

// ---------------------------------------------------------------------------
// Wire up color dots
// ---------------------------------------------------------------------------
function wireDot(dotId, getCurrentColor, isBackground, onSelect) {
  const dot = document.getElementById(dotId);
  if (!dot) return;
  updateDotColor(dot, getCurrentColor());
  dot.addEventListener('click', () => {
    openSwatchPopover(dot, getCurrentColor(), isBackground, onSelect);
  });
}

// Unicolor
wireDot('uniStampDot', () => stampColor, false, (c) => { stampColor = c; applyAndRefresh(); });
wireDot('uniBgDot', () => bgColor, true, (c) => { bgColor = c; applyAndRefresh(); });

// Bicolor
wireDot('biFillDot', () => biFill, false, (c) => { biFill = c; applyAndRefresh(); });
wireDot('biStrokeDot', () => biStroke, false, (c) => { biStroke = c; applyAndRefresh(); });
wireDot('biBgDot', () => biBg, true, (c) => { biBg = c; applyAndRefresh(); });

// Multicolor
wireDot('multiImageDot', () => multiImage, false, (c) => { multiImage = c; applyAndRefresh(); });
wireDot('multiImageStrokeDot', () => multiImageStroke, false, (c) => { multiImageStroke = c; applyAndRefresh(); });
wireDot('multiImageBgDot', () => multiImageBg, true, (c) => { multiImageBg = c; applyAndRefresh(); });
wireDot('multiArabicDot', () => multiArabic, false, (c) => { multiArabic = c; applyAndRefresh(); });
wireDot('multiArabicStrokeDot', () => multiArabicStroke, false, (c) => { multiArabicStroke = c; applyAndRefresh(); });
wireDot('multiLatinDot', () => multiLatin, false, (c) => { multiLatin = c; applyAndRefresh(); });
wireDot('multiBgDot', () => multiBg, true, (c) => { multiBg = c; applyAndRefresh(); });

// Mode switching
document.querySelectorAll('#colorModePills .pill-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    closePopover();
    const prevMode = colorMode;
    document.querySelectorAll('#colorModePills .pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    colorMode = btn.dataset.mode;
    document.getElementById('unicolorPanel').style.display = colorMode === 'unicolor' ? '' : 'none';
    document.getElementById('bicolorPanel').style.display = colorMode === 'bicolor' ? '' : 'none';
    document.getElementById('multicolorPanel').style.display = colorMode === 'multicolor' ? '' : 'none';
    updateBgPreview();
    updateIconColor();
    if (colorMode === 'multicolor' || prevMode === 'multicolor') {
      generateStamp();
    } else {
      retintStamp();
    }
  });
});

// Random helpers
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function refreshAllDots() {
  // Re-sync dot colors with state
  const dotMap = {
    uniStampDot: stampColor, uniBgDot: bgColor,
    biFillDot: biFill, biStrokeDot: biStroke, biBgDot: biBg,
    multiImageDot: multiImage, multiImageStrokeDot: multiImageStroke, multiImageBgDot: multiImageBg,
    multiArabicDot: multiArabic, multiArabicStrokeDot: multiArabicStroke,
    multiLatinDot: multiLatin, multiBgDot: multiBg,
  };
  for (const [id, color] of Object.entries(dotMap)) {
    const d = document.getElementById(id);
    if (d) updateDotColor(d, color);
  }
}

document.getElementById('uniRandomBtn').addEventListener('click', () => {
  const pool = BRAND_COLORS.slice();
  stampColor = pickRandom(pool);
  bgColor = pickRandom([...pool.filter(c => c !== stampColor), 'transparent']);
  closePopover();
  refreshAllDots();
  applyAndRefresh();
});

document.getElementById('biRandomBtn').addEventListener('click', () => {
  const pool = BRAND_COLORS.slice();
  biFill = pickRandom(pool);
  biStroke = pickRandom(pool.filter(c => c !== biFill));
  biBg = pickRandom([...pool.filter(c => c !== biFill && c !== biStroke), 'transparent']);
  closePopover();
  refreshAllDots();
  applyAndRefresh();
});

document.getElementById('multiRandomBtn').addEventListener('click', () => {
  const pool = BRAND_COLORS.slice();
  multiImage = pickRandom(pool);
  multiImageStroke = pickRandom(pool.filter(c => c !== multiImage));
  multiImageBg = pickRandom([...pool.filter(c => c !== multiImage), 'transparent']);
  multiArabic = pickRandom(pool.filter(c => c !== multiImage));
  multiArabicStroke = pickRandom(pool.filter(c => c !== multiArabic));
  multiLatin = pickRandom(pool.filter(c => c !== multiImage && c !== multiArabic));
  multiBg = pickRandom([...pool.filter(c => c !== multiImage && c !== multiArabic && c !== multiLatin), 'transparent']);
  closePopover();
  refreshAllDots();
  applyAndRefresh();
});

})();
