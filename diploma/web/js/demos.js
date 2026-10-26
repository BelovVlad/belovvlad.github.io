// 3D animations of the research sections (data/directions.js, demo.id). Each is
// a deterministic function of the scene time t, looped, like the scenes.
//   geometry   — the electrodes move apart, then slit width and length, plate
//                thickness, gap and slit offset change one by one (engine.setMorph:
//                the CAD mesh is stretched, it is an illustration, not a computed
//                configuration);
//   potentials — cut-away of the electrodes with the potential in the section
//                across the slit (js/field.js: 2D Laplace, no space charge) while
//                the electrode voltages change.
(function () {
'use strict';

const IBS = window.IBS = window.IBS || {};
const { window: win, lerp, clamp01 } = IBS.ease;

const PLATES = ['source_diaphragm', 'accelerating_diaphragm', 'suppressor_diaphragm'];
const GHOST = 0.14;
const RIGHT_FRONT = new THREE.Vector3(1, 0, 0.55);
const PLATE_NAMES = {
  source_diaphragm: 'диафрагма источника',
  accelerating_diaphragm: 'ускоряющая диафрагма',
  suppressor_diaphragm: 'подавляющая диафрагма',
};

const mm = (v) => v.toFixed(1).replace('.', ',');
const signed = (v, digits = 1) => (v > 0.005 ? '+' : v < -0.005 ? '−' : '') + Math.abs(v).toFixed(digits).replace('.', ',');

// 0 -> +1 -> -1 -> 0 over [at, end], with short holds at the extremes.
function swing(t, at, end) {
  const s = Math.sin(2 * Math.PI * clamp01((t - at) / (end - at)));
  return Math.sign(s) * Math.pow(Math.abs(s), 0.6);
}
const envelope = (t, at, end) => win(t, at, at + 0.8) * (1 - win(t, end - 0.8, end));

// The callout row follows its anchor on screen, so the leader stays short.
function followRow(engine, label) {
  const p = engine.project(label.anchor);
  const h = engine.renderer.domElement.getBoundingClientRect().height || 1;
  label.row = THREE.MathUtils.clamp(p.y / h, 0.2, 0.8);
}

// Interpolates camera keys { t, ...numbers } at time t (eased between keys).
function track(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1], k = IBS.ease.inOutCubic((t - a.t) / (b.t - a.t));
  const out = {};
  for (const name in a) if (name !== 't') out[name] = typeof a[name] === 'string' ? (k < 0.5 ? a[name] : b[name]) : lerp(a[name], b[name], k);
  out.blend = { from: a.focus, to: b.focus, k };
  return out;
}

// Camera on the turntable: turn (rad), elevation (deg), distance (fit units),
// target in the assembly frame; shift: fraction of the distance to the left, so
// the model stands right of the text column.
function view(engine, turn, elevation, distance, focus, shift) {
  engine.turntable.rotation.y = turn;
  engine.turntable.updateMatrixWorld(true);
  const world = engine.assembly.localToWorld(focus.clone());
  world.x -= shift * distance * engine.fitDistance();
  engine.setOrbit(0, elevation, distance, world);
}

// ---------------------------------------------------------------------------
// Geometry.
const GEOMETRY_LOOP = 44;
const GEOMETRY_PHASES = [
  { at: 3.5, end: 10.5, key: 'source_diaphragm', item: 0, kind: 'width', title: 'Ширина щели' },
  { at: 11, end: 18, key: 'accelerating_diaphragm', item: 0, kind: 'length', title: 'Длина щели' },
  { at: 18.5, end: 24.5, key: 'suppressor_diaphragm', item: 1, kind: 'thickness', title: 'Толщина электрода' },
  { at: 26, end: 33, key: 'accelerating_diaphragm', item: 2, kind: 'gap', title: 'Зазор источник — ускоряющая' },
  { at: 34.5, end: 41, key: 'accelerating_diaphragm', item: 3, kind: 'offset', title: 'Смещение щели' },
];
// Camera keys; focus names the point looked at (see geometryFocus).
const GEOMETRY_CAMERA = [
  { t: 0, turn: 0.6, elevation: 24, distance: 0.8, focus: 'stack' },
  { t: 2.6, turn: 0.6, elevation: 26, distance: 0.78, focus: 'stack' },
  { t: 3.8, turn: 0.2, elevation: 32, distance: 0.6, focus: 'source_diaphragm' },
  { t: 10.4, turn: 0.2, elevation: 32, distance: 0.6, focus: 'source_diaphragm' },
  { t: 11.6, turn: 1.37, elevation: 50, distance: 0.58, focus: 'accelerating_diaphragm' },
  { t: 17.9, turn: 1.37, elevation: 50, distance: 0.58, focus: 'accelerating_diaphragm' },
  { t: 19.1, turn: 0.6, elevation: 10, distance: 0.54, focus: 'suppressor_diaphragm' },
  { t: 24.4, turn: 0.6, elevation: 10, distance: 0.54, focus: 'suppressor_diaphragm' },
  { t: 26.2, turn: 0.6, elevation: 8, distance: 0.6, focus: 'gap' },
  { t: 32.9, turn: 0.6, elevation: 8, distance: 0.6, focus: 'gap' },
  { t: 34.8, turn: 0.2, elevation: 52, distance: 0.56, focus: 'accelerating_diaphragm' },
  { t: 40.9, turn: 0.2, elevation: 52, distance: 0.56, focus: 'accelerating_diaphragm' },
  { t: 43.4, turn: 0.6, elevation: 24, distance: 0.8, focus: 'stack' },
  { t: GEOMETRY_LOOP, turn: 0.6, elevation: 24, distance: 0.8, focus: 'stack' },
];

function plateCenter(engine, key) {
  const c = engine.partBox(key).getCenter(new THREE.Vector3());
  c.y += engine.shown(key).position.y;
  return c;
}

function geometryFocus(engine, name) {
  if (name === 'stack') {
    const a = plateCenter(engine, PLATES[0]), b = plateCenter(engine, PLATES[2]);
    return a.add(b).multiplyScalar(0.5);
  }
  if (name === 'gap') {
    const a = plateCenter(engine, 'source_diaphragm'), b = plateCenter(engine, 'accelerating_diaphragm');
    return a.add(b).multiplyScalar(0.5);
  }
  return plateCenter(engine, name);
}

const geometry = {
  enter(ctx) {
    this.label = ctx.overlay.add({ title: '', subtitle: '', anchor: new THREE.Vector3(), row: 0.5, side: 'right' });
  },

  update(t, ctx) {
    const { engine } = ctx;
    const tt = t % GEOMETRY_LOOP;
    engine.renderer.toneMappingExposure = lerp(0.6, 1.15, win(t, 0, 1.5));
    engine.setBeamTilt(1);

    const explode = win(tt, 0.4, 2.6) * (1 - win(tt, 24.5, 26)) + win(tt, 33, 34.5) * (1 - win(tt, 41.5, 43.5));
    const gapPhase = GEOMETRY_PHASES[3];
    const gap = 8 * swing(tt, gapPhase.at, gapPhase.end);
    const lifts = {
      accelerating_diaphragm: 28 * explode + gap, accelerating_shield: 28 * explode + gap,
      suppressor_diaphragm: 64 * explode + gap, faraday_cup: 120 * explode + gap,
    };
    for (const key in engine.parts) {
      engine.setLift(key, lifts[key] || 0);
      let alpha = PLATES.includes(key) ? 1 : GHOST;
      if (key === 'faraday_cup') alpha = lerp(GHOST, 0, explode);
      if (key === 'accelerating_shield') alpha = lerp(GHOST, 0, explode);
      engine.setOpacity(key, key in engine.own ? 0 : alpha);
      engine.setOwnOpacity(key, alpha);
    }

    // The active phase: morph of its plate, highlight, callout text.
    let active = null, weight = 0;
    for (const phase of GEOMETRY_PHASES) {
      const env = envelope(tt, phase.at, phase.end);
      if (env > weight) { active = phase; weight = env; }
    }
    const s = active ? swing(tt, active.at, active.end) : 0;
    const morph = active && {
      width: { width: 1 + 0.55 * s }, length: { length: 1 + 0.22 * s },
      thickness: { thickness: 1 + 0.5 * s }, offset: { offset: 2 * s },
    }[active.kind];
    for (const key of PLATES) {
      engine.setMorph(key, morph && active.key === key ? morph : null);
      engine.setHighlight(key, active && active.key === key ? 0.22 * weight : 0);
    }

    // Camera.
    const cam = track(GEOMETRY_CAMERA, tt);
    const focus = geometryFocus(engine, cam.blend.from).lerp(geometryFocus(engine, cam.blend.to), cam.blend.k);
    view(engine, cam.turn + 0.05 * Math.sin(t * 0.15), cam.elevation, cam.distance, focus, 0.1);
    engine.ground.grid.material.uniforms.uOpacity.value = 0.6;

    if (active) this._label(engine, active, s);
    this.label.weight = weight;
    followRow(engine, this.label);
    IBS.directions.setActiveItem('geometry', 0, active && weight > 0.5 ? active.item : -1);
    return { calloutOpacity: win(t, 2, 3) };
  },

  _label(engine, phase, s) {
    const slit = engine.slit(phase.key), lift = engine.shown(phase.key).position.y;
    const xc = (slit.x0 + slit.x1) / 2, zc = (slit.z0 + slit.z1) / 2;
    const name = PLATE_NAMES[phase.key];
    let base, now, anchor;
    if (phase.kind === 'width') {
      base = slit.x1 - slit.x0; now = base * (1 + 0.55 * s);
      anchor = new THREE.Vector3(xc + now / 2, slit.y1 + lift, zc);
    } else if (phase.kind === 'length') {
      base = slit.z1 - slit.z0; now = base * (1 + 0.22 * s);
      anchor = new THREE.Vector3(xc, slit.y1 + lift, zc + now / 2);
    } else if (phase.kind === 'thickness') {
      base = slit.y1 - slit.y0; now = base * (1 + 0.5 * s);
      anchor = engine.rimPoint(phase.key, RIGHT_FRONT, 0.95);
      anchor.y = slit.y0 + now / 2 + lift;
    } else if (phase.kind === 'gap') {
      const source = engine.partBox('source_diaphragm');
      base = engine.partBox('accelerating_diaphragm').min.y - source.max.y; now = base + lift;
      anchor = engine.rimPoint('accelerating_diaphragm', RIGHT_FRONT, 0.9);
      anchor.y = source.max.y + now / 2;
    } else {
      anchor = new THREE.Vector3(xc + 2 * s, slit.y1 + lift, zc);
      this.label.anchor = anchor;
      this.label.setText(phase.title, `${name} · ${signed(2 * s)} мм`);
      return;
    }
    this.label.anchor = anchor;
    const subject = phase.kind === 'gap' ? 'между пластинами' : name;
    this.label.setText(phase.title, `${subject} · ${mm(base)} → ${mm(now)} мм`);
  },
};

// ---------------------------------------------------------------------------
// Potentials. Voltages in kV; the baseline is 02_physics/baseline.json
// (source 80 kV, accelerating −0.6 kV, suppressor and cup 0 V). The swings
// are illustrative, not limits of the real power supplies.
const POTENTIALS_LOOP = 34;
const BASE = { source: 80, accel: -0.6, suppressor: 0 };
const POTENTIAL_PHASES = [
  { at: 3, end: 11, electrode: 'source' },
  { at: 12, end: 22, electrode: 'accel' },
  { at: 23, end: 31, electrode: 'suppressor' },
];

function voltages(tt) {
  const [a, b, c] = POTENTIAL_PHASES;
  const u = clamp01((tt - a.at) / (a.end - a.at));
  const sb = swing(tt, b.at, b.end), sc = swing(tt, c.at, c.end);
  return {
    source: BASE.source - 20 * win(u, 0.1, 0.35) * (1 - win(u, 0.65, 0.9)),
    accel: BASE.accel + (sb > 0 ? -2.4 * sb : 0.6 * -sb),
    suppressor: BASE.suppressor + 1.0 * sc,
  };
}

function kv(v) {
  if (Math.abs(v) < 0.0005) return '0 В';
  return Math.abs(v) >= 10 ? `${signed(v, 1)} кВ` : `${signed(v * 1000, 0)} В`;
}

const ELECTRODE_LABELS = [
  { id: 'source', title: 'Диафрагма источника', key: 'source_diaphragm', row: 0.72 },
  { id: 'accel', title: 'Ускоряющая диафрагма', key: 'accelerating_diaphragm', row: 0.58 },
  { id: 'suppressor', title: 'Подавляющая диафрагма', key: 'suppressor_diaphragm', row: 0.44 },
  { id: 'cup', title: 'Цилиндр Фарадея', key: 'faraday_cup', row: 0.3 },
];

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, parent) {
  const node = document.createElementNS(SVG, tag);
  for (const name in attrs) node.setAttribute(name, attrs[name]);
  if (parent) parent.append(node);
  return node;
}

