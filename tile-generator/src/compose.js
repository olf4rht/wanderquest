// compose.js — palette application + ink texture/distress filter

const SVG_NS = 'http://www.w3.org/2000/svg';

export function compose(svgEl, s) {
  // Background
  const bg = svgEl.querySelector('#bg-rect');
  if (bg) bg.setAttribute('fill', s.bg);

  // Texture filter
  applyTexture(svgEl, s);
}

function applyTexture(svgEl, s) {
  let defs = svgEl.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svgEl.prepend(defs);
  }

  // Remove existing
  const old = defs.querySelector('#ink-texture');
  if (old) old.remove();

  const symbolG = svgEl.querySelector('#symbol');

  if (!s.texture.on || s.texture.distress === 0) {
    symbolG.removeAttribute('filter');
    return;
  }

  const t = s.texture.distress / 100; // 0–1
  const dispScale = t * 6;
  const grainFreq = 0.5 + t * 0.3;
  const grainOpacity = t * 0.35;

  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', 'ink-texture');
  filter.setAttribute('x', '-5%');
  filter.setAttribute('y', '-5%');
  filter.setAttribute('width', '110%');
  filter.setAttribute('height', '110%');

  filter.innerHTML = `
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="3" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="${dispScale.toFixed(1)}" xChannelSelector="R" yChannelSelector="G" result="displaced"/>
    <feTurbulence type="fractalNoise" baseFrequency="${grainFreq.toFixed(2)}" numOctaves="2" seed="7" result="grain"/>
    <feColorMatrix type="matrix"
      values="0 0 0 0 0
              0 0 0 0 0
              0 0 0 0 0
              0 0 0 ${grainOpacity.toFixed(2)} 0" in="grain" result="grainA"/>
    <feComposite in="grainA" in2="displaced" operator="in" result="grainMask"/>
    <feComposite in="displaced" in2="grainMask" operator="arithmetic" k1="0" k2="1" k3="-1" k4="0"/>
  `;

  defs.appendChild(filter);
  symbolG.setAttribute('filter', 'url(#ink-texture)');
}
