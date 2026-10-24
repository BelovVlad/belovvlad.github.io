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
  number: '01',
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

// Scene 2. The beam turns vertical; only the two electrodes whose geometry is
// varied stay solid, the source and the Faraday cup become see-through. Then the
// original diaphragms dissolve into their own versions (data/geometry.own.js),
// and the suppressor lifts along the beam to uncover the accelerating diaphragm.
const ELECTRODES = ['accelerating_diaphragm', 'suppressor_diaphragm'];
const GHOST_OPACITY = 0.14;
const SUPPRESSOR_LIFT_MM = 34;
// Labels point at the plate edge facing the viewer's left / right.
const LEFT_FRONT = new THREE.Vector3(-1, 0, 0.55);
const RIGHT_FRONT = new THREE.Vector3(1, 0, 0.55);

const electrodes = {
  id: 'electrodes',
  number: '02',
  title: 'Изменяемые электроды',
  heading: {
    eyebrow: 'Параметризация',
    title: 'Изменяемые электроды',
    text: 'Геометрию ускоряющей и подавляющей диафрагм варьируем, остальные детали узла не меняются',
  },

  enter(ctx) {
    const { overlay } = ctx;
    this.suppressorLabel = overlay.add({
      title: 'Подавляющая диафрагма',
      subtitle: 'изменяемая геометрия',
      anchor: new THREE.Vector3(),
      row: 0.34, side: 'right',
    });
    this.acceleratingLabel = overlay.add({
      title: 'Ускоряющая диафрагма',
      subtitle: 'изменяемая геометрия',
      anchor: new THREE.Vector3(),
      row: 0.66, side: 'left',
    });
  },

  update(t, ctx) {
    const { engine } = ctx;
    engine.renderer.toneMappingExposure = lerp(1.0, 1.3, win(t, 0.4, 2.4));
    const tilt = win(t, 0.0, 2.6);
    engine.setBeamTilt(tilt);

    const ghost = lerp(1, GHOST_OPACITY, win(t, 0.4, 2.4));
    // Original -> own: a cut sweeps across each plate, the own part is left
    // behind it; nothing is half transparent on the way.
    const swap = win(t, 5.0, 7.6);
    for (const key in engine.parts) {
      const base = ELECTRODES.includes(key) ? 1 : ghost;
      const own = key in engine.own;
      engine.setOpacity(key, own && swap >= 1 ? 0 : base);
      engine.setOwnOpacity(key, swap > 0 ? base : 0);
      if (own) engine.setSwap(key, swap);
    }

    // Next step: the suppressor rises, the camera looks down onto the accelerating plate.
    const open = win(t, 8.6, 11.0);
    const lift = SUPPRESSOR_LIFT_MM * open;
    engine.setLift('suppressor_diaphragm', lift);

    const focus = engine.partBox(ELECTRODES).getCenter(new THREE.Vector3());
    focus.y += lift * 0.5;
    const k = win(t, 0.0, 3.2);
    engine.setOrbit(0, lerp(lerp(22, 28, k), 40, open), lerp(lerp(0.96, 0.8, k), 0.74, open),
                    new THREE.Vector3(0, lerp(engine.radius * 0.03, engine.worldY(focus), tilt), 0));

    const omega = (2 * Math.PI) / 90, tau = 3.0;
    engine.turntable.rotation.y = THREE.MathUtils.degToRad(-38) + omega * (t - tau * (1 - Math.exp(-t / tau)));
    engine.ground.grid.material.uniforms.uOpacity.value = 1;

    this.acceleratingLabel.anchor = engine.rimPoint('accelerating_diaphragm', LEFT_FRONT, 0.92);
    this.suppressorLabel.anchor = engine.rimPoint('suppressor_diaphragm', RIGHT_FRONT, 0.92, lift);

    ctx.setHeadingOpacity(win(t, 1.6, 2.8));
    return { calloutOpacity: win(t, 2.8, 3.8) };
  },
};

// Scene 3. The source (GRK) diaphragm turns solid too: all three varied
// electrodes, in their own geometry, at their real places along the beam.
const ALL_ELECTRODES = ['source_diaphragm', ...ELECTRODES];

const sourceDiaphragm = {
  id: 'source-diaphragm',
  number: '03',
  title: 'Диафрагма источника',
  heading: {
    eyebrow: 'Параметризация',
    title: 'Диафрагма источника',
    text: 'Диафрагма газоразрядной камеры — третий изменяемый электрод',
  },

  enter(ctx) {
    const { overlay } = ctx;
    this.labels = [
      [overlay.add({ title: 'Подавляющая диафрагма', anchor: new THREE.Vector3(), row: 0.30, side: 'right' }),
       'suppressor_diaphragm', RIGHT_FRONT],
      [overlay.add({ title: 'Ускоряющая диафрагма', anchor: new THREE.Vector3(), row: 0.46, side: 'left' }),
       'accelerating_diaphragm', LEFT_FRONT],
      [overlay.add({ title: 'Диафрагма источника', subtitle: 'изменяемая геометрия', anchor: new THREE.Vector3(), row: 0.66, side: 'right' }),
       'source_diaphragm', RIGHT_FRONT],
    ];
  },

  update(t, ctx) {
    const { engine } = ctx;
    engine.renderer.toneMappingExposure = 1.3;
    engine.setBeamTilt(1);
    for (const key in engine.parts) {
      const solid = ALL_ELECTRODES.includes(key);
      const base = solid ? 1 : GHOST_OPACITY;
      engine.setOpacity(key, key in engine.own ? 0 : base);
      engine.setOwnOpacity(key, base);
    }

    // Lower view, so the gap between the source and the accelerating plate shows.
    const focus = engine.partBox(ALL_ELECTRODES).getCenter(new THREE.Vector3());
    engine.setOrbit(0, 16, 0.78, new THREE.Vector3(0, engine.worldY(focus), 0));
    const omega = (2 * Math.PI) / 90, tau = 3.0;
    engine.turntable.rotation.y = THREE.MathUtils.degToRad(-38) + omega * (t - tau * (1 - Math.exp(-t / tau)));
    engine.ground.grid.material.uniforms.uOpacity.value = 1;

    for (const [label, key, dir] of this.labels) label.anchor = engine.rimPoint(key, dir, 0.92);

    ctx.setHeadingOpacity(win(t, 0.8, 2.0));
    return { calloutOpacity: win(t, 2.0, 3.0) };
  },
};

IBS.scenes = [installation, electrodes, sourceDiaphragm];
})();
