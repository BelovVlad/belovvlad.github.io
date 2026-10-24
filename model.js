import { CURRENT_REVISION, DIPLOMA_CATEGORY, DIPLOMA_MOVED, DIPLOMA_RESOURCES } from './config.js';
export const STORAGE_KEY = 'pweb.home.v1';
export const ICONS = ['book', 'code', 'tool', 'link', 'user', 'pen', 'github', 'globe', 'folder', 'star'];
export const clone = value => JSON.parse(JSON.stringify(value));

export function validateConfig(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.categories) || !Array.isArray(value.resources)) throw new Error('Неподдерживаемый формат конфигурации. Нужен экспорт PweB версии 1.');
  if (value.categories.length > 100 || value.resources.length > 2000) throw new Error('В файле слишком много разделов или ссылок.');
  const text = (v, max, required = false) => typeof v === 'string' && v.length <= max && (!required || v.trim().length > 0);
  const categoryIds = new Set();
  const categories = value.categories.map(c => {
    if (!c || !text(c.id, 100, true) || ['all','favorites'].includes(c.id) || categoryIds.has(c.id) || !text(c.name, 60, true) || !text(c.description ?? '', 180)) throw new Error('Проверьте названия и уникальность разделов.');
    categoryIds.add(c.id);
    return { id: c.id, name: c.name.trim(), description: c.description ?? '', icon: ICONS.includes(c.icon) ? c.icon : 'folder' };
  });
  const resourceIds = new Set();
  const resources = value.resources.map(r => {
    if (!r || !text(r.id, 100, true) || resourceIds.has(r.id) || !text(r.title, 100, true) || !text(r.description ?? '', 300) || !text(r.url, 2048) || !categoryIds.has(r.category)) throw new Error('Проверьте карточки и их разделы.');
    if (r.url && !safeUrl(r.url)) throw new Error('Разрешены только полные ссылки http:// или https://.');
    resourceIds.add(r.id);
    return { id: r.id, title: r.title.trim(), description: r.description ?? '', url: r.url, category: r.category, icon: ICONS.includes(r.icon) ? r.icon : 'globe', favorite: r.favorite === true };
  });
  const settings = value.settings ?? {};
  const todoIds = new Set();
  const todos = (Array.isArray(value.todos) ? value.todos : []).slice(0,500).map(t => {
    if (!t || !text(t.id,100,true) || todoIds.has(t.id) || !text(t.text,180,true)) throw new Error('Проверьте список задач.');
    todoIds.add(t.id);
    return { id:t.id, text:t.text, done:t.done === true };
  });
  return { version: 1, revision: [2,3,4].includes(value.revision) ? value.revision : 1, categories, resources, settings: { theme: ['dark', 'light', 'system'].includes(settings.theme) ? settings.theme : 'dark', view: settings.view === 'list' ? 'list' : 'grid', newTab: settings.newTab !== false, showTasks: settings.showTasks === true }, todos };
}

// Apply additive updates once, preserving user-created links, edits and tasks.
export function migrateConfig(config) {
  if (config.revision >= CURRENT_REVISION) return config;
  let resources = config.revision < 2 ? config.resources.filter(r => !(r.id === 'darknotes' && r.url === 'https://belovvlad.github.io/DarkNotes/')) : [...config.resources];
  let categories = config.categories;
  if (config.revision < 3) {
    const category = categories.find(c => c.id === DIPLOMA_CATEGORY.id) || categories.find(c => c.name.trim().toLocaleLowerCase('ru') === 'диплом');
    const categoryId = category?.id || DIPLOMA_CATEGORY.id;
    if (!category) categories = [...categories,{...DIPLOMA_CATEGORY}];
    for (const seed of DIPLOMA_RESOURCES) {
      if (!resources.some(r => r.id === seed.id || (r.category === categoryId && r.url === seed.url))) resources.push({...seed,category:categoryId});
    }
  }
  if (config.revision < 4) resources = resources.map(r => DIPLOMA_MOVED[r.url] ? {...r,url:DIPLOMA_MOVED[r.url]} : r);
  return { ...config, revision:CURRENT_REVISION, categories, resources };
}

export function safeUrl(value) {
  try { return /^https?:\/\//i.test(value) && ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

export function filterResources(config, { query = '', category = 'all', favorites = false } = {}) {
  const q = query.trim().toLocaleLowerCase('ru');
  return config.resources.filter(r => {
    const c = config.categories.find(c => c.id === r.category);
    return (category === 'all' || r.category === category) && (!favorites || r.favorite) && (!q || [r.title, r.description, r.url, c?.name, c?.description].join(' ').toLocaleLowerCase('ru').includes(q));
  });
}

export function moveResource(config, id, direction) {
  const index = config.resources.findIndex(r => r.id === id);
  if (index < 0) return false;
  const peers = config.resources.map((r, i) => ({ r, i })).filter(({ r }) => r.category === config.resources[index].category);
  const position = peers.findIndex(({ i }) => i === index);
  const target = peers[position + direction]?.i;
  if (target === undefined) return false;
  [config.resources[index], config.resources[target]] = [config.resources[target], config.resources[index]];
  return true;
}
