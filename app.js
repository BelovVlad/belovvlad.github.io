import defaults from './config.js';
import { STORAGE_KEY, ICONS, clone, validateConfig, safeUrl, filterResources, moveResource } from './model.js';
import { icon } from './icons.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const iconNames = { book:'Книга', code:'Код', tool:'Инструмент', link:'Ссылка', user:'Личное', pen:'Перо', github:'GitHub', globe:'Глобус', folder:'Папка', star:'Звезда' };
let config = clone(defaults), selected = 'all', query = '', editingResource = null, editingCategory = null, toastTimer, pendingImport, loadWarning = '', storageBlocked = false;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) config = validateConfig(JSON.parse(saved));
} catch {
  storageBlocked = true;
  loadWarning = 'Сохранённые данные не удалось прочитать. Они не перезаписаны. Можно экспортировать текущую коллекцию или импортировать копию в настройках.';
}
const systemTheme = matchMedia('(prefers-color-scheme: light)');
function applyTheme() {
  const theme = config.settings.theme === 'system' ? (systemTheme.matches ? 'light' : 'dark') : config.settings.theme;
  document.documentElement.dataset.theme = theme;
  $('meta[name="theme-color"]').content = theme === 'light' ? '#f5f3ef' : '#080d12';
  $('#theme-toggle').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
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
  $('#navigation').innerHTML = navButton('all', 'Обзор', 'home', config.resources.length) + navButton('favorites', 'Избранное', 'star', config.resources.filter(r => r.favorite).length) + config.categories.map(c => navButton(c.id, c.name, c.icon, config.resources.filter(r => r.category === c.id).length)).join('');
}
function renderFavorites() {
  $('#favorites-section').hidden = selected !== 'all' || !!query.trim();
  const favorites = config.resources.filter(r => r.favorite);
  $('#favorites').innerHTML = favorites.map(r => resourceCard(r,true)).join('') + (!favorites.length ? '<div class="quick-empty">Нажмите на звезду у ресурса, чтобы закрепить его здесь.</div>' : favorites.length < 3 ? `<button class="quick-add" id="choose-favorite"><span>${icon('plus')}</span><strong>Место для важного</strong><small>Закрепите здесь ещё один ресурс</small></button>` : '');
}
function resourceCard(r, featured = false) {
  const peers = config.resources.filter(item => item.category === r.category), index = peers.findIndex(item => item.id === r.id);
  const title = r.url ? `<a class="card-link" href="${escape(r.url)}" ${targetAttrs()}>${escape(r.title)}</a>` : `<button class="card-link draft-title" data-action="edit" data-id="${escape(r.id)}">${escape(r.title)}</button>`;
  return `<article class="resource-card ${featured ? 'featured' : ''}" data-id="${escape(r.id)}" data-icon="${r.icon}"><div class="card-top"><span class="resource-icon">${icon(r.icon)}</span><div class="card-actions"><button class="icon-button pin ${r.favorite ? 'active' : ''}" data-action="pin" aria-label="${r.favorite ? 'Убрать из избранного' : 'В избранное'}: ${escape(r.title)}" aria-pressed="${r.favorite}">${icon('star')}</button><button class="icon-button menu-trigger" data-action="menu" aria-label="Действия: ${escape(r.title)}" aria-expanded="false">${icon('more')}</button><div class="card-menu" hidden><button data-action="edit">Редактировать</button><button data-action="up" ${index === 0 ? 'disabled' : ''}>Переместить выше</button><button data-action="down" ${index === peers.length-1 ? 'disabled' : ''}>Переместить ниже</button><button class="danger" data-action="delete">Удалить ресурс</button></div></div></div><h4 class="card-title">${title}</h4><p class="card-description">${escape(r.description)}</p><div class="card-bottom"><span class="resource-tag">${escape(categoryName(r.category))}</span>${r.url ? `<span class="card-domain">${escape(new URL(r.url).hostname.replace(/^www\./, ''))}</span><span class="open-arrow">${icon('arrow')}</span>` : '<span class="draft-tag">Скоро</span><button class="draft-button" data-action="edit">Добавить ссылку →</button>'}</div></article>`;
}
function renderResources() {
  const results = filterResources(config, { query, category: ['all','favorites'].includes(selected) ? 'all' : selected, favorites: selected === 'favorites' });
  $('#resource-count').textContent = results.length;
  $('#library-title').firstChild.textContent = query.trim() ? 'Результаты поиска ' : selected === 'all' ? 'Все ресурсы ' : selected === 'favorites' ? 'Избранное ' : categoryName(selected) + ' ';
  $('#resources').classList.toggle('list-view', config.settings.view === 'list');
  for (const view of ['grid','list']) { $(`#view-${view}`).classList.toggle('active', config.settings.view === view); $(`#view-${view}`).setAttribute('aria-pressed', String(config.settings.view === view)); }
  const matchingCategory = config.categories.some(c => (selected === 'all' || selected === c.id) && [c.name, c.description].join(' ').toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
  if (!results.length && ((query.trim() && !matchingCategory) || selected === 'favorites')) {
    $('#resources').innerHTML = `<div class="no-results">${icon(query ? 'search' : 'star')}<strong>${query ? 'Ничего не нашлось' : 'Пока без избранного'}</strong>${query ? 'Попробуйте другое название, описание или раздел.' : 'Нажмите на звезду у ресурса в обзоре.'}<br><button class="button" data-action="clear-filters">${query ? 'Сбросить поиск' : 'Открыть обзор'}</button></div>`;
    return;
  }
  const categories = config.categories.filter(c => (selected === 'all' || selected === 'favorites' || selected === c.id) && (!query.trim() || results.some(r => r.category === c.id) || [c.name, c.description].join(' ').toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))));
  $('#resources').innerHTML = categories.map(c => {
    const items = results.filter(r => r.category === c.id);
    if (selected === 'favorites' && !items.length) return '';
    return `<section class="resource-section ${items.length === 1 ? 'single-section' : ''} ${!items.length ? 'empty-section' : ''}" data-category-section="${escape(c.id)}"><div class="category-heading">${icon(c.icon)}<h3>${escape(c.name)}</h3><span class="category-number">${items.length}</span><span class="category-description">${escape(c.description)}</span><button class="icon-button category-add" data-add-to="${escape(c.id)}" aria-label="Добавить ресурс в ${escape(c.name)}">${icon('plus')}</button></div><div class="resource-grid">${items.length ? items.map(r => resourceCard(r)).join('') : `<div class="empty-category">${icon(c.icon)}<span>Здесь есть место для чего-то вашего.</span><button class="text-button" data-add-to="${escape(c.id)}">${icon('plus')}Добавить ресурс</button></div>`}</div></section>`;
  }).join('') || '<div class="no-results">Начните с нового раздела в меню слева.</div>';
}
function renderManager() {
  $('#category-manager').innerHTML = config.categories.map(c => `<div class="manager-row">${icon(c.icon)}<span>${escape(c.name)}</span><button data-edit-category="${escape(c.id)}" aria-label="Изменить раздел ${escape(c.name)}">Изменить</button><button data-delete-category="${escape(c.id)}" aria-label="Удалить раздел ${escape(c.name)}">Удалить</button></div>`).join('');
}
function renderWidgets() {
  $('#todo-count').textContent = `${config.todos.filter(t => t.done).length} / ${config.todos.length}`;
  $('#todos').innerHTML = config.todos.length ? config.todos.map(t => `<div class="todo-row ${t.done ? 'done' : ''}"><label><input type="checkbox" data-todo="${escape(t.id)}" ${t.done ? 'checked' : ''}><span>${escape(t.text)}</span></label><button class="icon-button" data-delete-todo="${escape(t.id)}" aria-label="Удалить задачу: ${escape(t.text)}">${icon('close')}</button></div>`).join('') : '<p class="widget-empty">Освободите мысли.<br>Запишите одну важную задачу на день.</p>';
  const links = config.resources.filter(r => r.url && (r.favorite || r.category === 'links')).slice(0,6);
  $('#quick-links').innerHTML = links.map(r => `<a class="quick-link" href="${escape(r.url)}" ${targetAttrs()}><span class="resource-icon">${icon(r.icon)}</span><span>${escape(r.title)}</span>${icon('arrow')}</a>`).join('') || '<p class="widget-empty">Закрепите ресурсы, чтобы видеть их здесь.</p>';
}
function render() { renderNavigation(); renderFavorites(); renderResources(); renderManager(); renderWidgets(); applyTheme(); $('#new-tab').checked = config.settings.newTab; }
function closeMenus() { document.querySelectorAll('.card-menu').forEach(menu => { menu.hidden = true; menu.previousElementSibling.setAttribute('aria-expanded','false'); }); }
function showSettings() { $('#import-error').textContent = ''; $('#settings-dialog').showModal(); }
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
$('#search').addEventListener('input', event => { query = event.target.value; renderFavorites(); renderResources(); });
$('#search').addEventListener('search', event => { query = event.target.value; renderFavorites(); renderResources(); });
$('#add-resource').onclick = () => openResource();
$('#add-category').onclick = () => openCategory();
$('#settings-add-category').onclick = () => openCategory();
$('#settings-button').onclick = showSettings;
$('#theme-toggle').onclick = () => { config.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; save(); };
$('#theme-select').onchange = event => { config.settings.theme = event.target.value; save(); };
systemTheme.addEventListener('change', applyTheme);
$('#new-tab').onchange = event => { config.settings.newTab = event.target.checked; save(); };
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
  if (event.target.closest('#choose-favorite')) { selected = 'all'; query = ''; $('#search').value = ''; render(); notify('Нажмите на звезду у нужной карточки.'); $('.resource-card .pin')?.focus(); return; }
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
    pendingImport = validateConfig(JSON.parse(await file.text())); $('#import-error').textContent = '';
    confirmAction('Импортировать коллекцию?', `В файле ${pendingImport.resources.length} ресурсов и ${pendingImport.categories.length} разделов. Они заменят текущую коллекцию. Перед заменой можно отменить действие и скачать экспорт.`, () => { config = pendingImport; pendingImport = null; storageBlocked = false; selected = 'all'; query = ''; $('#search').value = ''; save('Коллекция импортирована'); }, 'Импортировать');
  } catch (error) { $('#import-error').textContent = error instanceof SyntaxError ? 'Не удалось прочитать JSON. Выберите файл экспорта PweB.' : error.message; }
};
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY && event.newValue) { try { config = validateConfig(JSON.parse(event.newValue)); if (!config.categories.some(c => c.id === selected) && !['all','favorites'].includes(selected)) selected = 'all'; render(); notify('Коллекция обновлена в другой вкладке'); } catch { notify('Изменения из другой вкладки не удалось прочитать.'); } } });
$('#todo-form').onsubmit = event => { event.preventDefault(); const input = event.target.elements.task, text = input.value.trim(); if (!text) return; config.todos.push({id:crypto.randomUUID(),text,done:false}); input.value = ''; save(); };
$('#todos').onchange = event => { const task = config.todos.find(t => t.id === event.target.dataset.todo); if (task) { task.done = event.target.checked; save(); } };
$('#todos').onclick = event => { const button = event.target.closest('[data-delete-todo]'); if (button) { config.todos = config.todos.filter(t => t.id !== button.dataset.deleteTodo); save(); } };
render();
if (loadWarning) { $('#save-status').textContent = 'Данные не прочитаны · доступен экспорт'; notify(loadWarning); }