// Potential on the beam axis: the whole range, and a zoom around 0 V where the
// accelerating electrode makes the negative barrier for electrons.
function axisChart(slot) {
  const root = document.createElement('div');
  root.className = 'axis-chart';
  root.innerHTML = '<div class="axis-head"><span>Потенциал на оси пучка</span><b></b></div>';
  const W = 400, L = 40, R = 392, plots = [{ top: 6, bottom: 62, min: 0, max: 80, ticks: [0, 40, 80] },
    { top: 76, bottom: 120, min: -3, max: 1, ticks: [-3, -1, 1] }];
  const chart = svg('svg', { viewBox: `0 0 ${W} 140`, role: 'img', 'aria-label': 'Потенциал на оси пучка' }, root);
  const bands = svg('g', { class: 'axis-bands' }, chart);
  const curves = plots.map((p) => {
    for (const tick of p.ticks) {
      const y = p.bottom - (tick - p.min) / (p.max - p.min) * (p.bottom - p.top);
      svg('line', { x1: L, x2: R, y1: y, y2: y, class: 'axis-grid' }, chart);
      svg('text', { x: L - 6, y: y + 3.5, class: 'axis-tick', 'text-anchor': 'end' }, chart).textContent = String(tick).replace('-', '−');
    }
    if (p.min < 0) {
      const y = p.bottom - (0 - p.min) / (p.max - p.min) * (p.bottom - p.top);
      svg('line', { x1: L, x2: R, y1: y, y2: y, class: 'axis-zero' }, chart);
      svg('text', { x: L - 6, y: y + 3.5, class: 'axis-tick', 'text-anchor': 'end' }, chart).textContent = '0';
    }
    return svg('path', { class: 'axis-curve' }, chart);
  });
  svg('text', { x: L, y: 137, class: 'axis-tick' }, chart).textContent = 'кВ · по оси от диафрагмы источника, мм →';
  slot.append(root);
  let spansDrawn = false;
  return {
    draw(field, volts) {
      const profile = field.axis(volts), sx = (y) => L + y / field.length * (R - L);
      if (!spansDrawn) {
        for (const span of field.spans)
          svg('rect', { x: sx(span.y0), width: sx(span.y1) - sx(span.y0), y: 4, height: 118 }, bands);
        spansDrawn = true;
      }
      plots.forEach((p, i) => {
        const sy = (v) => p.bottom - (Math.min(Math.max(v, p.min), p.max) - p.min) / (p.max - p.min) * (p.bottom - p.top);
        curves[i].setAttribute('d', profile.map((q, j) => `${j ? 'L' : 'M'}${sx(q.y).toFixed(1)},${sy(q.phi).toFixed(1)}`).join(''));
      });
      // Lowest potential past the source diaphragm: the barrier for electrons.
      const after = profile.filter((q) => q.y > field.spans[0].y1);
      const min = Math.min(...after.map((q) => q.phi));
      root.querySelector('.axis-head b').textContent = `минимум ${kv(min)}`;
    },
  };
}

