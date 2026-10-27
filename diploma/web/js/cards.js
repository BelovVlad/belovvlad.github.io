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
// Colour ramp of js/field.js (0..80 kV); negative potential tinted blue.
const RAMP = [[0, [14, 22, 31]], [0.35, [52, 38, 54]], [0.7, [150, 60, 68]], [1, [232, 180, 140]]];
function ramp(k, out) {
  let i = 0;
  while (i < RAMP.length - 2 && k > RAMP[i + 1][0]) i++;
  const [ka, a] = RAMP[i], [kb, b] = RAMP[i + 1], f = clamp01((k - ka) / (kb - ka));
  for (let c = 0; c < 3; c++) out[c] = a[c] + (b[c] - a[c]) * f;
  return out;
}

const VOLT_NAMES = { source: 'Диафрагма источника', accel: 'Ускоряющая диафрагма', suppressor: 'Подавляющая диафрагма' };
const SHORT_NAMES = { source: 'источник', accel: 'ускоряющая', suppressor: 'подавляющая' };
const kv = (v) => (Math.abs(v) >= 10 ? `${num(v)} кВ` : Math.abs(v) < 0.0005 ? '0 В' : `${num(v * 1000, 0)} В`);
// Window of the card picture, mm from the slit axis / the source diaphragm.
const VIEW = { y0: -5, y1: 64 };
// Equipotentials: every 5 kV, every 0.5 kV within ±3 kV; 0 V drawn apart.
const LEVELS = [];
for (let v = 5; v < 80; v += 5) LEVELS.push(v);
for (let v = -3; v <= 3; v += 0.5) if (Math.abs(v) > 0.01) LEVELS.push(v);

// Edge pairs crossed by a level, by corner code (bit set: corner above the level).
const CASES = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 2], [0, 1]], [[0, 2]], [[3, 2]],
  [[2, 3]], [[0, 2]], [[0, 3], [1, 2]], [[1, 2]], [[1, 3]], [[0, 1]], [[0, 3]], []];

// Contour segments of level `v` on the grid window (marching squares), into path `p`.
function contour(p, phi, nx, i0, i1, j0, j1, v, X, Y, h) {
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const k = j * nx + i;
    const a = phi[k], b = phi[k + 1], c = phi[k + nx + 1], d = phi[k + nx];
    const code = (a > v) | ((b > v) << 1) | ((c > v) << 2) | ((d > v) << 3);
    // No lines where there is no field (inside the cup, phi ~ 0 with round-off).
    if (code === 0 || code === 15 || Math.max(a, b, c, d) - Math.min(a, b, c, d) < 1e-4) continue;
    // Crossings on the edges: bottom (a-b), right (b-c), top (d-c), left (a-d).
    const e = [
      () => [i + (v - a) / (b - a), j], () => [i + 1, j + (v - b) / (c - b)],
      () => [i + (v - d) / (c - d), j + 1], () => [i, j + (v - a) / (d - a)],
    ];
    for (const [m, n] of CASES[code]) {
      const [x1, y1] = e[m](), [x2, y2] = e[n]();
      p.moveTo(X(x1 * h), Y(y1 * h)); p.lineTo(X(x2 * h), Y(y2 * h));
    }
  }
}

