// HTML panels of individual slides: numbered step lists, the particle legend,
// source notes and the frame of the IBSimu slide. Each panel is a [data-layer]
// element: the player fades it in and out like the headings.
(function () {
'use strict';

const IBS = window.IBS = window.IBS || {};
const stage = document.getElementById('stage');
const hud = document.getElementById('hud');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function panel(layer) {
  const root = el('section', 'slide-panel');
  root.dataset.layer = layer;
  stage.insertBefore(root, hud);
  return root;
}

// Numbered steps of a slide; the active one is bright and shows its text.
// items: [{ title, text, formula? }]; note: source line under the slide.
function steps(layer, items, { note, legend } = {}) {
  const root = panel(layer);
  const list = el('ol', 'steps');
  const rows = items.map((item, i) => {
    const li = el('li');
    const body = el('div', 'step-body');
    body.append(el('h3', null, item.title));
    const more = el('div', 'step-more');
    const inner = el('div');
    if (item.formula) inner.append(el('div', 'step-formula', item.formula));
    inner.append(el('p', null, item.text));
    more.append(inner);
    body.append(more);
    li.append(el('span', 'step-n', String(i + 1)), body);
    list.append(li);
    return li;
  });
  root.append(list);
  const marks = {};
  if (legend) {
    const box = el('ul', 'legend');
    for (const item of legend) {
      const li = el('li');
      li.append(el('span', `dot ${item.kind}`), el('span', null, item.label));
      box.append(li);
      marks[item.kind] = li;
    }
    root.append(box);
  }
  if (note) root.append(el('p', 'source-note', note));
  let active = -1;
  return {
    setActive(index) {
      if (index === active) return;
      active = index;
      rows.forEach((row, i) => { row.classList.toggle('active', i === index); row.classList.toggle('done', i < index); });
    },
    setLegend(kind, opacity) { if (marks[kind]) marks[kind].style.opacity = opacity; },
  };
}

// IBSimu model slide: a quiet frame around the electrode system and the
// slots for the future content.
// TODO(физическая модель): when the model is described, fill the slots:
//   equations  — уравнения (Пуассон, движение ионов)
//   boundaries — граничные условия и потенциалы электродов
//   fields     — визуализация рассчитанных полей
//   paths      — траектории частиц
//   method     — численный метод и итерации
// Empty slots are not displayed (.model-slot:empty in style.css).
function modelFrame(layer, caption) {
  const root = panel(layer);
  const frame = el('div', 'model-frame');
  for (const corner of ['tl', 'tr', 'bl', 'br']) frame.append(el('span', `corner ${corner}`));
  frame.append(el('p', 'model-caption', caption));
  const slots = el('div', 'model-slots');
  for (const name of ['equations', 'boundaries', 'fields', 'paths', 'method']) {
    const slot = el('div', 'model-slot');
    slot.dataset.slot = name;
    slots.append(slot);
  }
  root.append(frame, slots);
  return { root, slots };
}

IBS.panels = { steps, modelFrame };
})();
