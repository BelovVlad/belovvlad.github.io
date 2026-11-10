import { test, expect } from '@playwright/test';

async function openFilters(page) {
  await page.goto('/search/');
  await expect(page.locator('#ai-button')).toBeEnabled();
  await page.locator('#ai-button').click();
  await page.locator('.ai-filter-toggle').click();
  await expect(page.locator('.ai-filters')).toBeVisible();
}
test('desktop picker preserves native source, PDF and length values', async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await openFilters(page);
  await page.locator('[data-filter="source"] .ai-picker-trigger').click();
  await expect(page.locator('.ai-choice-list')).toBeVisible();
  await page.getByRole('option',{name:'Хелпер ФФ'}).click();
  expect(await page.locator('#ai-source').inputValue()).toBe('helper');
  await page.locator('[data-filter="pdf"] .ai-picker-trigger').click();
  await page.getByRole('option',{name:'Проверить скан — точнее'}).click();
  expect(await page.locator('#ai-pdf-mode').inputValue()).toBe('vision');
  await page.locator('[data-filter="length"] .ai-picker-trigger').click();
  await page.getByRole('option',{name:'Подробно'}).click();
  expect(await page.locator('#ai-answer-length').inputValue()).toBe('detailed');
  await page.getByRole('button',{name:'↺ Сбросить'}).click();
  expect(await page.locator('#ai-pdf-mode').inputValue()).toBe('auto');
  expect(await page.locator('#ai-source').inputValue()).toBe('');
  await expect(page.locator('[data-filter="source"] .ai-picker-value')).toHaveText('Все материалы');
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
