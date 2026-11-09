import { test, expect } from '@playwright/test';

const saved = [{
  id: 'ai-navigation-test',
  title: 'Метод прогонки и матрицы',
  updated: '2026-11-09T04:00:00Z',
  messages: [
    { role: 'user', content: 'Выпиши формулу из книги' },
    { role: 'assistant', content: 'Формула метода прогонки приведена в [1].',
      sources: [{
        site: 'nsu-y4s1', book: 'ОВФ/03_Литература/Смирнов.pdf',
        title: 'С.В. Смирнов. ОВФ Часть 2', page: 15, location_type: 'page'
      }] }
  ]
}];

async function openSavedDialog(page) {
  await page.addInitScript(dialogs => localStorage.setItem('hyle.ai.dialogs.v1', JSON.stringify(dialogs)), saved);
  await page.goto('/search/');
  await expect(page.locator('#ai-button')).toBeEnabled();
  await page.locator('#ai-button').click();
  await expect(page.locator('.ai-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Все диалоги' }).click();
}

for (const width of [375, 1440]) {
  test(`AI history stays within the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await openSavedDialog(page);
    const panel = page.locator('.ai-sheet-panel');
    await expect(panel).toBeVisible();
    const rect = await panel.boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(-1);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width + 1);
    expect(rect.y).toBeGreaterThanOrEqual(-1);
    expect(rect.y + rect.height).toBeLessThanOrEqual(781);
    await expect(panel.getByText('Метод прогонки и матрицы')).toBeVisible();
    await panel.getByRole('button', { name: 'Закрыть историю' }).click();
    await expect(panel).toBeHidden();
  });
}

test('PDF citation returns to the same AI answer on browser Back', async ({ page }) => {
  await page.route('https://hyle.space/NSU_FP_Y4_S1/docs/pdfjs/viewer.html**', route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>PDF test</title><p>PDF preview</p>' }));
  await openSavedDialog(page);
  await page.locator('[data-dialog="ai-navigation-test"]').click();
  await expect(page.locator('.ai-bot')).toContainText('Формула метода прогонки');
  await page.locator('.ai-sources a').first().click();
  await expect(page.locator('.hyle-reader-overlay')).toBeVisible();
  await expect(page.locator('.hyle-reader-back')).toBeHidden();
  await expect(page.locator('.hyle-reader-original')).toBeHidden();
  await page.goBack();
  await expect(page.locator('.hyle-reader-overlay')).toBeHidden();
  await expect(page.locator('.ai-dialog')).toBeVisible();
  await expect(page.locator('.ai-bot')).toContainText('Формула метода прогонки');
});

test('Native PDF Back returns to AI answer without floating controls', async ({ page }) => {
  await page.route('https://hyle.space/NSU_FP_Y4_S1/docs/pdfjs/viewer.html**', route =>
    route.fulfill({ contentType: 'text/html', body: `<!doctype html>
      <title>PDF test</title>
      <button id="back">Назад</button>
      <script>
        document.querySelector('#back').onclick = () => {
          parent.postMessage({ type: 'nsu-close-pdf' }, new URL(document.referrer).origin);
        };
      </script>` }));
  await openSavedDialog(page);
  await page.locator('[data-dialog="ai-navigation-test"]').click();
  await page.locator('.ai-sources a').first().click();
  await expect(page.locator('.hyle-reader-back')).toBeHidden();
  await expect(page.locator('.hyle-reader-original')).toBeHidden();
  await page.frameLocator('.hyle-reader-frame').locator('#back').click();
  await expect(page.locator('.hyle-reader-overlay')).toBeHidden();
  await expect(page.locator('.ai-bot')).toContainText('Формула метода прогонки');
});
