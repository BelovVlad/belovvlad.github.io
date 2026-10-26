// Presentation scenes. Each scene is a deterministic function of its own time t
// (seconds): pause freezes t, restart sets t = 0, so every run looks the same.
(function () {
'use strict';

const IBS = window.IBS = window.IBS || {};
const { window: win, lerp } = IBS.ease;

function boxCenter(engine, groups) {
  return engine.groupBox(groups).getCenter(new THREE.Vector3());
}

// Scene 1. The whole available assembly: GRK ion source + extraction unit.
const installation = {
  id: 'installation',
  title: 'Установка',

  enter(ctx) {
    const { engine, overlay } = ctx;
    overlay.add({
      title: 'Газоразрядная камера',
      subtitle: 'катод · антикатод · диафрагма источника',
      anchor: boxCenter(engine, ['ion_source_body', 'source_diaphragm']),
      row: 0.40,
    });
    overlay.add({
      title: 'Экстракционный узел',
      subtitle: 'ускоряющая и подавляющая диафрагмы · цилиндр Фарадея',
      anchor: boxCenter(engine, ['accelerating_diaphragm', 'suppressor_diaphragm', 'faraday_cup']),
      row: 0.62,
    });
  },

  update(t, ctx) {
    const { engine } = ctx;
    // On first load the lights come up; coming back from another scene they stay on.
    const intro = !ctx.from;
    engine.renderer.toneMappingExposure = intro ? lerp(0.0, 1.0, win(t, 0.0, 2.0)) : 1.0;
    engine.ground.grid.material.uniforms.uOpacity.value = intro ? win(t, 0.4, 2.4) : 1;
    const k = intro ? win(t, 0.0, 5.0) : 1;
    engine.setOrbit(lerp(-10, 0, k), lerp(38, 22, k), lerp(1.7, 0.96, k),
                    new THREE.Vector3(0, engine.radius * 0.03, 0));

    // Turntable: 1 revolution per 60 s with a smooth start (no jump at t = 0).
    const omega = (2 * Math.PI) / 60, tau = 3.0;
    engine.turntable.rotation.y = THREE.MathUtils.degToRad(-38) + omega * (t - tau * (1 - Math.exp(-t / tau)));

    // Callouts step aside while the beam axis points at the viewer (parts overlap on screen).
    const beam = new THREE.Vector3(1, 0, 0).applyEuler(engine.turntable.rotation);
    const view = engine.camera.position.clone().sub(engine.target).setY(0).normalize();
    const endOn = Math.abs(beam.dot(view));
    const visible = 1 - THREE.MathUtils.smoothstep(endOn, 0.6, 0.8);

    ctx.setTitleOpacity(win(t, 0.6, 1.8));
    ctx.setCreditsOpacity(win(t, 1.4, 2.6));
    return { calloutOpacity: win(t, 3.6, 4.8) * visible };
  },
};

// ---------------------------------------------------------------------------
// Ion source slides. What is shown and where it comes from: data/sources.js.
// Only CAD parts of our GRK are shown; the discharge region, field lines and
// particles are schematic (js/plasma.js) and are labelled as such.

const EXTRACTION_PARTS = ['accelerating_diaphragm', 'accelerating_shield', 'suppressor_diaphragm', 'faraday_cup'];
// Beam vertical, discharge axis (assembly Z) across the screen, cathode on the right.
const SOURCE_TURN = Math.PI / 2 - 0.42;
const HOT = 0xff8a3d;      // glow of the heated cathode and filament

// Camera on the GRK. lift: mm along the beam (up on screen); shift: mm to the
// left, so the model stands right of the step list.
function sourceView(engine, t, { distance, elevation, lift = 0, shift = 0 }) {
  engine.turntable.rotation.y = SOURCE_TURN + 0.05 * Math.sin(t * 0.12);
  engine.turntable.updateMatrixWorld(true);
  const center = engine.partBox('grk_walls').getCenter(new THREE.Vector3());
  center.y += lift;
  const world = engine.assembly.localToWorld(center);
  world.x -= shift;
  engine.setOrbit(0, elevation, distance, world);
}

// The callout row follows its anchor on screen, so the leader stays short.
function followRow(engine, label) {
  const p = engine.project(label.anchor);
  const h = engine.renderer.domElement.getBoundingClientRect().height || 1;
  label.row = THREE.MathUtils.clamp(p.y / h, 0.22, 0.78);
}

// Active step at time t and the weight (0..1) of each step; the last one stays.
function stepWeights(t, start, length, count) {
  const index = Math.min(Math.max(Math.floor((t - start) / length), -1), count - 1);
  const weights = Array.from({ length: count }, (_, i) => {
    const s = start + i * length;
    return win(t, s, s + 0.5) * (i === count - 1 ? 1 : 1 - win(t, s + length, s + length + 0.5));
  });
  return { index, weights };
}

// Source device: the camera comes close to the GRK, then its parts one by one.
const DEVICE_START = 3.4, DEVICE_STEP = 3.4;
const DEVICE_STEPS = [
  { title: 'Газоразрядная камера', label: 'Газоразрядная камера', part: 'grk_walls',
    text: 'Корпус-анод разряда. В камеру подаётся рабочий газ — аргон',
    anchor: (e) => { const b = e.partBox('grk_walls'); return new THREE.Vector3(b.max.x - 4, b.max.y - 3, b.min.z + 10); } },
  { title: 'Нить накала', label: 'Нить накала', sub: 'вольфрам · 40–50 А', part: 'grk_filament',
    text: 'Вольфрамовая спираль (≈2200 °C) за катодом; нагревается током 40–50 А',
    anchor: (e) => { const b = e.partBox(e.extras.grk_filament ? 'grk_filament' : 'grk_cathode'); const c = b.getCenter(new THREE.Vector3()); c.z = b.max.z - 3; return c; } },
  { title: 'Катод', label: 'Катод', sub: 'косвенного накала', part: 'grk_cathode',
    text: 'Разогревается электронами спирали, ускоренными напряжением 600 В, и испускает электроны разряда',
    anchor: (e) => { const b = e.partBox('grk_cathode'); const c = b.getCenter(new THREE.Vector3()); c.y = b.max.y; return c; } },
  { title: 'Антикатод', label: 'Антикатод', sub: 'отражатель', part: 'grk_anticathode',
    text: 'Напротив катода, в ≈55 мм от него; отражает электроны обратно в разряд',
    anchor: (e) => { const b = e.partBox('grk_anticathode'); const c = b.getCenter(new THREE.Vector3()); c.y = b.max.y; return c; } },
  { title: 'Область разряда', label: 'Область разряда', sub: 'показана условно', part: null,
    text: 'Плазменный столб между катодом и антикатодом, вдоль магнитного поля',
    anchor: (e, ctx) => ctx.plasma.column.position.clone().add(new THREE.Vector3(0, 8, 0)) },
  { title: 'Эмиссионная щель', label: 'Эмиссионная щель', sub: '≈ 49 × 3,5 мм', part: 'source_diaphragm',
    text: 'Щель в крышке камеры: через неё ионы выходят к экстракционной системе',
    anchor: (e, ctx) => new THREE.Vector3(ctx.plasma.slitX, e.partBox('source_diaphragm').max.y, 10) },
];

const device = {
  id: 'device',
  title: 'Устройство ионного источника',
  heading: {
    eyebrow: 'Ионный источник',
    title: 'Устройство ионного источника',
    text: 'Источник типа Бернаса с катодом косвенного накала',
  },
  panel: IBS.panels.steps('steps-device', DEVICE_STEPS,
    { note: 'CAD-модель ГРК · схема установки · Farley, Rose, Ryding, 2004, рис. 8.5' }),

  enter(ctx) {
    this.labels = DEVICE_STEPS.map((step) =>
      ctx.overlay.add({ title: step.label, subtitle: step.sub, anchor: new THREE.Vector3(), row: 0.5, side: 'right' }));
  },

  update(t, ctx) {
    const { engine } = ctx;
    engine.renderer.toneMappingExposure = lerp(1.0, 1.2, win(t, 0.4, 2.4));
    engine.setBeamTilt(win(t, 0.0, 2.6));
    const open = win(t, 1.6, 3.4);
    const { index, weights } = stepWeights(t, DEVICE_START, DEVICE_STEP, DEVICE_STEPS.length);
    const slit = weights[DEVICE_STEPS.length - 1];
    for (const key in engine.parts) {
      let alpha = 1;
      if (key === 'grk_walls') alpha = lerp(1, 0.2, open);
      else if (key === 'source_diaphragm') alpha = lerp(lerp(1, 0.25, open), 0.9, slit);
      else if (EXTRACTION_PARTS.includes(key)) alpha = lerp(1, 0.04, win(t, 0.4, 2.4));
      engine.setOpacity(key, alpha);
    }
    engine.setExtraOpacity('grk_filament', win(t, 2.2, 3.4));
    DEVICE_STEPS.forEach((step, i) => { if (step.part) engine.setHighlight(step.part, 0.32 * weights[i]); });

    // Discharge region: a schematic column, from its own step on.
    const columnAt = DEVICE_START + 4 * DEVICE_STEP;
    ctx.plasma.update(t, { column: win(t, columnAt, columnAt + 0.8) });

    const k = win(t, 0.0, 3.4);
    sourceView(engine, t, { distance: lerp(0.9, 0.66, k), elevation: lerp(22, 20, k), shift: lerp(0, 16, k) });
    engine.ground.grid.material.uniforms.uOpacity.value = 1;

    this.labels.forEach((label, i) => {
      label.anchor = DEVICE_STEPS[i].anchor(engine, ctx);
      label.weight = weights[i];
      followRow(engine, label);
    });
    this.panel.setActive(index);
    ctx.setHeadingOpacity(win(t, 1.2, 2.4));
    ctx.setLayerOpacity('steps-device', win(t, 2.4, 3.4));
    return { calloutOpacity: 1 };
  },
};

// Operating principle: emission, magnetic confinement, ionization, extraction.
const PRINCIPLE_STAGES = [1.0, 6.5, 12.5, 19.5];
const PRINCIPLE_STEPS = [
  { title: 'Электронная эмиссия',
    text: 'Разогретый катод испускает термоэлектроны; напряжение разряда (≈120 В) ускоряет их в камеру' },
  { title: 'Магнитное поле и антикатод',
    text: 'Поле ≈200 Гс вдоль оси разряда удерживает электроны от ухода на стенки; антикатод отражает их, и электроны многократно проходят камеру — рефлексный разряд' },
  { title: 'Ионизация аргона', formula: 'Ar + e⁻ → Ar⁺ + 2e⁻',
    text: 'Длинный путь электронов повышает вероятность ионизирующих столкновений; вдоль оси возникает плазма' },
  { title: 'Извлечение ионов',
    text: 'Плазма на несколько вольт положительнее стенок, ионы уходят к стенкам и в щель. Дальше пучок формирует поле экстракционных электродов — их геометрия и потенциалы определяют его свойства' },
];

const principle = {
  id: 'principle',
  title: 'Принцип работы ионного источника',
  heading: {
    eyebrow: 'Ионный источник',
    title: 'Принцип работы',
    text: 'Как в газоразрядной камере образуются и выходят ионы',
  },
  panel: IBS.panels.steps('steps-principle', PRINCIPLE_STEPS, {
    note: 'Схема принципа, не расчёт IBSimu · Farley, Rose, Ryding, 2004, §8.3 · схема установки',
    legend: [{ kind: 'electron', label: 'электрон e⁻' }, { kind: 'atom', label: 'атом Ar' }, { kind: 'ion', label: 'ион Ar⁺' }],
  }),

  enter(ctx) {
    // Below the chamber, so the label never covers the cathode.
    this.field = ctx.overlay.add({ title: 'B ≈ 200 Гс', subtitle: 'вдоль оси разряда · полярность условна',
                                   anchor: new THREE.Vector3(), row: 0.74, side: 'right' });
  },

  update(t, ctx) {
    const { engine } = ctx;
    const [s1, s2, s3, s4] = PRINCIPLE_STAGES;
    engine.renderer.toneMappingExposure = 1.2;
    engine.setBeamTilt(1);
    const extract = win(t, s4, s4 + 1.5);
    for (const key in engine.parts) {
      let alpha = 1;
      if (key === 'grk_walls') alpha = 0.12;
      else if (key === 'source_diaphragm') alpha = 0.3;
      else if (key === 'accelerating_diaphragm' || key === 'suppressor_diaphragm') alpha = lerp(0.04, 0.4, extract);
      else if (EXTRACTION_PARTS.includes(key)) alpha = 0.04;
      engine.setOpacity(key, alpha);
    }
    engine.setExtraOpacity('grk_filament', 0.6);
    engine.setHighlight('grk_cathode', 0.55 * win(t, 0, 1.2), HOT);
    engine.setHighlight('grk_filament', 0.7 * win(t, 0, 1.2), HOT);
    engine.setHighlight('grk_anticathode', 0.3 * win(t, s2 + 1, s2 + 2) * (1 - win(t, s3, s3 + 1)));

    ctx.plasma.update(t, {
      emit: win(t, s1, s1 + 1),
      field: win(t, s2, s2 + 1.5),
      confine: win(t, s2 + 0.5, s2 + 2.5),
      atoms: win(t, s3, s3 + 1),
      ionize: win(t, s3 + 0.6, s3 + 1.2), ionizeTime: t - (s3 + 0.6),
      column: 0.6 * win(t, s3 + 2.5, s3 + 5),
      extract,
    });

    const back = win(t, s4, s4 + 3);
    sourceView(engine, t, { distance: lerp(0.56, 0.74, back), elevation: lerp(16, 12, back),
                            lift: lerp(0, 30, back), shift: lerp(16, 22, back) });
    engine.ground.grid.material.uniforms.uOpacity.value = 1;

    this.panel.setActive(PRINCIPLE_STAGES.filter((s) => t >= s).length - 1);
    this.panel.setLegend('electron', win(t, s1, s1 + 1));
    this.panel.setLegend('atom', win(t, s3, s3 + 1));
    this.panel.setLegend('ion', win(t, s3 + 0.6, s3 + 1.6));

    const p = ctx.plasma;
    this.field.anchor = new THREE.Vector3(p.axis.x + 10, p.axis.y - 7, p.zCathode + 20);
    this.field.weight = win(t, s2 + 1, s2 + 2) * (1 - win(t, s3, s3 + 1));

    ctx.setHeadingOpacity(win(t, 0.4, 1.4));
    ctx.setLayerOpacity('steps-principle', win(t, 0.6, 1.6));
    return { calloutOpacity: 1 };
  },
};

// Electrodes. The beam turns vertical; the three electrodes whose geometry is
// varied stay solid, the rest of the assembly becomes see-through. Then the
// original diaphragms are wiped into their own versions (data/geometry.own.js).
const ELECTRODES = ['source_diaphragm', 'accelerating_diaphragm', 'suppressor_diaphragm'];
const GHOST_OPACITY = 0.14;
// Labels point at the plate edge facing the viewer's left / right.
const LEFT_FRONT = new THREE.Vector3(-1, 0, 0.55);
const RIGHT_FRONT = new THREE.Vector3(1, 0, 0.55);

const electrodes = {
  id: 'electrodes',
  title: 'Изменяемые электроды',
  heading: {
    eyebrow: 'Параметризация',
    title: 'Изменяемые электроды',
    text: 'Геометрию диафрагмы источника, ускоряющей и подавляющей диафрагм варьируем, остальные детали узла не меняются',
  },

  enter(ctx) {
    const { overlay } = ctx;
    // After the source slides the beam is already vertical and the body see-through.
    this.start = ctx.from ? ctx.from.look.tilt : 0;
    this.labels = [
      [overlay.add({ title: 'Подавляющая диафрагма', subtitle: 'изменяемая геометрия', anchor: new THREE.Vector3(), row: 0.30, side: 'right' }),
       'suppressor_diaphragm', RIGHT_FRONT],
      [overlay.add({ title: 'Ускоряющая диафрагма', subtitle: 'изменяемая геометрия', anchor: new THREE.Vector3(), row: 0.46, side: 'left' }),
       'accelerating_diaphragm', LEFT_FRONT],
      [overlay.add({ title: 'Диафрагма источника', subtitle: 'изменяемая геометрия', anchor: new THREE.Vector3(), row: 0.66, side: 'right' }),
       'source_diaphragm', RIGHT_FRONT],
    ];
  },

  update(t, ctx) {
    const { engine } = ctx;
    engine.renderer.toneMappingExposure = lerp(1.0, 1.3, win(t, 0.4, 2.4));
    const tilt = Math.max(win(t, 0.0, 2.6), this.start);
    engine.setBeamTilt(tilt);

    const ghost = lerp(1, GHOST_OPACITY, Math.max(win(t, 0.4, 2.4), this.start));
    // Original -> own: a cut sweeps across each plate, the own part is left
    // behind it; nothing is half transparent on the way.
    const swap = win(t, 4.0, 6.6);
    for (const key in engine.parts) {
      const base = ELECTRODES.includes(key) ? 1 : ghost;
      const own = key in engine.own;
      engine.setOpacity(key, own && swap >= 1 ? 0 : base);
      engine.setOwnOpacity(key, swap > 0 ? base : 0);
      if (own) engine.setSwap(key, swap);
    }

    // Lower view, so the gap between the source and the accelerating plate shows.
    const focus = engine.partBox(ELECTRODES).getCenter(new THREE.Vector3());
    const k = win(t, 0.0, 3.2);
    engine.setOrbit(0, lerp(22, 16, k), lerp(0.96, 0.78, k),
                    new THREE.Vector3(0, lerp(engine.radius * 0.03, engine.worldY(focus), tilt), 0));
    const omega = (2 * Math.PI) / 90, tau = 3.0;
    engine.turntable.rotation.y = THREE.MathUtils.degToRad(-38) + omega * (t - tau * (1 - Math.exp(-t / tau)));
    engine.ground.grid.material.uniforms.uOpacity.value = 1;

    for (const [label, key, dir] of this.labels) label.anchor = engine.rimPoint(key, dir, 0.92);

    ctx.setHeadingOpacity(win(t, 1.6, 2.8));
    return { calloutOpacity: win(t, 2.8, 3.8) };
  },
};

// IBSimu model. For now only the frame of the slide: the electrode system in
// the geometry used by the calculation. Equations, boundary conditions, fields,
// trajectories and the method go into the slots of IBS.panels.modelFrame
// (js/panels.js) once the model is described; nothing physical is shown yet.
const ibsimu = {
  id: 'ibsimu',
  title: 'Физическая модель IBSimu',
  heading: {
    eyebrow: 'Численная модель',
    title: 'Физическая модель IBSimu',
    text: 'Численное моделирование экстракционного узла',
  },
  panel: IBS.panels.modelFrame('ibsimu', 'Экстракционный узел · геометрия расчёта'),
  enter() {},
  update(t, ctx) {
    const { engine } = ctx;
    engine.renderer.toneMappingExposure = 1.2;
    engine.setBeamTilt(1);
    for (const key in engine.parts) {
      const base = ELECTRODES.includes(key) ? 1 : GHOST_OPACITY;
      engine.setOpacity(key, key in engine.own ? 0 : base);
      engine.setOwnOpacity(key, base);
    }
    const focus = engine.partBox(ELECTRODES).getCenter(new THREE.Vector3());
    engine.setOrbit(0, 20, 0.86, new THREE.Vector3(-engine.radius * 0.42, engine.worldY(focus), 0));
    const omega = (2 * Math.PI) / 120, tau = 3.0;
    engine.turntable.rotation.y = THREE.MathUtils.degToRad(-38) + omega * (t - tau * (1 - Math.exp(-t / tau)));
    engine.ground.grid.material.uniforms.uOpacity.value = 1;
    ctx.setHeadingOpacity(win(t, 0.6, 1.6));
    ctx.setLayerOpacity('ibsimu', win(t, 1.2, 2.4));
    return { calloutOpacity: 0 };
  },
};

// The own electrodes as scene 2 leaves them, dimmed: a backdrop for the cards
// and sections. Without data/geometry.own.js the originals are shown.
function backdrop(t, ctx) {
  const { engine } = ctx;
  engine.renderer.toneMappingExposure = 0.6;
  engine.setBeamTilt(1);
  for (const key in engine.parts) {
    const base = ELECTRODES.includes(key) ? 1 : GHOST_OPACITY;
    engine.setOpacity(key, key in engine.own ? 0 : base);
    engine.setOwnOpacity(key, base);
  }
  const focus = engine.partBox(ELECTRODES).getCenter(new THREE.Vector3());
  engine.setOrbit(0, 24, 0.95, new THREE.Vector3(0, engine.worldY(focus) - engine.radius * 0.12, 0));
  const omega = (2 * Math.PI) / 120, tau = 3.0;
  engine.turntable.rotation.y = THREE.MathUtils.degToRad(-38) + omega * (t - tau * (1 - Math.exp(-t / tau)));
  engine.ground.grid.material.uniforms.uOpacity.value = 0.5;
}

// Scene 3. Three research directions as cards; each opens its own section.
const directions = {
  id: 'directions',
  title: 'Направления исследований',
  heading: {
    eyebrow: 'Исследование',
    title: 'Направления исследований',
    text: 'Три независимых подхода к оптимизации экстракционного узла',
  },
  enter() {},
  update(t, ctx) {
    backdrop(t, ctx);
    ctx.setHeadingOpacity(win(t, 0.6, 1.6));
    ctx.setLayerOpacity('directions', 1);
    IBS.directions.setCardsIn([0, 1, 2].map((i) => win(t, 0.9 + 0.18 * i, 1.9 + 0.18 * i)));
    return { calloutOpacity: 0 };
  },
};

// Sections of the three directions: for now the plan of each study; results
// will come from data/studies.js. Escape / Backspace return to slide 3.
const studies = (IBS.directions ? IBS.directions.list : []).map((d) => ({
  id: 'study-' + d.id,
  title: d.title,
  parent: 'directions',
  heading: { eyebrow: `Направление ${d.number}`, title: d.title, text: d.lead },
  enter() {},
  update(t, ctx) {
    backdrop(t, ctx);
    ctx.setHeadingOpacity(win(t, 0.6, 1.6));
    ctx.setLayerOpacity('study-' + d.id, win(t, 0.8, 1.8));
    return { calloutOpacity: 0 };
  },
}));

// Numbering: main slides 01, 02, …; sections of a slide get its number + .1, .2, …
const scenes = [installation, device, principle, electrodes, ibsimu, directions, ...studies];
const pad = (n) => String(n).padStart(2, '0');
let main = 0;
for (const scene of scenes) {
  if (scene.parent) {
    const parent = scenes.find((s) => s.id === scene.parent);
    parent.children = (parent.children || 0) + 1;
    scene.number = `${parent.number}.${parent.children}`;
  } else {
    scene.number = pad(++main);
  }
}
IBS.scenes = scenes;
IBS.sceneTotal = pad(main);
})();
