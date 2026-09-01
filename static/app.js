// static/app.js — WanderQuest Brand Configurator (API & generation logic)

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let imageId = null;
let currentBlobUrl = null;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const placeholder = document.getElementById('placeholder');

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
async function generateStamp() {
  if (!imageId) return;

  try {
    const config = getConfig();
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Generation failed');
    }

    const blob = await response.blob();
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = URL.createObjectURL(blob);

    preview.src = currentBlobUrl;
    preview.hidden = false;
    placeholder.hidden = true;
  } catch (e) {
    showError(e.message || 'Generation failed');
  }
}

const debouncedGenerate = debounce(generateStamp, 300);
const debouncedGenerateSlow = debounce(generateStamp, 500);

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------
function downloadStamp() {
  if (!currentBlobUrl) return;
  const a = document.createElement('a');
  a.href = currentBlobUrl;
  a.download = 'stamp.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ---------------------------------------------------------------------------
// Event listeners (API-related only; UI visual state handled by inline script)
// ---------------------------------------------------------------------------

// File upload
fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) uploadImage(fileInput.files[0]);
});

// Range sliders — debounced regeneration
['threshold-level', 'edge-strength', 'black-point', 'white-point',
 'line-thickness', 'subject-scale', 'ink-density', 'wear', 'edge-bleed',
 'canvasWidth', 'canvasHeight'
].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', debouncedGenerate);
});

// Shape pills — immediate regeneration
document.querySelectorAll('#shapePills .pill-btn').forEach(btn => {
  btn.addEventListener('click', () => generateStamp());
});

// Date toggle — immediate
document.getElementById('dateToggle').addEventListener('change', () => generateStamp());

// Date layout buttons — immediate
document.querySelectorAll('.layout-btn').forEach(btn => {
  btn.addEventListener('click', () => generateStamp());
});

// Invert toggle — immediate
document.getElementById('invert-toggle').addEventListener('change', () => generateStamp());

// Date text inputs — debounced (slower)
['dateStart', 'dateEnd'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', debouncedGenerateSlow);
});

// Download
document.getElementById('download-btn').addEventListener('click', downloadStamp);