const potentials = {
  enter(ctx) {
    this.labels = ELECTRODE_LABELS.map((e) =>
      ctx.overlay.add({ title: e.title, subtitle: '', anchor: new THREE.Vector3(), row: e.row, side: 'right' }));
    if (!this.chart) this.chart = axisChart(IBS.directions.slot('potentials'));
  },

  update(t, ctx) {
    const { engine, field } = ctx;
    const tt = t % POTENTIALS_LOOP;
    engine.renderer.toneMappingExposure = lerp(0.6, 1.1, win(t, 0, 1.5));
    engine.setBeamTilt(1);
    for (const key in engine.parts) {
      const alpha = key.startsWith('grk_') ? GHOST : key === 'faraday_cup' ? 0.45 : 1;
      engine.setOpacity(key, key in engine.own ? 0 : alpha);
      engine.setOwnOpacity(key, alpha);
    }
    engine.setSection(field.zSlice);

    const turn = -0.38 + 0.05 * Math.sin(t * 0.13);
    const focus = new THREE.Vector3(field.axisX, field.y0 + 40, field.zSlice);
    view(engine, turn, lerp(14, 7, win(t, 0, 2.4)), 0.62, focus, 0.03);
    engine.ground.grid.material.uniforms.uOpacity.value = 0.6;

    const volts = voltages(tt);
    field.show(volts, win(t, 0.8, 1.8));
    if (field.ready) this.chart.draw(field, volts);

    const live = POTENTIAL_PHASES.find((p) => tt >= p.at && tt <= p.end);
    const values = { ...volts, cup: 0 };
    this.labels.forEach((label, i) => {
      const e = ELECTRODE_LABELS[i];
      const box = engine.partBox(e.key);
      const slit = e.id === 'cup' ? null : engine.slit(e.key);
      // On the cut face of the plate, right of the slit (the cup: its wall).
      label.anchor = e.id === 'cup'
        ? new THREE.Vector3(field.axisX + 49, field.y0 + 88, field.zSlice)
        : new THREE.Vector3(slit.x1 + 6, (box.min.y + box.max.y) / 2, field.zSlice);
      label.setText(undefined, e.id === 'cup' ? '0 В · опорный потенциал' : kv(values[e.id]));
      label.el.classList.toggle('live', !!live && live.electrode === e.id);
      followRow(engine, label);
    });
    return { calloutOpacity: win(t, 1.5, 2.5) };
  },
};

// Voltages at scene time t and the electrode being changed (null: none); also
// used by the card of the directions slide (js/cards.js).
function voltagesAt(t) {
  const tt = t % POTENTIALS_LOOP;
  const live = POTENTIAL_PHASES.find((p) => tt >= p.at && tt <= p.end);
  return { volts: voltages(tt), phase: live ? live.electrode : null };
}

IBS.demos = { geometry, potentials, voltagesAt };
})();
