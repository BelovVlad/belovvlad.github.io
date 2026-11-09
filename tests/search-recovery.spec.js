import { test, expect } from '@playwright/test';

async function openSearch(page) {
  await page.goto('/');
  await page.locator('#search').click();
  const frame = page.frameLocator('iframe[title="Общий поиск Hyle"]');
  await expect(frame.locator('.search-field')).toBeVisible();
  return frame;
}

for (const width of [375, 1440]) {
  test(`closing AI and search restores Home navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    const frame = await openSearch(page);
    await frame.getByRole('button', { name: 'Спросить ИИ по материалам Hyle' }).click();
    await expect(frame.locator('.ai-dialog')).toBeVisible();
    await frame.getByRole('button', { name: 'Назад к поиску' }).click();
    await expect(frame.locator('.ai-dialog')).toBeHidden();
    await frame.getByRole('button', { name: 'Hyle — вернуться на главную' }).click();
    await expect(page.locator('iframe[title="Общий поиск Hyle"]')).toBeHidden();
    await page.locator('#navigation [data-category="all"]').click();
    await expect(page.locator('#navigation [data-category="all"]')).toHaveAttribute('aria-current', 'page');
    await page.locator('#search').click();
    await expect(frame.locator('.search-field')).toBeVisible();
  });

  test(`AI composer shrinks after multiline send at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    const frame = await openSearch(page);
    await frame.getByRole('button', { name: 'Спросить ИИ по материалам Hyle' }).click();
    const input = frame.locator('#ai-input');
    await expect(input).toBeVisible();
    await input.fill('Строка 1\nСтрока 2\nСтрока 3\nСтрока 4');
    await expect.poll(() => input.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(40);
    await input.fill('');
    await expect.poll(() => input.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(50);
    const composer = await frame.locator('.ai-compose').boundingBox();
    expect(composer.width).toBeLessThanOrEqual(780);
    expect(composer.x).toBeGreaterThanOrEqual(-1);
    expect(composer.x + composer.width).toBeLessThanOrEqual(width + 1);
  });
}

test('mobile touch starts search without leaving Home inert', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.locator('#search').dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 });
  const frame = page.frameLocator('iframe[title="Общий поиск Hyle"]');
  await expect(frame.locator('.search-field')).toBeVisible();
  await frame.getByRole('button', { name: 'Hyle — вернуться на главную' }).click();
  await expect(page.locator('iframe[title="Общий поиск Hyle"]')).toBeHidden();
  expect(await page.locator('#navigation').evaluate(el => el.inert)).toBe(false);
  await page.locator('#navigation [data-category="all"]').click();
  await expect(page.locator('#navigation [data-category="all"]')).toHaveAttribute('aria-current', 'page');
});

test('AI remains closable after repeated document opens', async ({ page }) => {
  await page.route('https://hyle.space/NSU_FP_Y4_S1/docs/pdfjs/viewer.html**', route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>PDF</title><p>PDF preview</p>' }));
  await page.goto('/search/');
  await expect(page.locator('#ai-button')).toBeEnabled();
  await page.locator('#ai-button').click();
  await expect(page.locator('.ai-dialog')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const a=document.createElement('a');
      a.href='https://hyle.space/NSU_FP_Y4_S1/docs/pdfjs/viewer.html?file=test.pdf&page=15';
      a.textContent='Test PDF';
      a.className='pdf-test-link';
      document.querySelector('.ai-messages').append(a);
      a.classList.add('ai-test-link');
      // Match the production delegation selector.
      a.closest('.ai-messages')?.classList.add('ai-text');
    });
    // Use an AI message link so it is handled by reader.js.
    await page.locator('.ai-test-link').last().click();
    await expect(page.locator('.hyle-reader-overlay')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.hyle-reader-overlay')).toBeHidden();
  }
  await page.getByRole('button', { name: 'Назад к поиску' }).click();
  await expect(page.locator('.ai-dialog')).toBeHidden();
});
