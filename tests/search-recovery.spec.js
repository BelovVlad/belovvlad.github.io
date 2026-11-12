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
  // Wait for the lazy-loaded renderer before injecting synthetic PDF links;
  // its initial render replaces .ai-messages children asynchronously.
  await page.evaluate(() => import('/search/ai-renderer.js'));
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

for (const embedded of [false, true]) {
  test(`AI composer clears the software keyboard ${embedded ? 'inside Home search' : 'on the search page'}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 780 });
    const search = embedded ? await openSearch(page) : page;
    if (!embedded) await page.goto('/search/');
    await search.locator('#ai-button').click();
    const composer = search.locator('.ai-compose');
    await expect(composer).toBeVisible();
    const input = search.locator('#ai-input');
    await input.fill('Что такое когерентность?');

    // Chromium desktop has no IME. Report the same visual-viewport resize as a phone.
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 420 });
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(search.locator('.ai-layer')).toHaveClass(/ai-keyboard/);
    await expect.poll(async () => {
      const box = await composer.boundingBox();
      return box.y + box.height;
    }).toBeLessThanOrEqual(405);
    await expect(input).toHaveValue('Что такое когерентность?');

    await page.evaluate(() => {
      delete window.visualViewport.height;
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(search.locator('.ai-layer')).not.toHaveClass(/ai-keyboard/);
    await expect.poll(async () => {
      const box = await composer.boundingBox();
      return box.y + box.height;
    }).toBeGreaterThan(700);
  });
}

test.describe('touch chat in the fullscreen app', () => {
  test.use({ viewport: { width: 375, height: 780 }, hasTouch: true, isMobile: true });

  test('resizes for the keyboard and dismisses it on send', async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = query => query.includes('(display-mode: fullscreen)')
        ? Object.defineProperty(original(query), 'matches', { value: true })
        : original(query);
    });
    const frame = await openSearch(page);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /interactive-widget=resizes-content/);
    await expect(frame.locator('meta[name="viewport"]')).toHaveAttribute('content', /interactive-widget=resizes-content/);
    await frame.locator('#ai-button').click();
    const input = frame.locator('#ai-input');
    await input.fill('Что такое когерентность?');
    await expect(input).toBeFocused();

    // Android resizes the layout viewport in resizes-content mode.
    await page.setViewportSize({ width: 375, height: 420 });
    await expect.poll(async () => {
      const box = await frame.locator('.ai-compose').boundingBox();
      return box.y + box.height;
    }).toBeLessThanOrEqual(405);
    await input.press('Enter');
    await expect(input).not.toBeFocused();
    await expect(input).toHaveValue('');
  });
});

test('system Back goes from citation to chat, search, then Home', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 780 });
  await page.route('https://hyle.space/NSU_FP_Y4_S1/docs/pdfjs/viewer.html**', route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>PDF</title><p>PDF preview</p>' }));
  const search = await openSearch(page);
  await search.locator('#ai-button').click();
  await expect(search.locator('.ai-dialog')).toBeVisible();
  await expect.poll(() => page.evaluate(() => history.state?.hyleSearchAi)).toBe(true);
  await search.locator('.ai-dialog').evaluate(async dialog => {
    await import('/search/ai-renderer.js');
    const message = dialog.querySelector('.ai-messages');
    message.classList.add('ai-text');
    const link = document.createElement('a');
    link.href = 'https://hyle.space/NSU_FP_Y4_S1/docs/pdfjs/viewer.html?file=test.pdf&page=15';
    link.textContent = 'Цитата PDF';
    message.append(link);
  });
  await search.getByRole('link', { name: 'Цитата PDF' }).click();
  const reader = search.locator('.hyle-reader-overlay');
  await expect(reader).toBeVisible();
  await expect(search.frameLocator('.hyle-reader-frame').getByText('PDF preview')).toBeVisible();

  await page.evaluate(() => history.back());
  await expect(reader).toBeHidden();
  await expect(search.locator('.ai-dialog')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(search.locator('.ai-dialog')).toBeHidden();
  await expect(search.locator('.search-field')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.locator('iframe[title="Общий поиск Hyle"]')).toBeHidden();
  await expect(page.locator('#search')).toBeVisible();
});
