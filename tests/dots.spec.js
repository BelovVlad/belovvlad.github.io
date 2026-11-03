import { test, expect } from '@playwright/test';

const cardFor = page => page.locator('.resource-card[data-id="nsu-s1"]');

test('card dots follow mouse hover and keyboard focus', async ({ page }) => {
  await page.goto('/');
  const card = cardFor(page), dots = card.locator('.dots-canvas');
  await expect(dots).toHaveCSS('opacity', '0');
  await card.hover();
  await expect(dots).toHaveCSS('opacity', '1');
  await page.mouse.move(0, 0);
  await expect(dots).toHaveCSS('opacity', '0');
  await card.locator('.pin').focus();
  await page.keyboard.press('Tab');
  await expect(card.locator('.menu-trigger')).toBeFocused();
  await expect(dots).toHaveCSS('opacity', '1');
  await page.locator('#search').focus();
  await expect(dots).toHaveCSS('opacity', '0');
  await card.evaluate(el => document.addEventListener('contextmenu', event => {
    if (el.contains(event.target)) window.contextMenuPrevented = event.defaultPrevented;
  }));
  await card.click({ button: 'right' });
  expect(await page.evaluate(() => window.contextMenuPrevented)).toBe(false);
});

test('dot settings are shared, kept and switch patches always on or off', async ({ page }) => {
  await page.goto('/');
  const dots = cardFor(page).locator('.dots-canvas');
  await page.locator('#settings-button').click();
  await expect(page.locator('#dots-wave option')).toHaveText(['Бегущая волна', 'Линза', 'Мембрана', 'Мерцание', 'Случайная']);
  await page.locator('#dots-show').selectOption('always');
  await page.locator('#dots-wave').selectOption('membrane');
  await page.locator('#dots-gap').fill('16');
  await expect(page.locator('output[data-dots-out="gap"]')).toHaveText('16 px');
  await page.keyboard.press('Escape');
  await expect(dots).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hyle.dots.v1')))).toMatchObject({ wave: 'membrane', show: 'always', gap: 16 });
  await page.reload();
  await expect(cardFor(page).locator('.dots-canvas')).toHaveCSS('opacity', '1');
  // Another tab or Hyle site switches them off: this page follows without a reload.
  await page.evaluate(() => {
    const value = JSON.stringify({ wave: 'lens', show: 'off', gap: 13, speed: 1 });
    localStorage.setItem('hyle.dots.v1', value);
    dispatchEvent(new StorageEvent('storage', { key: 'hyle.dots.v1', newValue: value }));
  });
  await cardFor(page).hover();
  await expect(cardFor(page).locator('.dots-canvas')).toHaveCSS('opacity', '0');
  expect(await page.evaluate(() => PwebDots.settings.wave)).toBe('lens');
});

test('a link to another Hyle site just navigates, without a cover of dots', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#dots-transitions')).toHaveCount(0);
  await page.evaluate(() => { const a = Object.assign(document.createElement('a'), { id: 'to-nsu', href: '/NSU_FP_Y4_S1/', textContent: 'НГУ' }); document.body.append(a); });
  const left = page.waitForURL('**/NSU_FP_Y4_S1/');
  await page.locator('#to-nsu').click();
  await left;
  expect(await page.evaluate(() => sessionStorage.getItem('hyle.arrive'))).toBeNull();
});

test.describe('touch card dots', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('dots are hidden at rest and stop after release, cancellation and scrolling', async ({ page, context }) => {
    await page.goto('/');
    const card = cardFor(page), dots = card.locator('.dots-canvas');
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
    await expect(dots).toHaveCSS('opacity', '0');
    // Keep the real link and its native touch focus, without navigating away on release.
    const link = card.locator('.card-title a');
    await link.evaluate(el => el.addEventListener('click', event => event.preventDefault()));
    const box = await link.boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const input = await context.newCDPSession(page);
    const touch = (type, points = []) => input.send('Input.dispatchTouchEvent', { type, touchPoints: points });

    await touch('touchStart', [point]);
    await expect(dots).toHaveCSS('opacity', '1');
    await touch('touchEnd');
    await expect(dots).toHaveCSS('opacity', '0');

    await touch('touchStart', [point]);
    await expect(dots).toHaveCSS('opacity', '1');
    await touch('touchCancel');
    await expect(dots).toHaveCSS('opacity', '0');

    await touch('touchStart', [point]);
    await expect(dots).toHaveCSS('opacity', '1');
    await touch('touchMove', [{ x: point.x, y: point.y - 100 }]);
    await expect(dots).toHaveCSS('opacity', '0');
    await touch('touchEnd');
    await expect(page.locator('.dots-hot')).toHaveCount(0);
  });

  test('touch context menus are suppressed on navigation while ordinary text keeps its menu', async ({ page }) => {
    await page.goto('/');
    const link = cardFor(page).locator('.card-title a');
    await expect(link).toHaveCSS('user-select', 'none');
    const blocked = await link.evaluate(el => !el.dispatchEvent(new PointerEvent('contextmenu', {
      bubbles: true, cancelable: true, pointerType: 'touch'
    })));
    expect(blocked).toBe(true);
    const textAllowed = await page.evaluate(() => {
      const text = document.createElement('p'); text.textContent = 'Selectable document text'; document.body.append(text);
      const allowed = text.dispatchEvent(new PointerEvent('contextmenu', { bubbles: true, cancelable: true, pointerType: 'touch' }));
      const selectable = getComputedStyle(text).userSelect !== 'none'; text.remove(); return allowed && selectable;
    });
    expect(textAllowed).toBe(true);
  });
});
