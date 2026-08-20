// export.js — SVG / PNG / JSON export + reload

export function exportSVG(svgEl) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  stripNonExportable(clone);
  const xml = new XMLSerializer().serializeToString(clone);
  download(new Blob([xml], { type: 'image/svg+xml' }), 'tile-symbol.svg');
}

export function exportPNG(svgEl, size) {
  rasterize(svgEl, size, blob => download(blob, 'tile-symbol.png'));
}

export function copyPNG(svgEl, size) {
  rasterize(svgEl, size, blob => {
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {
      // Fallback: download if clipboard fails
      download(blob, 'tile-symbol.png');
    });
  });
}

export function saveJSON(state) {
  const json = JSON.stringify(state, null, 2);
  download(new Blob([json], { type: 'application/json' }), 'tile-symbol.json');
}

export function loadJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); }
      catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// --- helpers ---

function stripNonExportable(svgClone) {
  for (const id of ['ref-layer', 'domain-guide', 'ref-clip']) {
    const el = svgClone.querySelector(`#${id}`);
    if (el) el.remove();
  }
}

function rasterize(svgEl, size, cb) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  stripNonExportable(clone);
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size * 2, size * 2);
    URL.revokeObjectURL(url);
    canvas.toBlob(cb, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
