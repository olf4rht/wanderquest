// static/app.js — WanderQuest Brand Configurator (API & generation logic)
(function () {
'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let imageId = null;
let currentBlobUrl = null;
let currentLogoVariant = 1;

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
    ink_density: parseFloat(document.getElementById('ink-density').value),
    wear: parseFloat(document.getElementById('wear').value),
    edge_bleed: parseFloat(document.getElementById('edge-bleed').value),
    line_thickness: parseInt(document.getElementById('line-thickness').value, 10),
    subject_scale: parseFloat(document.getElementById('subject-scale').value),
    threshold_level: parseInt(document.getElementById('threshold-level').value, 10),
    edge_strength: parseFloat(document.getElementById('edge-strength').value),
    black_point: parseInt(document.getElementById('black-point').value, 10),
    white_point: parseInt(document.getElementById('white-point').value, 10),
    invert: document.getElementById('invert-toggle').checked,
    canvas_width: parseInt(document.getElementById('canvasWidth').value, 10),
    canvas_height: parseInt(document.getElementById('canvasHeight').value, 10),
    logo_variant: currentLogoVariant,
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
    const response = await fetch('/api/upload', { method: 'POST', body: formData });
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
    const response = await fetch('/api/generate', {
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

    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = URL.createObjectURL(blob);

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
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
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
['ink-density', 'wear', 'edge-bleed'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', debouncedGenerateFast);
});

// Image processing sliders — normal debounce (triggers full pipeline)
['threshold-level', 'edge-strength', 'black-point', 'white-point',
 'line-thickness', 'subject-scale', 'canvasWidth', 'canvasHeight'
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
    const resp = await fetch('/static/assets/logo_' + variant + '.svg');
    if (!resp.ok) return;
    const svgText = await resp.text();
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const formData = new FormData();
    formData.append('file', blob, 'logo_' + variant + '.svg');
    const uploadResp = await fetch('/api/upload', { method: 'POST', body: formData });
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

})();
