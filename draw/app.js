/* oblique.so/draw, the page: settings in, preview and downloads out. The drawing itself is engine.js. */
import { render, describe, fileName, clean, COLUMNS, DENSITIES, GROUNDS, ACCENTS, MAX_SEED, DEFAULTS } from './engine.js';

const $ = id => document.getElementById(id);
const state = clean(DEFAULTS);
let view = 'tile';
let tileUrl = null;

const frame = $('frame'), readout = $('readout'), transparent = $('transparent');
const columns = $('columns'), density = $('density'), seed = $('seed');
const status = $('status'), seedError = $('seed-error');

function radios(container, name, options, current, swatch) {
  container.innerHTML = '';
  for (const [value, opt] of Object.entries(options)) {
    const id = `${name}-${value}`;
    const input = Object.assign(document.createElement('input'), { type: 'radio', name, id, value, checked: value === current });
    const label = document.createElement('label');
    label.htmlFor = id;
    if (swatch) {
      const dot = document.createElement('span');
      const colour = swatch(opt);
      dot.className = colour ? 'swatch' : 'swatch none';
      if (colour) dot.style.background = colour;
      dot.setAttribute('aria-hidden', 'true');
      label.append(dot);
    }
    label.append(opt.label);
    container.append(input, label);
  }
}

function clearSeedError() {
  seed.removeAttribute('aria-invalid');
  seedError.textContent = '';
}

function draw() {
  const clear = transparent.checked;
  const { svg, count } = render(state, { transparent: clear });
  frame.innerHTML = svg;
  if (tileUrl) URL.revokeObjectURL(tileUrl);
  tileUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  frame.style.backgroundImage = view === 'repeat' ? `url("${tileUrl}")` : '';
  frame.style.backgroundSize = view === 'repeat' ? `${100 / 3}% ${100 / 3}%` : '';
  frame.dataset.view = view;
  frame.dataset.transparent = String(clear);
  const text = describe(state);
  frame.setAttribute('aria-label', `Pattern preview: ${count} boxes. ${text}.`);
  readout.textContent = `${text}, ${count} boxes`;
  columns.setAttribute('aria-valuetext', `${state.columns} columns`);
  density.setAttribute('aria-valuetext', `density ${state.density}`);
  $('columns-out').textContent = state.columns;
  $('density-out').textContent = state.density;
  if (document.activeElement !== seed) { seed.value = state.seed; clearSeedError(); }
}

function setSeed(value) {
  const n = Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || n > MAX_SEED) {
    seed.setAttribute('aria-invalid', 'true');
    seedError.textContent = `Use a whole number from 1 to ${MAX_SEED}.`;
    return;
  }
  clearSeedError();
  state.seed = n;
  draw();
}

function shuffle() {
  state.seed = 1 + Math.floor(Math.random() * MAX_SEED);
  seed.value = state.seed;
  clearSeedError();
  draw();
}

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = `Saved ${name}`;
}

async function exportFile(button) {
  if (button.getAttribute('aria-busy') === 'true') return;
  const clear = transparent.checked;
  const kind = button.dataset.export;
  const name = fileName(state, kind).replace(`.${kind}`, `${clear ? '-transparent' : ''}.${kind}`);
  if (kind === 'svg') {
    save(new Blob([render(state, { transparent: clear }).svg], { type: 'image/svg+xml' }), name);
    return;
  }
  const px = Number(button.dataset.px);
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Rendering';
  status.textContent = `Rendering PNG, ${px} px`;
  let url = null, canvas = null;
  try {
    url = URL.createObjectURL(new Blob([render(state, { px, transparent: clear }).svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.src = url;
    await img.decode();
    canvas = Object.assign(document.createElement('canvas'), { width: px, height: px });
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0, px, px);
    const blob = await new Promise((ok, fail) => canvas.toBlob(b => (b ? ok(b) : fail(new Error('empty'))), 'image/png'));
    save(blob, name.replace('.png', `-${px}.png`));
  } catch (err) {
    status.textContent = 'The PNG could not be made in this browser. Download the SVG and export it from Illustrator or Figma.';
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    button.removeAttribute('aria-busy');
    button.textContent = button.dataset.label;
  }
}

radios($('ground'), 'ground', GROUNDS, state.ground, g => g.ground);
radios($('accent'), 'accent', ACCENTS, state.accent, a => a.colour);
columns.value = COLUMNS.indexOf(state.columns);
density.value = DENSITIES.indexOf(state.density);
seed.value = state.seed;

columns.addEventListener('input', () => { state.columns = COLUMNS[columns.value]; draw(); });
density.addEventListener('input', () => { state.density = DENSITIES[density.value]; draw(); });
seed.addEventListener('change', () => setSeed(seed.value));
seed.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setSeed(seed.value); } });
$('shuffle').addEventListener('click', shuffle);
$('controls').addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'ground') state.ground = t.value;
  else if (t.name === 'accent') state.accent = t.value;
  else if (t.name === 'view') view = t.value;
  else if (t !== transparent) return;
  draw();
});
$('controls').addEventListener('submit', e => e.preventDefault());
document.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => exportFile(b)));
/* Alt R shuffles: a modifier key, so speech input and typing never trigger it. */
document.addEventListener('keydown', e => {
  if (e.code !== 'KeyR' || !e.altKey || e.metaKey || e.ctrlKey || e.repeat) return;
  e.preventDefault();
  shuffle();
});

draw();
