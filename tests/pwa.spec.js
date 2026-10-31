import { test, expect } from '@playwright/test';
import defaults from '../config.js';

test('the existing app identity launches in fullscreen display mode', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.id).toBe('/');
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');
  expect(manifest.display).toBe('fullscreen');
});

for (const mode of ['fullscreen', 'standalone']) {
  test(`installed ${mode} app keeps internal links, launch screen and installation state`, async ({ page }) => {
    await page.addInitScript(({ mode, config }) => {
      config.resources.find(resource => resource.id === 'nsu-s1').url = location.origin + '/NSU_FP_Y4_S1/';
      localStorage.setItem('pweb.home.v1', JSON.stringify(config));
      const original = window.matchMedia.bind(window);
      window.matchMedia = query => {
        const media = original(query);
        if (query.includes('display-mode:')) Object.defineProperty(media, 'matches', {
          value: query.includes(`display-mode: ${mode}`)
        });
        return media;
      };
    }, { mode, config: defaults });
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/launching/);
    await expect(page.locator('.resource-card[data-id="nsu-s1"] .card-title a')).not.toHaveAttribute('target');
    await page.locator('#settings-button').click();
    await page.getByRole('tab', { name: 'Приложение', exact: true }).click();
    await expect(page.locator('#install-title')).toHaveText('Вы в приложении PweB');
    await expect(page.locator('#install-app')).toBeHidden();
    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/launching/);
  });
}
