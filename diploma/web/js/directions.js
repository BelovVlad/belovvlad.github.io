// Slide 3 cards and the three research sections, built from data/directions.js.
// Every block is a [data-layer] element: the player fades it like the headings
// and makes it clickable only while it is shown. Cards are plain links (#scene-id),
// so the browser history and the Back button work with no extra code.
(function () {
'use strict';

const IBS = window.IBS = window.IBS || {};
const DIRECTIONS = window.IBS_DIRECTIONS || [];
const STUDIES = window.IBS_STUDIES || {};

const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Illustration slot: media.src, else the animation of a direction with a demo
// (js/cards.js), else an empty frame.
function media(direction) {
  const figure = el('figure', 'card-media');
  const { src, alt, concept } = direction.media || {};
  if (!src && direction.demo && IBS.cards) {
    figure.classList.add('animated');
    figure.append(IBS.cards.canvas(direction.demo.id), el('figcaption', 'media-note', 'иллюстрация · не расчёт IBSimu'));
  } else if (src) {
    const video = /\.(mp4|webm)$/i.test(src);
    const item = el(video ? 'video' : 'img');
    item.src = src;
    if (video) Object.assign(item, { muted: true, loop: true, autoplay: true, playsInline: true });
    else item.alt = alt || '';
    figure.append(item);
    if (concept) figure.append(el('figcaption', 'media-note', 'концептуальная иллюстрация'));
  } else {
    figure.classList.add('empty');
    figure.append(el('span', 'media-number', direction.number));
  }
  return figure;
}

function card(direction) {
  const link = el('a', 'card');
  link.href = '#study-' + direction.id;
  const body = el('div', 'card-body');
  body.append(el('span', 'card-number', direction.number), el('h3', null, direction.title),
              el('p', null, direction.short));
  const go = el('span', 'card-go', 'Открыть раздел');
  go.insertAdjacentHTML('beforeend', ARROW);
  body.append(go);
  link.append(media(direction), body);
  return link;
}

// List items of each section, to mark the one an animation is showing.
const items = {};
// Free slot of a section with an animation (chart, readouts), under the lists.
const slots = {};

function section(direction) {
  const root = el('section', 'layer study');
  root.dataset.layer = 'study-' + direction.id;
  root.setAttribute('aria-label', direction.title);
  const columns = el('div', 'study-columns');
  items[direction.id] = direction.lists.map((list) => {
    const panel = el('div', 'study-panel');
    const ul = el('ul');
    const rows = list.items.map((item) => el('li', null, item));
    ul.append(...rows);
    panel.append(el('h3', null, list.title), ul);
    columns.append(panel);
    return rows;
  });
  if (direction.demo) {
    root.classList.add('has-demo');
    const slot = slots[direction.id] = el('div', 'study-demo');
    columns.append(slot);
    if (direction.demo.note) columns.append(el('p', 'study-demo-note', direction.demo.note));
  }
  const count = ((STUDIES[direction.id] || {}).configurations || []).length;
  const footer = el('div', 'study-footer');
  const back = el('a', 'study-back', 'Направления исследований');
  back.href = '#directions';
  back.insertAdjacentHTML('afterbegin', BACK);
  footer.append(back, el('span', 'study-status',
    count ? `Рассчитанных конфигураций: ${count}` : 'Расчётных данных пока нет'));
  root.append(columns, footer);
  return root;
}

const stage = document.getElementById('stage');
const hud = document.getElementById('hud');
const hub = el('section', 'layer');
hub.id = 'directions';
hub.dataset.layer = 'directions';
hub.setAttribute('aria-label', 'Направления исследований');
const cards = DIRECTIONS.map(card);
hub.append(...cards);
stage.insertBefore(hub, hud);
for (const direction of DIRECTIONS) stage.insertBefore(section(direction), hud);

IBS.directions = {
  list: DIRECTIONS,
  // Staggered entrance of the cards, k_i in 0..1 each.
  setCardsIn(values) { cards.forEach((c, i) => c.style.setProperty('--in', values[i] ?? 1)); },
  // Marks item `index` of list `list` in a section (-1: none marked).
  setActiveItem(id, list, index) {
    (items[id] || []).forEach((rows, l) => {
      rows.forEach((row, i) => row.classList.toggle('active', l === list && i === index));
      if (rows[0]) rows[0].parentElement.classList.toggle('has-active', l === list && index >= 0);
    });
  },
  slot: (id) => slots[id],
};
})();
