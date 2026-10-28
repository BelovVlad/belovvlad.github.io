import defaults, { SITE_SEARCH } from './config.js';
import { materialsSource, highlight } from './site-search.js';
import { STORAGE_KEY, ICONS, clone, validateConfig, safeUrl, filterResources, moveResource, migrateConfig } from './model.js';
import { icon } from './icons.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const iconNames = { book:'Книга', code:'Код', tool:'Инструмент', link:'Ссылка', user:'Личное', pen:'Перо', github:'GitHub', globe:'Глобус', folder:'Папка', star:'Звезда' };
let config = clone(defaults), selected = 'all', query = '', editingResource = null, editingCategory = null, toastTimer, pendingImport, loadWarning = '', storageBlocked = false;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = validateConfig(JSON.parse(saved));
    config = migrateConfig(parsed);
    if (config !== parsed) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); }
      catch { loadWarning = 'Обновлённая коллекция только в памяти. Скачайте копию в настройках.'; }
    }
  }
} catch {
  storageBlocked = true;
  loadWarning = 'Сохранённые данные не удалось прочитать. Они не перезаписаны. Можно экспортировать текущую коллекцию или импортировать копию в настройках.';
}
const systemTheme = matchMedia('(prefers-color-scheme: light)');
function applyTheme() {
  const theme = config.settings.theme === 'system' ? (systemTheme.matches ? 'light' : 'dark') : config.settings.theme;
  document.documentElement.dataset.theme = theme;
  $('meta[name="theme-color"]').content = theme === 'light' ? '#f5f3ef' : '#080d12';
  $('#theme-select').value = config.settings.theme;
}
function notify(message) {
  const dialogs = [...document.querySelectorAll('dialog[open]')];
  (dialogs.at(-1) || document.body).append($('#toast'));
  $('#toast').textContent = message; $('#toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 5000);
}
function save(message) {
  let saved = false;
  try {
    if (storageBlocked) throw new Error('unreadable original');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); saved = true;
  } catch {
    $('#save-status').textContent = 'Не сохранено · экспортируйте JSON';
    notify('Изменения только в памяти. Скачайте JSON в настройках: сохранение браузера недоступно.');
  }
  if (saved) { $('#save-status').innerHTML = '<span class="status-dot"></span>Сохранено в этом браузере'; if (message) notify(message); }
  render();
}
function targetAttrs() { return config.settings.newTab ? 'target="_blank" rel="noopener noreferrer"' : ''; }
function categoryName(id) { return config.categories.find(c => c.id === id)?.name || ''; }
function navButton(id, name, glyph, count) { return `<button class="nav-button ${selected === id ? 'active' : ''}" data-category="${escape(id)}" ${selected === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${escape(name)}</span><span class="nav-count">${count}</span></button>`; }
function renderNavigation() {
  const visible = config.categories.filter(c => c.id === selected || config.resources.some(r => r.category === c.id));
  $('#navigation').innerHTML = navButton('all','Все','home',config.resources.length) + navButton('favorites','Избранное','star',config.resources.filter(r => r.favorite).length) + visible.map(c => navButton(c.id,c.name,c.icon,config.resources.filter(r => r.category === c.id).length)).join('');
}
function resourceCard(r) {
  const peers = config.resources.filter(item => item.category === r.category), index = peers.findIndex(item => item.id === r.id);
  const title = r.url ? `<a class="card-link" href="${escape(r.url)}" ${targetAttrs()}>${escape(r.title)}</a>` : `<button class="card-link draft-title" data-action="edit" data-id="${escape(r.id)}">${escape(r.title)}</button>`;
  return `<article class="resource-card" data-id="${escape(r.id)}" data-icon="${r.icon}"><div class="card-top"><span class="resource-icon">${icon(r.icon)}</span><div class="card-actions"><button class="icon-button pin ${r.favorite ? 'active' : ''}" data-action="pin" aria-label="${r.favorite ? 'Убрать из избранного' : 'В избранное'}: ${escape(r.title)}" aria-pressed="${r.favorite}">${icon('star')}</button><button class="icon-button menu-trigger" data-action="menu" aria-label="Действия: ${escape(r.title)}" aria-expanded="false">${icon('more')}</button><div class="card-menu" hidden><button data-action="edit">Редактировать</button><button data-action="up" ${index === 0 ? 'disabled' : ''}>Переместить выше</button><button data-action="down" ${index === peers.length-1 ? 'disabled' : ''}>Переместить ниже</button><button class="danger" data-action="delete">Удалить ресурс</button></div></div></div><h3 class="card-title">${title}</h3><p class="card-description">${escape(r.description)}</p><div class="card-bottom"><span class="resource-tag">${escape(categoryName(r.category))}</span>${r.url ? `<span class="card-domain">${escape(new URL(r.url).hostname.replace(/^www\./, ''))}</span><span class="open-arrow">${icon('arrow')}</span>` : '<span class="draft-tag">Скоро</span><button class="draft-button" data-action="edit">Добавить ссылку →</button>'}</div></article>`;
}
const siteSources = SITE_SEARCH.map(materialsSource);
let siteQuery = '', siteTimer;
function siteResultsHtml(source, result, q) {
  const groups = result.groups.slice(0, 6), total = result.groups.reduce((n, g) => n + g.hits.length, 0);
  const items = groups.map(g => `<article class="site-hit"><a class="site-hit-main" href="${escape(g.url)}" ${targetAttrs()}><div class="site-hit-top">${g.badge ? `<span class="site-hit-badge">${escape(g.badge)}</span>` : ''}<span class="site-hit-title">${highlight(g.title, result.stems)}</span><span class="site-hit-count">${g.hits.length} совп.</span></div>${g.meta ? `<div class="site-hit-meta">${escape(g.meta)}</div>` : ''}${g.snippet ? `<div class="site-hit-snippet">${highlight(g.snippet, result.stems)}</div>` : ''}</a><div class="site-hit-pages">${g.hits.slice(0, 8).map(h => `<a href="${escape(h.url)}" ${targetAttrs()}>${escape(h.label)}</a>`).join('')}${g.hits.length > 8 ? `<span>+${g.hits.length - 8}</span>` : ''}</div></article>`).join('');
  const summary = result.groups.length ? `${result.groups.length} док. · ${total} совп.${result.incomplete ? ' · индекс загружен не полностью' : ''}` : 'В тексте материалов ничего не найдено';
  return `<div class="site-source"><div class="site-source-head"><h3>${escape(source.name)}</h3><span class="count">${summary}</span>${result.groups.length ? `<a class="site-source-all" href="${escape(source.allUrl(q))}" ${targetAttrs()}>Все результаты${icon('arrow')}</a>` : ''}</div>${items}</div>`;
}
// Content search runs only for a new query; resource re-renders reuse what is shown.
function scheduleSiteSearch() {
  const q = query.trim(), box = $('#site-results');
  if (q === siteQuery) return;
  siteQuery = q; clearTimeout(siteTimer);
  if (q.length < 2 || !siteSources.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<div class="site-results-head"><h2 id="site-results-title">В материалах сайтов</h2></div>` + siteSources.map(s => `<div class="site-source" data-source="${escape(s.id)}"><div class="site-source-head"><h3>${escape(s.name)}</h3><span class="count">Ищу в тексте…</span></div></div>`).join('');
  siteTimer = setTimeout(() => siteSources.forEach(async source => {
    let html;
    try { html = siteResultsHtml(source, await source.search(q), q); }
    catch (error) {
      if (error.name === 'AbortError') return;
      html = `<div class="site-source"><div class="site-source-head"><h3>${escape(source.name)}</h3><span class="count">Поиск по тексту сейчас недоступен</span><a class="site-source-all" href="${escape(source.allUrl(q))}" ${targetAttrs()}>Искать на сайте${icon('arrow')}</a></div></div>`;
    }
    if (q !== siteQuery) return;
    box.querySelector(`[data-source="${CSS.escape(source.id)}"]`)?.replaceWith(Object.assign(document.createElement('template'), { innerHTML:html }).content);
  }), 250);
}
function renderResources() { renderResourceCards(); scheduleSiteSearch(); }
function renderResourceCards() {
  const results = filterResources(config, {query, category:['all','favorites'].includes(selected) ? 'all' : selected, favorites:selected === 'favorites'});
  $('#resource-count').textContent = results.length;
  $('#library-title').firstChild.textContent = query.trim() ? 'Поиск ' : selected === 'all' ? 'Ресурсы ' : selected === 'favorites' ? 'Избранное ' : categoryName(selected) + ' ';
  $('#resources').classList.toggle('list-view', config.settings.view === 'list');
  for (const view of ['grid','list']) { $(`#view-${view}`).classList.toggle('active',config.settings.view === view); $(`#view-${view}`).setAttribute('aria-pressed',String(config.settings.view === view)); }
  if (results.length) {
    const ordered = selected === 'all' && !query.trim() ? [...results].sort((a,b) => Number(b.favorite)-Number(a.favorite)) : results;
    $('#resources').innerHTML = ordered.map(r => resourceCard(r)).join('');
    return;
  }
  const matching = config.categories.filter(c => (selected === 'all' || selected === c.id) && [c.name,c.description].join(' ').toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
  if (selected !== 'favorites' && matching.length && (query.trim() || selected !== 'all')) {
    $('#resources').innerHTML = matching.map(c => `<div class="empty-state" data-category-section="${escape(c.id)}">${icon(c.icon)}<h3>${escape(c.name)}</h3><p>В разделе пока нет ресурсов.</p><button class="button" data-add-to="${escape(c.id)}">${icon('plus')}Добавить ресурс</button></div>`).join('');
    return;
  }
  $('#resources').innerHTML = `<div class="empty-state">${icon(query ? 'search' : 'star')}<h3>${query ? 'Ничего не нашлось' : selected === 'favorites' ? 'Пока без избранного' : 'Начните с первого ресурса'}</h3><p>${query ? 'Попробуйте другое название или раздел.' : selected === 'favorites' ? 'Звезда на карточке закрепит ресурс наверху.' : 'Добавьте сайт, проект или полезную ссылку.'}</p><button class="button" data-action="clear-filters">${query ? 'Сбросить поиск' : 'Все ресурсы'}</button></div>`;
}
function renderManager() {
  $('#category-manager').innerHTML = config.categories.map(c => `<div class="manager-row">${icon(c.icon)}<span>${escape(c.name)}</span><button data-edit-category="${escape(c.id)}" aria-label="Изменить раздел ${escape(c.name)}">Изменить</button><button data-delete-category="${escape(c.id)}" aria-label="Удалить раздел ${escape(c.name)}">Удалить</button></div>`).join('');
}
function renderWidgets() {
  $('#tasks-widget').hidden = !config.settings.showTasks;
  $('#todo-count').textContent = `${config.todos.filter(t => t.done).length} / ${config.todos.length}`;
  $('#todos').innerHTML = config.todos.map(t => `<div class="todo-row ${t.done ? 'done' : ''}"><label><input type="checkbox" data-todo="${escape(t.id)}" ${t.done ? 'checked' : ''}><span>${escape(t.text)}</span></label><button class="icon-button" data-delete-todo="${escape(t.id)}" aria-label="Удалить задачу: ${escape(t.text)}">${icon('close')}</button></div>`).join('');
}
function render() { renderNavigation(); renderResources(); renderManager(); renderWidgets(); applyTheme(); $('#new-tab').checked = config.settings.newTab; $('#show-tasks').checked = config.settings.showTasks; }
function selectSettingsTab(name, focus = false) {
  document.querySelectorAll('[data-settings-tab]').forEach(tab => { const active = tab.dataset.settingsTab === name; tab.setAttribute('aria-selected',String(active)); tab.tabIndex = active ? 0 : -1; $(`#panel-${tab.dataset.settingsTab}`).hidden = !active; if (active && focus) tab.focus(); });
}
function closeMenus() { document.querySelectorAll('.card-menu').forEach(menu => { menu.hidden = true; menu.previousElementSibling.setAttribute('aria-expanded','false'); }); }
function showSettings() { $('#import-error').textContent = ''; selectSettingsTab('general'); $('#settings-dialog').showModal(); }
function iconOptions() { return ICONS.map(i => `<option value="${i}">${iconNames[i]}</option>`).join(''); }
function openResource(id = null, category = null) {
  if (!config.categories.length) { notify('Сначала создайте раздел для ресурсов.'); openCategory(); return; }
  closeMenus(); editingResource = id;
  const form = $('#resource-form'); form.reset(); $('#resource-error').textContent = '';
  form.elements.category.innerHTML = config.categories.map(c => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
  form.elements.icon.innerHTML = iconOptions();
  const item = config.resources.find(r => r.id === id);
  $('#resource-dialog-title').textContent = item ? 'Редактировать ресурс' : 'Новый ресурс';
  if (item) for (const name of ['title','description','url','category','icon']) form.elements[name].value = item[name];
  else { form.elements.category.value = category || (config.categories.some(c => c.id === selected) ? selected : config.categories[0].id); form.elements.icon.value = 'globe'; }
  form.elements.favorite.checked = item?.favorite || false;
  $('#resource-dialog').showModal();
}
function openCategory(id = null) {
  editingCategory = id; const form = $('#category-form'); form.reset(); form.elements.icon.innerHTML = iconOptions(); form.elements.icon.value = 'folder'; $('#category-error').textContent = '';
  const c = config.categories.find(c => c.id === id); $('#category-dialog-title').textContent = c ? 'Редактировать раздел' : 'Новый раздел';
  if (c) for (const name of ['name','description','icon']) form.elements[name].value = c[name];
  $('#category-dialog').showModal();
}
function confirmAction(title, message, action, button = 'Удалить') {
  $('#confirm-title').textContent = title; $('#confirm-message').textContent = message; $('#confirm-accept').textContent = button;
  $('#confirm-accept').onclick = () => { $('#confirm-dialog').close(); action(); };
  $('#confirm-dialog').showModal(); $('#confirm-cancel').focus();
}

document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
function updateClock() { $('#top-date').textContent = new Intl.DateTimeFormat('ru', { day:'numeric', month:'long', weekday:'long' }).format(new Date()); $('#hero-time').textContent = new Intl.DateTimeFormat('ru', {hour:'2-digit',minute:'2-digit'}).format(new Date()); }
updateClock(); setInterval(updateClock,30000);
$('#navigation').addEventListener('click', event => { const button = event.target.closest('[data-category]'); if (!button) return; selected = button.dataset.category; query = ''; $('#search').value = ''; render(); });
$('#search').addEventListener('input', event => { query = event.target.value; renderResources(); });
$('#search').addEventListener('search', event => { query = event.target.value; renderResources(); });
$('#add-resource').onclick = () => openResource();
$('#settings-add-category').onclick = () => openCategory();
$('#settings-button').onclick = showSettings;
$('#theme-select').onchange = event => { config.settings.theme = event.target.value; save(); };
systemTheme.addEventListener('change', applyTheme);
$('#new-tab').onchange = event => { config.settings.newTab = event.target.checked; save(); };
$('#show-tasks').onchange = event => { config.settings.showTasks = event.target.checked; save(); };
document.querySelectorAll('[data-settings-tab]').forEach(tab => {
  tab.onclick = () => selectSettingsTab(tab.dataset.settingsTab);
  tab.onkeydown = event => {
    const tabs = [...document.querySelectorAll('[data-settings-tab]')], current = tabs.indexOf(tab);
    const next = event.key === 'ArrowRight' ? (current+1)%tabs.length : event.key === 'ArrowLeft' ? (current+tabs.length-1)%tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : -1;
    if (next >= 0) { event.preventDefault(); selectSettingsTab(tabs[next].dataset.settingsTab,true); }
  };
});
for (const view of ['grid','list']) $(`#view-${view}`).onclick = () => { config.settings.view = view; save(); };
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); $('#search').focus(); $('#search').select(); }
  if (event.key === 'Escape') closeMenus();
});
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }));
$('#confirm-cancel').onclick = () => $('#confirm-dialog').close();
document.addEventListener('click', event => {
  const add = event.target.closest('[data-add-to]'); if (add) { openResource(null, add.dataset.addTo); return; }
  if (!event.target.closest('.card-actions')) closeMenus();
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action;
  if (action === 'clear-filters') { query = ''; selected = 'all'; $('#search').value = ''; render(); return; }
  const id = button.dataset.id || button.closest('[data-id]')?.dataset.id;
  const item = config.resources.find(r => r.id === id); if (!item) return;
  if (action === 'menu') { const menu = button.nextElementSibling, open = menu.hidden; closeMenus(); menu.hidden = !open; button.setAttribute('aria-expanded',String(open)); if (open) menu.querySelector('button').focus(); }
  if (action === 'pin') { item.favorite = !item.favorite; save(item.favorite ? 'Добавлено в быстрый доступ' : 'Убрано из быстрого доступа'); }
  if (action === 'edit') openResource(id);
  if (action === 'up' || action === 'down') { moveResource(config,id,action === 'up' ? -1 : 1); save('Порядок ресурсов изменён'); }
  if (action === 'delete') { closeMenus(); confirmAction('Удалить ресурс?', `«${item.title}» будет удалён из вашей коллекции в этом браузере.`, () => { config.resources = config.resources.filter(r => r.id !== id); save('Ресурс удалён'); }); }
});
$('#resource-form').onsubmit = event => {
  event.preventDefault(); const form = event.target; const url = form.elements.url.value.trim();
  if (url && !safeUrl(url)) { $('#resource-error').textContent = 'Введите полный адрес http:// или https://.'; return; }
  const item = { id: editingResource || crypto.randomUUID(), title: form.elements.title.value.trim(), description: form.elements.description.value.trim(), url, category: form.elements.category.value, icon: form.elements.icon.value, favorite: form.elements.favorite.checked };
  if (!item.title) { $('#resource-error').textContent = 'Введите название ресурса.'; return; }
  const index = config.resources.findIndex(r => r.id === editingResource);
  if (index >= 0) config.resources[index] = item; else config.resources.push(item);
  $('#resource-dialog').close(); save('Ресурс сохранён');
};
$('#category-form').onsubmit = event => {
  event.preventDefault(); const form = event.target, name = form.elements.name.value.trim();
  if (!name) { $('#category-error').textContent = 'Введите название раздела.'; return; }
  if (config.categories.some(c => c.id !== editingCategory && c.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) { $('#category-error').textContent = 'Раздел с таким названием уже существует.'; return; }
  const c = { id: editingCategory || crypto.randomUUID(), name, description: form.elements.description.value.trim(), icon: form.elements.icon.value };
  const index = config.categories.findIndex(c => c.id === editingCategory); if (index >= 0) config.categories[index] = c; else config.categories.push(c);
  if (!editingCategory) { selected = c.id; query = ''; $('#search').value = ''; }
  $('#category-dialog').close(); save('Раздел сохранён');
};
$('#category-manager').onclick = event => {
  const edit = event.target.closest('[data-edit-category]'); if (edit) { openCategory(edit.dataset.editCategory); return; }
  const del = event.target.closest('[data-delete-category]'); if (!del) return;
  const id = del.dataset.deleteCategory, c = config.categories.find(c => c.id === id);
  if (config.resources.some(r => r.category === id)) { notify('Сначала переместите ресурсы в другой раздел через редактирование карточек.'); return; }
  confirmAction('Удалить раздел?', `Пустой раздел «${c.name}» будет удалён.`, () => { config.categories = config.categories.filter(c => c.id !== id); if (selected === id) selected = 'all'; save('Раздел удалён'); });
};
$('#export-config').onclick = () => {
  const blob = new Blob([JSON.stringify(config,null,2)], { type:'application/json' }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `pweb-home-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
};
$('#import-config').onclick = () => $('#import-file').click();
$('#import-file').onchange = async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Файл должен быть не больше 2 МБ.');
    pendingImport = migrateConfig(validateConfig(JSON.parse(await file.text()))); $('#import-error').textContent = '';
    confirmAction('Импортировать коллекцию?', `В файле ${pendingImport.resources.length} ресурсов и ${pendingImport.categories.length} разделов. Они заменят текущую коллекцию. Перед заменой можно отменить действие и скачать экспорт.`, () => { config = pendingImport; pendingImport = null; storageBlocked = false; selected = 'all'; query = ''; $('#search').value = ''; save('Коллекция импортирована'); }, 'Импортировать');
  } catch (error) { $('#import-error').textContent = error instanceof SyntaxError ? 'Не удалось прочитать JSON. Выберите файл экспорта PweB.' : error.message; }
};
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY && event.newValue) { try { config = migrateConfig(validateConfig(JSON.parse(event.newValue))); if (!config.categories.some(c => c.id === selected) && !['all','favorites'].includes(selected)) selected = 'all'; render(); notify('Коллекция обновлена в другой вкладке'); } catch { notify('Изменения из другой вкладки не удалось прочитать.'); } } });
$('#todo-form').onsubmit = event => { event.preventDefault(); const input = event.target.elements.task, text = input.value.trim(); if (!text) return; config.todos.push({id:crypto.randomUUID(),text,done:false}); input.value = ''; save(); };
$('#todos').onchange = event => { const task = config.todos.find(t => t.id === event.target.dataset.todo); if (task) { task.done = event.target.checked; save(); } };
$('#todos').onclick = event => { const button = event.target.closest('[data-delete-todo]'); if (button) { config.todos = config.todos.filter(t => t.id !== button.dataset.deleteTodo); save(); } };
render();
if (loadWarning) { $('#save-status').textContent = storageBlocked ? 'Данные не прочитаны · доступен экспорт' : 'Не сохранено · экспортируйте JSON'; notify(loadWarning); }
