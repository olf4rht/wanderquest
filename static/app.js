// static/app.js — WanderQuest Stamp Generator interactivity

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let imageId = null;
let currentBlobUrl = null;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const fileInput = document.getElementById('file-input');
const uploadZone = document.getElementById('upload-zone');
const uploadFilename = document.getElementById('upload-filename');
const previewPlaceholder = document.getElementById('preview-placeholder');
const previewImage = document.getElementById('preview-image');
const previewContainer = document.getElementById('preview-container');
const downloadBtn = document.getElementById('download-btn');

// Controls
const colorPicker = document.getElementById('color-picker');
const primaryText = document.getElementById('primary-text');
const secondaryText = document.getElementById('secondary-text');
const fontSelect = document.getElementById('font-select');
const textPlacement = document.getElementById('text-placement');
const shapeSelect = document.getElementById('shape-select');
const borderStyle = document.getElementById('border-style');
const borderThickness = document.getElementById('border-thickness');
const inkDensity = document.getElementById('ink-density');
const wear = document.getElementById('wear');
const edgeBleed = document.getElementById('edge-bleed');
const backgroundToggle = document.getElementById('background-toggle');
const lineThickness = document.getElementById('line-thickness');
const subjectScale = document.getElementById('subject-scale');
const thresholdStrength = document.getElementById('threshold-strength');
const edgeStrength = document.getElementById('edge-strength');

// All interactive controls (for enabling/disabling and wiring events)
const allControls = [
  colorPicker, primaryText, secondaryText, fontSelect, textPlacement,
  shapeSelect, borderStyle, borderThickness, inkDensity, wear, edgeBleed,
  backgroundToggle, lineThickness, subjectScale, thresholdStrength, edgeStrength,
];

// ---------------------------------------------------------------------------
// Error / loading UI helpers
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

function setLoading(on) {
  if (on) {
    previewImage.style.opacity = '0.4';
    previewContainer.classList.add('loading');
  } else {
    previewImage.style.opacity = '1';
    previewContainer.classList.remove('loading');
  }
}

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
// Utility: hex color string to [R, G, B]
// ---------------------------------------------------------------------------
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// ---------------------------------------------------------------------------
// Collect current control values into a config object
// ---------------------------------------------------------------------------
function getConfig() {
  return {
    image_id: imageId,
    color: hexToRgb(colorPicker.value),
    shape: shapeSelect.value,
    border_style: borderStyle.value,
    border_thickness: parseInt(borderThickness.value, 10),
    primary_text: primaryText.value,
    secondary_text: secondaryText.value,
    font: fontSelect.value,
    text_placement: textPlacement.value,
    ink_density: parseFloat(inkDensity.value),
    wear: parseFloat(wear.value),
    edge_bleed: parseFloat(edgeBleed.value),
    line_thickness: parseInt(lineThickness.value, 10),
    subject_scale: parseFloat(subjectScale.value),
    threshold_strength: parseFloat(thresholdStrength.value),
    edge_strength: parseFloat(edgeStrength.value),
    background: backgroundToggle.value,
    output_size: 1080,
  };
}

// ---------------------------------------------------------------------------
// Enable / disable controls
// ---------------------------------------------------------------------------
function setControlsEnabled(enabled) {
  allControls.forEach(ctrl => { ctrl.disabled = !enabled; });
  downloadBtn.disabled = !enabled;
  // Also handle color preset buttons
  document.querySelectorAll('.color-preset').forEach(btn => {
    btn.disabled = !enabled;
  });
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
async function uploadImage(file) {
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  uploadFilename.textContent = file.name;
  setLoading(true);

  try {
    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Upload failed');
    }
    const data = await response.json();
    imageId = data.image_id;
    setControlsEnabled(true);
    // Trigger initial generation with default parameters
    await generateStamp();
  } catch (e) {
    showError(e.message || 'Upload failed');
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Generate stamp
// ---------------------------------------------------------------------------
async function generateStamp() {
  if (!imageId) return;

  setLoading(true);

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

    previewImage.src = currentBlobUrl;
    previewImage.hidden = false;
    previewPlaceholder.hidden = true;
  } catch (e) {
    showError(e.message || 'Generation failed');
  } finally {
    setLoading(false);
  }
}

const debouncedGenerate = debounce(generateStamp, 300);

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------
function downloadStamp() {
  if (!currentBlobUrl) return;
  const a = document.createElement('a');
  a.href = currentBlobUrl;
  a.download = 'wanderquest-stamp.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ---------------------------------------------------------------------------
// Wire up events
// ---------------------------------------------------------------------------

// File input
fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) uploadImage(fileInput.files[0]);
});

// Make entire upload zone clickable (not just the label)
uploadZone.addEventListener('click', (e) => {
  if (e.target !== fileInput && !e.target.closest('.upload-btn')) {
    fileInput.click();
  }
});

// Drag-and-drop (extend the existing visual-cue handler with actual upload)
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) uploadImage(file);
});
// Ensure dragover prevents default so drop fires
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('drag-over');
});

// Controls — sliders and text inputs use debounced handler
const debouncedControls = [primaryText, secondaryText, borderThickness, inkDensity, wear, edgeBleed, lineThickness, subjectScale, thresholdStrength, edgeStrength];
debouncedControls.forEach(ctrl => {
  ctrl.addEventListener('input', debouncedGenerate);
});

// Controls — selects and color picker use immediate handler
const immediateControls = [colorPicker, fontSelect, textPlacement, shapeSelect, borderStyle, backgroundToggle];
immediateControls.forEach(ctrl => {
  ctrl.addEventListener('change', generateStamp);
});

// Color preset buttons — set color picker value then generate
document.querySelectorAll('.color-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    colorPicker.value = btn.dataset.color;
    generateStamp();
  });
});

// Download button
downloadBtn.addEventListener('click', downloadStamp);

// ---------------------------------------------------------------------------
// Initial state: disable controls until upload
// ---------------------------------------------------------------------------
setControlsEnabled(false);
