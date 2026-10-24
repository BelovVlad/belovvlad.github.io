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
    // Lights come up, then the camera settles into a three-quarter view.
    engine.renderer.toneMappingExposure = lerp(0.0, 1.0, win(t, 0.0, 2.0));
    engine.ground.grid.material.uniforms.uOpacity.value = win(t, 0.4, 2.4);
    const k = win(t, 0.0, 5.0);
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
// original diaphragms dissolve into their own versions (data/geometry.own.js).
const ELECTRODES = ['accelerating_diaphragm', 'suppressor_diaphragm'];
const GHOST_OPACITY = 0.14;

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
    const { engine, overlay } = ctx;
    const center = (key) => engine.partBox(key).getCenter(new THREE.Vector3());
    overlay.add({
      title: 'Подавляющая диафрагма',
      subtitle: 'изменяемая геометрия',
      anchor: center('suppressor_diaphragm'),
      row: 0.38, side: 'right',
    });
    overlay.add({
      title: 'Ускоряющая диафрагма',
      subtitle: 'изменяемая геометрия',
      anchor: center('accelerating_diaphragm'),
      row: 0.64, side: 'left',
    });
  },

  update(t, ctx) {
    const { engine } = ctx;
    engine.renderer.toneMappingExposure = lerp(1.0, 1.3, win(t, 0.4, 2.4));
    const tilt = win(t, 0.0, 2.6);
    engine.setBeamTilt(tilt);

    const ghost = lerp(1, GHOST_OPACITY, win(t, 0.4, 2.4));
    // Own part appears under the original first, then the original dissolves:
    // no washed-out moment where both are half transparent.
    const ownIn = win(t, 5.0, 6.4), origOut = win(t, 5.8, 7.6);
    for (const key in engine.parts) {
      const base = ELECTRODES.includes(key) ? 1 : ghost;
      const own = key in engine.own;
      engine.setOpacity(key, own ? base * (1 - origOut) : base);
      engine.setOwnOpacity(key, base * ownIn);
    }

    // Camera looks slightly down on the stacked plates, so apertures and gaps show.
    const focus = engine.partBox(ELECTRODES).getCenter(new THREE.Vector3());
    const k = win(t, 0.0, 3.2);
    engine.setOrbit(0, lerp(22, 28, k), lerp(0.96, 0.8, k),
                    new THREE.Vector3(0, lerp(engine.radius * 0.03, engine.worldY(focus), tilt), 0));

    const omega = (2 * Math.PI) / 90, tau = 3.0;
    engine.turntable.rotation.y = THREE.MathUtils.degToRad(-38) + omega * (t - tau * (1 - Math.exp(-t / tau)));
    engine.ground.grid.material.uniforms.uOpacity.value = 1;

    ctx.setHeadingOpacity(win(t, 1.6, 2.8));
    return { calloutOpacity: win(t, 2.8, 3.8) };
  },
};

IBS.scenes = [installation, electrodes];
})();
