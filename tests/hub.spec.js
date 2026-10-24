import { test, expect } from '@playwright/test';
import defaults from '../config.js';
const storageKey = 'pweb.home.v1';
const libraryCard = (page,id) => page.locator(`#resources .resource-card[data-id="${id}"]`);
const form = page => page.locator('#resource-form');
async function menu(page,id,action) {
  const card = libraryCard(page,id);
  await card.locator('[data-action="menu"]').click();
  await card.getByRole('button',{name:action,exact:true}).click();
}
async function addResource(page,title='Новый проект') {
  await page.locator('#add-resource').click();
  await form(page).getByRole('textbox',{name:'Название',exact:true}).fill(title);
  await form(page).locator('[name=url]').fill('https://example.com/project');
  await form(page).locator('[name=description]').fill('Важное описание');
  await form(page).getByRole('button',{name:'Сохранить',exact:true}).click();
}
test.beforeEach(async ({page}) => { await page.goto('/'); });

test('real links, draft, search, empty category and keyboard shortcut',async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await expect(page.locator('#resources .resource-card')).toHaveCount(4);
  await expect(libraryCard(page,'nsu-s1').locator('a')).toHaveAttribute('href',defaults.resources[0].url);
  await expect(libraryCard(page,'nsu-s2').locator('a')).toHaveCount(0);
  await page.keyboard.press('Control+k'); await expect(page.locator('#search')).toBeFocused();
  await page.locator('#search').fill('рукописные');await expect(page.locator('#resources .resource-card')).toHaveCount(1);
  await page.locator('#search').fill('Education');await expect(page.locator('#resources .resource-card')).toHaveCount(2);
  await page.locator('#search').fill('Personal');await expect(page.locator('[data-category-section=personal]')).toBeVisible();
  await page.locator('#search').fill('неизвестный ресурс');await expect(page.getByText('Ничего не нашлось')).toBeVisible();
  await page.getByRole('button',{name:'Сбросить поиск'}).click();await expect(page.locator('#resources .resource-card')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('create, edit, reorder, pin, delete and persist resources',async ({page}) => {
  await addResource(page);
  const id=await page.getByRole('heading',{name:'Новый проект',exact:true}).locator('..').getAttribute('data-id');
  await menu(page,id,'Редактировать');await form(page).locator('[name=title]').fill('Обновлённый проект');
  await form(page).locator('[name=category]').selectOption('education');await form(page).locator('[name=favorite]').check();
  await form(page).getByRole('button',{name:'Сохранить',exact:true}).click();
  await expect(page.locator(`#favorites [data-id="${id}"]`)).toBeVisible();
  await menu(page,id,'Переместить выше');
  await expect(page.locator('[data-category-section=education] .resource-card').nth(1)).toHaveAttribute('data-id',id);
  await page.reload();await expect(libraryCard(page,id).getByRole('heading')).toHaveText('Обновлённый проект');
  await expect(page.locator('[data-category-section=education] .resource-card').nth(1)).toHaveAttribute('data-id',id);
  await menu(page,id,'Удалить ресурс');await page.locator('#confirm-accept').click();
  await expect(libraryCard(page,id)).toHaveCount(0);await page.reload();await expect(libraryCard(page,id)).toHaveCount(0);
});

test('category management and moving cards between categories',async ({page}) => {
  await page.locator('#add-category').click();await page.locator('#category-form [name=name]').fill('Мои материалы');
  await page.locator('#category-form').getByRole('button',{name:'Сохранить',exact:true}).click();
  const categoryId=await page.locator('#navigation button').filter({hasText:'Мои материалы'}).getAttribute('data-category');
  await menu(page,'nsu-s2','Редактировать');await form(page).locator('[name=category]').selectOption(categoryId);
  await form(page).getByRole('button',{name:'Сохранить',exact:true}).click();
  await page.locator('#settings-button').click();await page.getByRole('button',{name:'Удалить раздел Мои материалы',exact:true}).click();
  await expect(page.locator('#toast')).toContainText('Сначала переместите');
  await expect(page.locator('#confirm-dialog')).not.toBeVisible();
  await page.locator('#settings-dialog [data-close]').click();
  await menu(page,'nsu-s2','Редактировать');await form(page).locator('[name=category]').selectOption('education');
  await form(page).getByRole('button',{name:'Сохранить',exact:true}).click();
  await page.locator('#settings-button').click();await page.getByRole('button',{name:'Удалить раздел Мои материалы',exact:true}).click();
  await page.locator('#confirm-accept').click();await expect(page.getByRole('button',{name:'Удалить раздел Мои материалы',exact:true})).toHaveCount(0);
});

test('JSON export and confirmed import preserve collection and tasks',async ({page}) => {
  await page.locator('#todo-form input').fill('Проверить конспект');await page.getByRole('button',{name:'Добавить задачу',exact:true}).click();
  await page.locator('#settings-button').click();
  const downloading=page.waitForEvent('download');await page.locator('#export-config').click();const download=await downloading;
  const fs=await import('node:fs/promises');const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  expect(backup.todos[0].text).toBe('Проверить конспект');expect(backup.resources.length).toBe(4);
  backup.resources[0].title='Импортированный семестр';
  await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).resources[0].title,storageKey)).not.toBe('Импортированный семестр');
  await page.locator('#confirm-accept').click();await page.locator('#settings-dialog [data-close]').click();
  await expect(libraryCard(page,'nsu-s1').getByRole('heading')).toHaveText('Импортированный семестр');
  await page.reload();await expect(page.locator('#todos')).toContainText('Проверить конспект');
});

