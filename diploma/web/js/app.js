// Scene player: clock, navigation and keyboard control.
// URL options for previews/screenshots: ?scene=1&t=6&paused
(function () {
'use strict';

const IBS = window.IBS;
const $ = (selector) => document.querySelector(selector);

function fail(message) {
  $('#loading').classList.add('error');
  $('#loading').textContent = message;
}

function start() {
  const data = window.IBS_GEOMETRY;
  if (!data) return fail('Нет data/geometry.js — выполните presentation/build_scene_data.py');
  let engine;
  try {
    engine = new IBS.Engine($('#viewport'), data);
  } catch (error) {
    console.error(error);
    return fail('WebGL недоступен в этом браузере: ' + error.message);
  }
  const overlay = new IBS.Overlay($('#stage'));
  const plasma = new IBS.Plasma(engine);
  const field = new IBS.Field(engine);
  const params = new URLSearchParams(location.search);

  // Text blocks: the scene sets its opacity each frame; text of the previous
  // scene fades out over TEXT_FADE seconds instead of vanishing.
  const TEXT_FADE = 0.7, CAMERA_BLEND = 2.4;
  // [data-layer] blocks (cards, sections) fade the same way and take clicks only while shown.
  const texts = { title: $('#title'), credits: $('#credits'), heading: $('#heading') };
  for (const layer of document.querySelectorAll('[data-layer]')) texts[layer.dataset.layer] = layer;
  const shown = {}, leaving = {};
  for (const name in texts) shown[name] = leaving[name] = 0;
  let pendingHeading = null;

  const ctx = {
    engine, overlay, plasma, field, data,
    setTitleOpacity: (a) => { shown.title = a; },
    setCreditsOpacity: (a) => { shown.credits = a; },
    setHeadingOpacity: (a) => { shown.heading = a; },
    setLayerOpacity: (name, a) => { shown[name] = a; },
  };

  const state = { index: 0, t: 0, playing: true, from: null };

  // Where the model and camera are right now: the next scene starts from here.
  function snapshot() {
    return { turn: engine.turntable.rotation.y, camera: engine.camera.position.clone(), target: engine.target.clone(),
             exposure: engine.renderer.toneMappingExposure, look: engine.look() };
  }

  function setHeading(heading) {
    $('#heading .eyebrow').textContent = heading.eyebrow || '';
    $('#heading h2').textContent = heading.title || '';
    $('#heading p').textContent = heading.text || '';
  }

  function enterScene(index, first = false) {
    state.from = first ? null : snapshot();
    overlay.clear();
    for (const name in texts) leaving[name] = parseFloat(texts[name].style.opacity) || 0;
    engine.reset();
    field.hide();   // the potential plane belongs to its section only
    state.index = Math.min(Math.max(index, 0), IBS.scenes.length - 1);
    state.t = 0;
    const scene = IBS.scenes[state.index];
    // A new heading text waits until the old one has faded out.
    pendingHeading = scene.heading || {};
    if (leaving.heading === 0) { setHeading(pendingHeading); pendingHeading = null; }
    ctx.from = state.from;
    scene.enter(ctx);
    $('#scene-label').textContent = `${scene.number} · ${scene.title}`;
    // Count of main slides; a section shows its own number (06.2 / 06).
    $('#scene-count').textContent = `${scene.number} / ${IBS.sceneTotal}`;
    $('#prev').disabled = state.index === 0;
    $('#next').disabled = state.index === IBS.scenes.length - 1;
    // The address names the scene (#directions, #study-geometry): reload and links keep it.
    if (location.hash !== '#' + scene.id) history.replaceState(null, '', '#' + scene.id);
  }

  const sceneIndex = (id) => IBS.scenes.findIndex((scene) => scene.id === id);
  // Cards and Back links change the hash; browser Back/Forward do too.
  window.addEventListener('hashchange', () => {
    const index = sceneIndex(location.hash.slice(1));
    if (index >= 0 && index !== state.index) enterScene(index);
  });

  function setPlaying(playing) {
    state.playing = playing;
    $('#play').classList.toggle('paused', !playing);
    $('#play').title = playing ? 'Пауза (пробел)' : 'Воспроизвести (пробел)';
  }

  const actions = {
    next: () => enterScene(state.index + 1),
    prev: () => enterScene(state.index - 1),
    up: () => {
      const parent = sceneIndex(IBS.scenes[state.index].parent);
      if (parent >= 0) location.hash = IBS.scenes[parent].id;
    },
    play: () => setPlaying(!state.playing),
    restart: () => { state.from = snapshot(); state.t = 0; setPlaying(true); },
    fullscreen: () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    },
    hud: () => document.body.classList.toggle('hud-hidden'),
  };
  for (const name of ['next', 'prev', 'play', 'restart', 'fullscreen'])
    $('#' + name).addEventListener('click', actions[name]);

  const keys = {
    ArrowRight: 'next', PageDown: 'next', ArrowLeft: 'prev', PageUp: 'prev',
    Escape: 'up', Backspace: 'up', ' ': 'play', k: 'play', r: 'restart', f: 'fullscreen', h: 'hud',
  };
  window.addEventListener('keydown', (event) => {
    const action = keys[event.key] || keys[event.key.toLowerCase()];
    if (!action || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    actions[action]();
  });

  // Controls fade out while the presenter is not using the mouse.
  let idleTimer;
  const wake = () => {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add('idle'), 2500);
  };
  window.addEventListener('mousemove', wake);
  wake();

  const fromHash = sceneIndex(location.hash.slice(1));
  enterScene(fromHash >= 0 ? fromHash : (parseInt(params.get('scene'), 10) || 1) - 1, true);
  if (params.has('t')) state.t = parseFloat(params.get('t')) || 0;
  if (params.has('paused')) setPlaying(false);

  // Camera, turntable, exposure and part looks glide from where the previous scene left them.
  function blendFromPrevious(t) {
    const from = state.from;
    if (!from) return;
    const k = IBS.ease.window(t, 0, CAMERA_BLEND);
    engine.blendLook(from.look, k);
    if (k >= 1) return;
    const turn = engine.turntable.rotation.y;
    const delta = Math.atan2(Math.sin(turn - from.turn), Math.cos(turn - from.turn));
    engine.turntable.rotation.y = turn - delta * (1 - k);
    engine.target.lerpVectors(from.target, engine.target, k);
    engine.camera.position.lerpVectors(from.camera, engine.camera.position, k);
    engine.camera.lookAt(engine.target);
    engine.renderer.toneMappingExposure += (from.exposure - engine.renderer.toneMappingExposure) * (1 - k);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (state.playing) state.t += dt;
    const scene = IBS.scenes[state.index];
    field.step(6);   // potential field of the potentials section, solved in the background
    for (const name in shown) shown[name] = 0;
    ctx.from = state.from;
    const result = scene.update(state.t, ctx) || {};
    blendFromPrevious(state.t);
    plasma.frame(dt);
    const fade = 1 - IBS.ease.window(state.t, 0, TEXT_FADE);
    if (pendingHeading && fade === 0) { setHeading(pendingHeading); pendingHeading = null; }
    for (const name in texts) {
      const old = leaving[name] * fade;
      const opacity = name === 'heading' && pendingHeading ? old : Math.max(shown[name], old);
      texts[name].style.opacity = opacity;
      if (texts[name].dataset.layer) {
        const off = shown[name] < 0.5;
        if (texts[name].inert !== off) texts[name].inert = off;
        texts[name].style.visibility = opacity > 0 ? 'visible' : 'hidden';
      }
    }
    engine.render();
    overlay.update(engine, result.calloutOpacity ?? 1, params.has('paused') ? 1 : dt);
    requestAnimationFrame(frame);
  }
  $('#loading').remove();
  requestAnimationFrame(frame);
  IBS.app = { engine, field, state, actions };
}

// Own electrode geometry is optional and exists only in the local copy.
function loadOwnGeometry() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'data/geometry.own.js';
    script.onload = script.onerror = () => { script.remove(); resolve(); };
    document.head.appendChild(script);
  });
}

window.addEventListener('DOMContentLoaded', () => loadOwnGeometry().then(start));
})();
