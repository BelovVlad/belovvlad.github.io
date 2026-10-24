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

IBS.scenes = [installation];
})();
