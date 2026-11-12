import { test, expect } from '@playwright/test';

async function openChat(page) {
  await page.goto('/search/');
  await expect(page.locator('#ai-button')).toBeEnabled();
  await page.locator('#ai-button').click();
  await expect(page.locator('.ai-dialog')).toBeVisible();
}
test('chat uses automatic defaults and accepts a source in the question', async ({page})=>{
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
  await openChat(page);
  await expect(page.locator('.ai-filters, .ai-filter-toggle')).toHaveCount(0);
  const question = 'Найди у Сивухина в Хелпере, что такое когерентность';
  await page.locator('#ai-input').fill(question);
  const [request] = await Promise.all([
    page.waitForRequest(req => req.url() === 'https://api.hyle.space/ask' && req.method() === 'POST'),
    page.getByRole('button',{name:'Спросить',exact:true}).click()
  ]);
  expect(request.postDataJSON()).toEqual({q:question, history:[], pdf_mode:'auto', answer_length:'normal'});
  await expect(page.getByText('Проверочный ответ',{exact:true})).toBeVisible();
});
for (const [width,height] of [[1440,900],[800,800],[375,740]]) {
  test('chat composer stays inside the viewport at '+width+'px',async ({page})=>{
    await page.setViewportSize({width,height});
    await openChat(page);
    const composer=await page.locator('.ai-compose').boundingBox();
    expect(composer.height).toBeLessThanOrEqual(width<=620?51:49);
    expect(composer.x).toBeGreaterThanOrEqual(-1);
    expect(composer.x+composer.width).toBeLessThanOrEqual(width+1);
  });
}
