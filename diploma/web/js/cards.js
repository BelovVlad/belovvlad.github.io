// Animated illustrations in the cards of the directions slide (a canvas in the
// image frame of a card whose direction has a demo). Drawn by the scene each
// frame from its time t, like everything else.
//   geometry   — section across the slit of the three varied electrodes, real
//                CAD sizes; slit width, thickness, gap and slit offset change in turn;
//   potentials — the potential in the same section (js/field.js, 2D Laplace,
//                no space charge) while the electrode voltages change.
// Both are illustrations, not IBSimu results; the card says so.
(function () {
'use strict';

const IBS = window.IBS = window.IBS || {};
const { clamp01 } = IBS.ease;

const INK = '#ead4b7', MUTED = 'rgba(234, 212, 183, 0.45)', ACCENT = '#d64c50';
const FONT = '"Bahnschrift", "Segoe UI", system-ui, sans-serif';
const num = (v, digits = 1) => v.toFixed(digits).replace('.', ',').replace('-', '−');
const signed = (v) => (v > 0.05 ? '+' : '') + num(v);

function swing(t, at, end) {
  const s = Math.sin(2 * Math.PI * clamp01((t - at) / (end - at)));
  return Math.sign(s) * Math.pow(Math.abs(s), 0.6);
}

// Canvas sized to its frame in device pixels; returns the 2D context in CSS pixels.
function fit(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return null;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

function caption(g, title, value, active) {
  g.font = `600 13px ${FONT}`;
  g.fillStyle = MUTED;
  g.textBaseline = 'top';
  g.fillText(title.toUpperCase(), 18, 16);
  g.font = `500 20px ${FONT}`;
  g.fillStyle = active ? INK : MUTED;
  g.fillText(value, 18, 36);
}

// Dimension line between two points (CSS px) with a label.
function dimension(g, x1, y1, x2, y2, label, side = 'right') {
  g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  for (const [x, y, d] of [[x1, y1, a + Math.PI], [x2, y2, a]]) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 6 * Math.cos(d - 0.4), y - 6 * Math.sin(d - 0.4));
    g.lineTo(x - 6 * Math.cos(d + 0.4), y - 6 * Math.sin(d + 0.4));
    g.closePath(); g.fill();
  }
  g.font = `500 13px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = side === 'right' ? 'left' : side === 'left' ? 'right' : 'center';
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  g.fillText(label, mx + (side === 'right' ? 10 : side === 'left' ? -10 : 0), my + (side === 'top' ? -12 : 0));
  g.textAlign = 'left';
}

// ---------------------------------------------------------------------------
const GEOMETRY_LOOP = 22;
const GEOMETRY_PHASES = [
  { at: 0.5, end: 5.5, title: 'Ширина щели', plate: 0 },
  { at: 5.5, end: 11, title: 'Толщина электрода', plate: 2 },
  { at: 11, end: 16.5, title: 'Зазор между пластинами', plate: 1 },
  { at: 16.5, end: 21.5, title: 'Смещение щели', plate: 1 },
];
const PLATES = ['source_diaphragm', 'accelerating_diaphragm', 'suppressor_diaphragm'];
const src0 = (shapes) => shapes[0].y0;

function drawGeometry(canvas, t, engine) {
  const frame = fit(canvas);
  if (!frame) return;
  const { g, w, h } = frame;
  const tt = t % GEOMETRY_LOOP;
  const plates = PLATES.map((key) => ({ box: engine.partBox(key), slit: engine.slit(key) }));
  const axis = (plates[0].slit.x0 + plates[0].slit.x1) / 2;

  const phase = GEOMETRY_PHASES.findIndex((p) => tt >= p.at && tt < p.end);
  const s = phase >= 0 ? swing(tt, GEOMETRY_PHASES[phase].at, GEOMETRY_PHASES[phase].end) : 0;
  const width = phase === 0 ? 1 + 0.6 * s : 1;
  const thick = phase === 1 ? 1 + 0.5 * s : 1;
  const gap = phase === 2 ? 7 * s : 0;
  const offset = phase === 3 ? 1.6 * s : 0;

  // Section in the plate frame: x across the slit, y along the beam (up).
  const shapes = plates.map((p, i) => {
    const half = (p.slit.x1 - p.slit.x0) / 2 * (i === 0 ? width : 1);
    const centre = axis + (i === 1 ? offset : 0);
    const y0 = p.box.min.y + (i > 0 ? gap : 0);
    const y1 = y0 + (p.box.max.y - p.box.min.y) * (i === 2 ? thick : 1);
    return { x0: p.box.min.x, x1: p.box.max.x, a: centre - half, b: centre + half, y0, y1 };
  });
  const span = { x0: axis - 46, x1: axis + 46, y0: shapes[0].y0 - 6, y1: plates[2].box.max.y + 16 };
  const k = Math.min((w - 36) / (span.x1 - span.x0), (h - 84) / (span.y1 - span.y0));
  const ox = w / 2 - (axis) * k, oy = h - 22 + span.y0 * k;
  const X = (x) => ox + x * k, Y = (y) => oy - y * k;

  // Beam, schematic: from the source slit up through the other slits.
  const beam = g.createLinearGradient(0, Y(src0(shapes)), 0, Y(span.y1));
  beam.addColorStop(0, 'rgba(214, 76, 80, 0.45)'); beam.addColorStop(1, 'rgba(214, 76, 80, 0)');
  g.fillStyle = beam;
  g.beginPath();
  g.moveTo(X(shapes[0].a), Y(shapes[0].y0)); g.lineTo(X(shapes[0].b), Y(shapes[0].y0));
  g.lineTo(X(axis + (shapes[0].b - axis) * 1.6), Y(span.y1)); g.lineTo(X(axis - (axis - shapes[0].a) * 1.6), Y(span.y1));
  g.closePath(); g.fill();

  // Beam axis.
  g.setLineDash([6, 5]); g.strokeStyle = 'rgba(214, 76, 80, 0.55)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(X(axis), Y(span.y0)); g.lineTo(X(axis), Y(span.y1)); g.stroke();
  g.setLineDash([]);

  shapes.forEach((p, i) => {
    const active = phase >= 0 && GEOMETRY_PHASES[phase].plate === i;
    g.fillStyle = active ? 'rgba(214, 76, 80, 0.32)' : 'rgba(150, 158, 168, 0.30)';
    g.strokeStyle = active ? '#e0787b' : 'rgba(234, 212, 183, 0.55)';
    g.lineWidth = 1.2;
    for (const [a, b] of [[p.x0, p.a], [p.b, p.x1]]) {
      g.beginPath(); g.rect(X(a), Y(p.y1), (b - a) * k, (p.y1 - p.y0) * k); g.fill(); g.stroke();
    }
  });

  const [src, acc, sup] = shapes;
  if (phase === 0) {
    const y = Y(src.y1) - 14;
    dimension(g, X(src.a), y, X(src.b), y, `${num(src.b - src.a)} мм`, 'top');
  } else if (phase === 1) {
    const x = X(sup.x1) + 14;
    dimension(g, x, Y(sup.y0), x, Y(sup.y1), `${num(sup.y1 - sup.y0)} мм`, 'right');
  } else if (phase === 2) {
    const x = X(src.x0) - 14;
    dimension(g, x, Y(src.y1), x, Y(acc.y0), `${num(acc.y0 - src.y1)} мм`, 'left');
  } else if (phase === 3) {
    const y = Y(acc.y1) - 14;
    if (Math.abs(offset) > 0.15) dimension(g, X(axis), y, X(axis + offset), y, `${signed(offset)} мм`, 'top');
  }
  const p = GEOMETRY_PHASES[Math.max(phase, 0)];
  caption(g, p.title, phase >= 0 ? {
    0: `${num(src.b - src.a)} мм`, 1: `${num(sup.y1 - sup.y0)} мм`,
    2: `${num(acc.y0 - src.y1)} мм`, 3: `${signed(offset)} мм`,
  }[phase] : '', phase >= 0);
}

// ---------------------------------------------------------------------------
// Colour ramp of js/field.js (0..80 kV), negative potential in blue.
const RAMP = [[0, [16, 26, 36]], [0.35, [59, 42, 58]], [0.7, [168, 67, 74]], [1, [240, 196, 154]]];
function ramp(k, out) {
  let i = 0;
  while (i < RAMP.length - 2 && k > RAMP[i + 1][0]) i++;
  const [ka, a] = RAMP[i], [kb, b] = RAMP[i + 1], f = clamp01((k - ka) / (kb - ka));
  for (let c = 0; c < 3; c++) out[c] = a[c] + (b[c] - a[c]) * f;
  return out;
}

const VOLT_NAMES = { source: 'Диафрагма источника', accel: 'Ускоряющая диафрагма', suppressor: 'Подавляющая диафрагма' };
const kv = (v) => (Math.abs(v) >= 10 ? `${num(v)} кВ` : `${num(v * 1000, 0)} В`);

function drawPotentials(canvas, t, field, state) {
  const frame = fit(canvas);
  if (!frame) return;
  const { g, w, h } = frame;
  if (!field.ready) { caption(g, 'Потенциал в сечении', 'расчёт поля…', false); return; }
  const grid = field.grid, { volts, phase } = IBS.demos.voltagesAt(t);

  // Picture SCALE times finer than the grid (bilinear potential, so the lines
  // are not stepped); rows from the source diaphragm up, as many as fit the frame.
  const SCALE = 2, nx = (grid.nx - 1) * SCALE + 1;
  const rows = Math.min((grid.ny - 1) * SCALE + 1, Math.round(nx * (h / w)));
  if (!state.image || state.image.height !== rows) {
    state.buffer = document.createElement('canvas');
    state.buffer.width = nx; state.buffer.height = rows;
    state.image = state.buffer.getContext('2d').createImageData(nx, rows);
    state.phi = new Float32Array(nx * rows);
    state.label = new Int8Array(nx * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < nx; i++)
      state.label[j * nx + i] = grid.label[Math.round(j / SCALE) * grid.nx + Math.round(i / SCALE)];
  }
  const nodes = grid.basis[0].map((_, k) => volts.source * grid.basis[0][k] + volts.accel * grid.basis[1][k] + volts.suppressor * grid.basis[2][k]);
  const { image, phi, label } = state, px = image.data, rgb = [0, 0, 0];
  for (let j = 0; j < rows; j++) {
    const fj = j / SCALE, j0 = Math.min(Math.floor(fj), grid.ny - 2), c = fj - j0;
    for (let i = 0; i < nx; i++) {
      const fi = i / SCALE, i0 = Math.min(Math.floor(fi), grid.nx - 2), a = fi - i0, k = j0 * grid.nx + i0;
      phi[j * nx + i] = (nodes[k] * (1 - a) + nodes[k + 1] * a) * (1 - c) + (nodes[k + grid.nx] * (1 - a) + nodes[k + grid.nx + 1] * a) * c;
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, o = ((rows - 1 - j) * nx + i) * 4, v = phi[k];
    if (label[k] >= 0) { px[o] = 92; px[o + 1] = 98; px[o + 2] = 106; px[o + 3] = 255; continue; }
    ramp(clamp01(v / 80), rgb);
    const blue = clamp01(-v / 1.5) * 0.85;
    let r = rgb[0] + (74 - rgb[0]) * blue, gg = rgb[1] + (140 - rgb[1]) * blue, b = rgb[2] + (217 - rgb[2]) * blue;
    // Equipotentials: a level crossed between this node and the next one.
    const step = Math.abs(v) < 3 ? 0.5 : 10;
    const right = i + 1 < nx && label[k + 1] < 0 ? phi[k + 1] : v, up = j + 1 < rows && label[k + nx] < 0 ? phi[k + nx] : v;
    // No lines where there is no field (inside the cup, phi ~ 0 with round-off).
    const flat = Math.max(Math.abs(v - right), Math.abs(v - up)) < 1e-3;
    if (!flat && (Math.floor(v / step) !== Math.floor(right / step) || Math.floor(v / step) !== Math.floor(up / step))) {
      const zero = Math.sign(v) !== Math.sign(right) || Math.sign(v) !== Math.sign(up);
      const m = zero ? 0.9 : 0.45;
      r += (236 - r) * m; gg += (222 - gg) * m; b += (200 - b) * m;
    }
    px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
  }
  state.buffer.getContext('2d').putImageData(image, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(state.buffer, 0, 0, w, h);
  // Darken the top so the caption reads.
  const fade = g.createLinearGradient(0, 0, 0, 84);
  fade.addColorStop(0, 'rgba(11, 17, 23, 0.85)'); fade.addColorStop(1, 'rgba(11, 17, 23, 0)');
  g.fillStyle = fade; g.fillRect(0, 0, w, 84);
  const key = phase || 'accel';
  caption(g, VOLT_NAMES[key], kv(volts[key]), !!phase);
}

// ---------------------------------------------------------------------------
const canvases = {};
const potentialState = {};

IBS.cards = {
  // Canvas for the card of a direction (called by js/directions.js).
  canvas(id) { return (canvases[id] = canvases[id] || document.createElement('canvas')); },
  draw(t, ctx) {
    if (canvases.geometry) drawGeometry(canvases.geometry, t, ctx.engine);
    if (canvases.potentials) drawPotentials(canvases.potentials, t, ctx.field, potentialState);
  },
};
})();