function drawPotentials(canvas, t, field, state) {
  const frame = fit(canvas);
  if (!frame) return;
  const { g, w, h } = frame;
  if (!field.ready) { caption(g, 'Потенциал в сечении', 'расчёт поля…', false); return; }
  const grid = field.grid, { volts, phase } = IBS.demos.voltagesAt(t);
  const H = grid.h, nx = grid.nx;
  // Uniform scale: the window height fills the frame, the slit axis in the middle.
  const k = h / (VIEW.y1 - VIEW.y0), halfW = w / 2 / k;
  const X = (x) => w / 2 + (x - (field.axisX - field.x0)) * k, Y = (y) => h - (y - VIEW.y0) * k;
  const ic = Math.round((field.axisX - field.x0) / H);
  const i0 = Math.max(0, ic - Math.ceil(halfW / H) - 1), i1 = Math.min(nx - 1, ic + Math.ceil(halfW / H) + 1);
  const j1 = Math.min(grid.ny - 1, Math.ceil(VIEW.y1 / H) + 1);

  // Potential at the grid nodes for the current voltages.
  if (!state.phi || state.phi.length !== nx * grid.ny) state.phi = new Float32Array(nx * grid.ny);
  const phi = state.phi, [bs, ba, bp] = grid.basis;
  for (let j = 0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const n = j * nx + i;
    phi[n] = volts.source * bs[n] + volts.accel * ba[n] + volts.suppressor * bp[n];
  }

  // Colour fill: a buffer of one pixel per grid node, smoothed when scaled up.
  const bw = i1 - i0 + 1, bh = j1 + 1;
  if (!state.buffer || state.buffer.width !== bw || state.buffer.height !== bh) {
    state.buffer = document.createElement('canvas');
    state.buffer.width = bw; state.buffer.height = bh;
    state.image = state.buffer.getContext('2d').createImageData(bw, bh);
  }
  const px = state.image.data, rgb = [0, 0, 0];
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const v = phi[j * nx + i0 + i], o = ((bh - 1 - j) * bw + i) * 4;
    ramp(clamp01(v / 80), rgb);
    const blue = clamp01(-v / 3) * 0.7;
    px[o] = rgb[0] + (38 - rgb[0]) * blue;
    px[o + 1] = rgb[1] + (82 - rgb[1]) * blue;
    px[o + 2] = rgb[2] + (140 - rgb[2]) * blue;
    px[o + 3] = 255;
  }
  state.buffer.getContext('2d').putImageData(state.image, 0, 0);
  g.fillStyle = 'rgb(14, 22, 31)'; g.fillRect(0, 0, w, h);
  g.imageSmoothingEnabled = true;
  g.drawImage(state.buffer, X((i0 - 0.5) * H), Y((bh - 0.5) * H), bw * k * H, bh * k * H);

  // Plasma side below the source diaphragm: the potential of the source.
  const plasma = g.createLinearGradient(0, Y(0), 0, h);
  plasma.addColorStop(0, `rgba(240, 170, 120, ${0.35 * volts.source / 80})`);
  plasma.addColorStop(1, `rgba(214, 76, 80, ${0.6 * volts.source / 80})`);
  g.fillStyle = plasma; g.fillRect(0, Y(0), w, h - Y(0));

  // Equipotentials.
  const lines = (levels, style, width) => {
    g.beginPath();
    for (const v of levels) contour(g, phi, nx, i0, i1, 0, j1, v, X, Y, H);
    g.strokeStyle = style; g.lineWidth = width; g.stroke();
  };
  g.lineCap = 'round';
  lines(LEVELS.filter((v) => v > 3 && v % 20 !== 0), 'rgba(236, 220, 198, 0.28)', 1);
  lines(LEVELS.filter((v) => v > 3 && v % 20 === 0), 'rgba(236, 220, 198, 0.55)', 1.2);
  lines(LEVELS.filter((v) => v < 3), 'rgba(150, 196, 240, 0.45)', 1);
  lines([0], 'rgba(246, 242, 234, 0.9)', 1.6);

  // Electrodes: the CAD section, the electrode being changed in red.
  const shift = field.axisX - field.x0;
  for (const part of field.outlines()) {
    const active = part.id === phase;
    g.beginPath();
    for (const loop of part.loops) {
      g.moveTo(X(loop[0] + shift), Y(loop[1]));
      for (let n = 2; n < loop.length; n += 2) g.lineTo(X(loop[n] + shift), Y(loop[n + 1]));
      g.closePath();
    }
    g.fillStyle = active ? 'rgb(120, 52, 58)' : part.id === 'ground' ? 'rgb(58, 64, 72)' : 'rgb(84, 92, 102)';
    g.fill('evenodd');
    g.strokeStyle = active ? '#e0787b' : 'rgba(234, 212, 183, 0.5)';
    g.lineWidth = active ? 1.5 : 1;
    g.stroke();
  }

  // Slit axis.
  g.setLineDash([4, 5]); g.strokeStyle = 'rgba(234, 212, 183, 0.3)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); g.setLineDash([]);

  // Voltage of each electrode beside its plate, right of the slit.
  g.font = `500 12px ${FONT}`;
  g.textBaseline = 'middle';
  for (const span of field.spans) {
    const id = { source_diaphragm: 'source', accelerating_diaphragm: 'accel', suppressor_diaphragm: 'suppressor' }[span.key];
    const text = `${SHORT_NAMES[id]} · ${kv(volts[id])}`, x = w / 2 + 14, y = Y(span.y1) - 9;
    g.fillStyle = 'rgba(11, 17, 23, 0.7)';
    g.fillRect(x - 5, y - 9, g.measureText(text).width + 10, 18);
    g.fillStyle = id === phase ? '#f0b6a0' : INK;
    g.fillText(text, x, y);
  }

  // Darken the top so the caption reads.
  const fade = g.createLinearGradient(0, 0, 0, 76);
  fade.addColorStop(0, 'rgba(11, 17, 23, 0.9)'); fade.addColorStop(1, 'rgba(11, 17, 23, 0)');
  g.fillStyle = fade; g.fillRect(0, 0, w, 76);
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
