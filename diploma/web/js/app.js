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
  const params = new URLSearchParams(location.search);

  const ctx = {
    engine, overlay, data,
    setTitleOpacity: (a) => { $('#title').style.opacity = a; },
    setCreditsOpacity: (a) => { $('#credits').style.opacity = a; },
  };

  const state = { index: 0, t: 0, playing: true };

  function enterScene(index) {
    overlay.clear();
    $('#credits').style.opacity = 0;
    state.index = Math.min(Math.max(index, 0), IBS.scenes.length - 1);
    state.t = 0;
    const scene = IBS.scenes[state.index];
    scene.enter(ctx);
    $('#scene-label').textContent = `${scene.number} · ${scene.title}`;
    $('#scene-count').textContent = `${state.index + 1} / ${IBS.scenes.length}`;
    $('#prev').disabled = state.index === 0;
    $('#next').disabled = state.index === IBS.scenes.length - 1;
  }

  function setPlaying(playing) {
    state.playing = playing;
    $('#play').classList.toggle('paused', !playing);
    $('#play').title = playing ? 'Пауза (пробел)' : 'Воспроизвести (пробел)';
  }

  const actions = {
    next: () => enterScene(state.index + 1),
    prev: () => enterScene(state.index - 1),
    play: () => setPlaying(!state.playing),
    restart: () => { state.t = 0; setPlaying(true); },
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
    ' ': 'play', k: 'play', r: 'restart', f: 'fullscreen', h: 'hud',
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

  enterScene((parseInt(params.get('scene'), 10) || 1) - 1);
  if (params.has('t')) state.t = parseFloat(params.get('t')) || 0;
  if (params.has('paused')) setPlaying(false);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (state.playing) state.t += dt;
    const result = IBS.scenes[state.index].update(state.t, ctx) || {};
    engine.render();
    overlay.update(engine, result.calloutOpacity ?? 1, params.has('paused') ? 1 : dt);
    requestAnimationFrame(frame);
  }
  $('#loading').remove();
  requestAnimationFrame(frame);
  IBS.app = { engine, state, actions };
}

window.addEventListener('DOMContentLoaded', start);
})();
