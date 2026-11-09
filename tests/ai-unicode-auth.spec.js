import { expect, test } from '@playwright/test';

test('Unicode and old ASCII passwords produce browser-valid Authorization headers', async ({page}) => {
  await page.goto('/search/');
  const results = await page.evaluate(async () => {
    const {bearerAuthorization} = await import('/search/ai-auth.js');
    return ['пароль-персональный-2026', 'übermäßig', '密码🔒-0123456789',
      'AsciiPassword1234!'].map(key => {
      const authorization = bearerAuthorization(key);
      const header = new Headers({Authorization: authorization});
      return {authorization, header: header.get('Authorization')};
    });
  });
  expect(results[0].authorization).toMatch(/^Bearer hyle-utf8-v1\./);
  expect(results[1].authorization).toMatch(/^Bearer hyle-utf8-v1\./);
  expect(results[2].authorization).toMatch(/^Bearer hyle-utf8-v1\./);
  expect(results[3].authorization).toBe('Bearer AsciiPassword1234!');
  for (const item of results) expect(item.header).toBe(item.authorization);
});

test('AI question submits a Cyrillic password and renders SSE answer', async ({page}) => {
  let authorization = '';
  await page.addInitScript(() => {
    localStorage.setItem('hyle.ai.key', JSON.stringify('пароль-персональный-2026'));
  });
  await page.route('https://api.hyle.space/ask', async route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'Authorization, Content-Type',
      }});
    }
    authorization = route.request().headers().authorization || '';
    return route.fulfill({status: 200, headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'access-control-allow-origin': '*',
    }, body: 'event: delta\ndata: {"t":"Ответ получен"}\n\nevent: done\ndata: {}\n\n'});
  });
  await page.goto('/search/');
  await page.locator('#ai-button').click();
  await page.locator('#ai-input').fill('Привет');
  await page.locator('.ai-send').click();
  await expect(page.locator('.ai-text').last()).toContainText('Ответ получен');
  expect(authorization).toMatch(/^Bearer hyle-utf8-v1\.\S+$/);
  expect(authorization).not.toContain('пароль');
});
