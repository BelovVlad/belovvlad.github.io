import { test, expect } from '@playwright/test';

async function openFilters(page) {
  await page.goto('/search/');
  await expect(page.locator('#ai-button')).toBeEnabled();
  await page.locator('#ai-button').click();
  await page.locator('.ai-filter-toggle').click();
  await expect(page.locator('.ai-filters')).toBeVisible();
}
test('desktop source picker still works and old AI preferences no longer affect requests', async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(() => {
    localStorage.setItem('hyle.ai.key', JSON.stringify('test-key'));
    localStorage.setItem('hyle.ai.preferences.v1',
      JSON.stringify({pdf_mode:'text', answer_length:'short'}));
  });
  await page.route('https://api.hyle.space/ask', async route => {
    const headers = {'access-control-allow-origin':'*',
      'access-control-allow-methods':'POST', 'access-control-allow-headers':'authorization, content-type'};
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({status:204, headers});
      return;
    }
    await route.fulfill({headers, contentType:'text/event-stream',
      body:'event: delta\ndata: {"t":"Проверочный ответ"}\n\nevent: done\ndata: {}\n\n'});
  });
  await openFilters(page);
  await page.locator('[data-filter="source"] .ai-picker-trigger').click();
  await expect(page.locator('.ai-choice-list')).toBeVisible();
  await page.getByRole('option',{name:'Хелпер ФФ'}).click();
  expect(await page.locator('#ai-source').inputValue()).toBe('helper');
  await expect(page.locator('[data-filter="pdf"], [data-filter="length"]')).toHaveCount(0);
  await page.getByRole('button',{name:'↺ Сбросить'}).click();
  expect(await page.locator('#ai-source').inputValue()).toBe('');
  await expect(page.locator('[data-filter="source"] .ai-picker-value')).toHaveText('Все материалы');
  await page.getByRole('button',{name:'Закрыть фильтры'}).click();
  await page.locator('#ai-input').fill('Что такое когерентность?');
  const [request] = await Promise.all([
    page.waitForRequest(req => req.url() === 'https://api.hyle.space/ask' && req.method() === 'POST'),
    page.getByRole('button',{name:'Спросить',exact:true}).click()
  ]);
  expect(request.postDataJSON()).toMatchObject({pdf_mode:'auto', answer_length:'normal'});
  await expect(page.getByText('Проверочный ответ',{exact:true})).toBeVisible();
});
test('phone choice sheet stays in viewport and supports semester and subject',async ({page})=>{
  await page.setViewportSize({width:375,height:740});
  await openFilters(page);
  await page.locator('[data-filter="semester"] .ai-picker-trigger').click();
  await expect(page.locator('.ai-choice-mobile .ai-choice-panel')).toBeVisible();
  const bounds=await page.locator('.ai-choice-panel').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(376);
  await page.getByRole('option',{name:'6',exact:true}).click();
  expect(await page.locator('#ai-semester').inputValue()).toBe('6');
  await page.locator('.ai-subject-trigger').click();
  await page.getByRole('option',{name:'Квантовая механика'}).click();
  expect(await page.locator('#ai-subject').inputValue()).toBe('Квантовая механика');
  await page.locator('.ai-subject-trigger').click();
  await page.getByRole('option',{name:'Ввести вручную…'}).click();
  await page.locator('#ai-subject').fill('Квантовая теория поля');
  expect(await page.locator('#ai-subject').inputValue()).toBe('Квантовая теория поля');
});
test('Escape closes the options first, then filters',async ({page})=>{
  await page.setViewportSize({width:1280,height:820});
  await openFilters(page);
  await page.locator('[data-filter="source"] .ai-picker-trigger').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ai-choice-layer')).toBeHidden();
  await expect(page.locator('.ai-filters')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ai-filters')).toBeHidden();
});


for (const [width,height] of [[1440,900],[800,800],[375,740]]) {
  test('compact filters match the input width at '+width+'px',async ({page})=>{
    await page.setViewportSize({width,height});
    await openFilters(page);
    const filters=await page.locator('.ai-filters').boundingBox();
    const composer=await page.locator('.ai-compose').boundingBox();
    expect(Math.abs(filters.x-composer.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(filters.width-composer.width)).toBeLessThanOrEqual(2);
    expect(composer.height).toBeLessThanOrEqual(width<=620?51:49);
    expect(filters.x).toBeGreaterThanOrEqual(-1);
    expect(filters.x+filters.width).toBeLessThanOrEqual(width+1);
  });
}