test('invalid imports leave the saved collection unchanged',async ({page}) => {
  await addResource(page,'Сохранить меня');
  const before=await page.evaluate(key=>localStorage.getItem(key),storageKey);
  await page.locator('#settings-button').click();
  await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{')});
  await expect(page.locator('#import-error')).toContainText('Не удалось прочитать JSON');
  const bad=structuredClone(defaults);bad.resources[0].url='javascript:alert(1)';
  await page.locator('#import-file').setInputFiles({name:'unsafe.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
  await expect(page.locator('#import-error')).toContainText('http://');
  expect(await page.evaluate(key=>localStorage.getItem(key),storageKey)).toBe(before);
});

test('unreadable saved data is not silently overwritten',async ({page}) => {
  await page.evaluate(key=>localStorage.setItem(key,'{invalid backup'),storageKey);await page.reload();
  await expect(page.locator('#save-status')).toContainText('Данные не прочитаны');
  await addResource(page,'Временный ресурс');await expect(page.locator('#save-status')).toContainText('Не сохранено');
  expect(await page.evaluate(key=>localStorage.getItem(key),storageKey)).toBe('{invalid backup');
});

test('tasks, list, light theme and link target settings survive reload',async ({page}) => {
  await page.locator('#todo-form input').fill('Прочитать лекцию');await page.getByRole('button',{name:'Добавить задачу',exact:true}).click();
  await page.locator('#todos input').check();await page.locator('#view-list').click();
  await page.locator('#theme-toggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.locator('#settings-button').click();await page.locator('#new-tab').uncheck();
  await page.locator('#settings-dialog [data-close]').click();await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.locator('#resources')).toHaveClass('list-view');await expect(page.locator('#todos input')).toBeChecked();
  await expect(libraryCard(page,'nsu-s1').locator('a')).not.toHaveAttribute('target');
  await page.getByRole('button',{name:'Удалить задачу: Прочитать лекцию',exact:true}).click();await page.reload();await expect(page.locator('#todos input')).toHaveCount(0);
});

test('imported HTML is displayed as text',async ({page}) => {
  const backup=structuredClone(defaults);backup.resources[0].title='<img src=x onerror="window.pwned=1">';
  await page.locator('#settings-button').click();
  await page.locator('#import-file').setInputFiles({name:'escaped.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.locator('#confirm-accept').click();await page.locator('#settings-dialog [data-close]').click();
  await expect(libraryCard(page,'nsu-s1').getByRole('heading')).toHaveText(backup.resources[0].title);
  await expect(page.locator('img')).toHaveCount(0);expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
});

for (const width of [375,820,1024,1440]) test(`responsive layout and controls at ${width}px`,async ({page}) => {
  await page.setViewportSize({width,height:1000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('.welcome')).toBeVisible();
  await page.locator('#add-resource').click();await expect(page.locator('#resource-dialog')).toBeVisible();
  expect(await page.evaluate(()=>document.querySelector('#resource-dialog').getBoundingClientRect().width<=innerWidth)).toBe(true);
  await page.locator('#resource-dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
  await libraryCard(page,'nsu-s2').getByRole('button',{name:'В избранное:',exact:false}).click();
  await expect(page.locator('#favorites .resource-card[data-id=nsu-s2]')).toBeVisible();
});
