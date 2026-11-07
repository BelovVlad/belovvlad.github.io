import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium} = await import(process.env.HYLE_PLAYWRIGHT_MODULE || 'playwright');
const repos = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png'};
const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const site = url.pathname.startsWith('/Helper_PF_NSU/') ? 'helper' : url.pathname.startsWith('/Department/') ? 'department' : 'home';
    const root = resolve(repos, site, site === 'home' ? '' : 'site');
    let relative = site === 'home' ? url.pathname : url.pathname.replace(/^\/[^/]+/, '');
    if (relative.endsWith('/')) relative += 'index.html';
    const file = resolve(root, '.' + decodeURIComponent(relative));
    if (!file.startsWith(root + sep)) throw Error('path');
    const content = await readFile(file);
    res.writeHead(200, {'Content-Type':mime[extname(file)] || 'application/octet-stream'});
    res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({channel:process.env.HYLE_BROWSER_CHANNEL || 'msedge', headless:true});
const page = await browser.newPage({viewport:{width:1100,height:900},reducedMotion:'reduce'});
const errors = []; page.on('pageerror', e=>errors.push(e.message));
const sources = [
  {site:'helper',book:'1 семестр/Математика/Книга.pdf',title:'Учебник',page:12},
  {site:'nsu-y4s1',book:'СВЧ/Лекции/лекция.ipynb',title:'Лекция НГУ',page:3,location_type:'cell'},
  {site:'department',book:'Оптика/Пособие.pdf',title:'Кафедра · Оптика',page:7}
];
const answer = String.raw`## Волновое уравнение

Из учебника [1], лекции [2] и пособия кафедры [3].

В строке $E=mc^2$ и \(a^2+b^2=c^2\).

$$\int_0^\infty e^{-x^2} dx = \frac{\sqrt\pi}{2}$$

\[\begin{pmatrix}1&0\\0&1\end{pmatrix}\]

| Источник | Материал |
| --- | --- |
| НГУ | Лекция |

> Формулы проверяются по источникам.

- Первый пункт
- Второй пункт

` + '```python\nprint("$x$ [1]")\n```\n\n`[2] $z$`\n\n' + String.raw`<img src=x onerror=alert(1)> [bad](javascript:alert(1)) $\href{javascript:alert(1)}{unsafe}$`;
let requestBody, complete = true;
await page.route('https://api.hyle.space/ask', async route => {
  requestBody = route.request().postDataJSON();
  const frames = [['sources',{items:sources}], ['delta',{t:answer}], ...(complete ? [['done',{}]] : [])];
  await route.fulfill({status:200,contentType:'text/event-stream; charset=utf-8',body:frames.map(([event,payload])=>`event: ${event}\r\ndata: ${JSON.stringify(payload)}\r\n\r\n`).join('')});
});
await page.route('https://api.hyle.space/**', route => route.request().url().endsWith('/ask') ? route.fallback() : route.abort());
await page.addInitScript(()=>localStorage.setItem('hyle.ai.key',JSON.stringify('local-test-only')));
try {
  for (const path of ['/Helper_PF_NSU/', '/Department/']) {
    await page.goto(base + path);
    await page.locator('#ai-button').click();
    await page.locator('#ai-input').fill('Объясни волновое уравнение');
    await page.locator('.ai-send').click();
    await page.locator('.ai-text table').waitFor();
    assert.equal(requestBody.site,undefined);
    assert.equal(await page.locator('.ai-text .katex').count(),5);
    assert.equal(await page.locator('.ai-text .katex-display').count(),2);
    assert.equal(await page.locator('.ai-text .ai-cite').count(),3);
    assert.equal(await page.locator('.ai-text pre .ai-cite,.ai-text code .katex').count(),0);
    assert.equal(await page.locator('.ai-text pre .hljs-built_in').count(),1);
    assert.equal(await page.locator('.ai-text img,.ai-text script,.ai-text [onerror],.ai-text a[href^="javascript:"]').count(),0);
    assert.match(await page.locator('.ai-cite').nth(1).getAttribute('href'),/NSU_FP_Y4_S1.*cell=3/);
    await page.locator('.ai-filter-toggle').click();
    await page.locator('#ai-source').selectOption('nsu-y4s1');
    await page.locator('#ai-semester').selectOption('7');
    await page.locator('#ai-subject').fill('СВЧ');
    await page.locator('[data-act="close-filters"]').click();
    await page.locator('#ai-input').fill('Где формула?');
    complete = false;
    await page.locator('.ai-send').click();
    await page.getByText('Ответ прерван. Показана полученная часть.').waitFor();
    assert.equal(requestBody.site,'nsu-y4s1'); assert.equal(requestBody.semester,'7'); assert.equal(requestBody.subject,'СВЧ');
    complete = true;
    await page.locator('[data-act="close"]').click();
    await page.locator('.ai-layer').waitFor({state:'hidden'});
    await page.reload();
    await page.locator('#ai-button').click();
    await page.locator('[data-act="list"]').click();
    await page.locator('[data-dialog]').first().click();
    await page.locator('.ai-text .katex').first().waitFor();
  }
  // Every prefix can be rendered safely, including incomplete formulas, tags and fences.
  const prefixes = await page.evaluate(async ({answer,sources}) => {
    const {renderAnswer} = await import('/search/ai-renderer.js');
    const host = document.createElement('div');
    for (let i=1; i<=answer.length; i++) {
      host.innerHTML = renderAnswer(answer.slice(0,i),sources);
      if (host.querySelector('script,img,[onerror],a[href^="javascript:"]')) return false;
    }
    return true;
  },{answer,sources});
  assert(prefixes);
  const artifacts = resolve(fileURLToPath(new URL('../artifacts',import.meta.url)));
  await mkdir(artifacts,{recursive:true});
  await page.screenshot({path:resolve(artifacts,'desktop.png')});
  await page.setViewportSize({width:360,height:850});
  assert(await page.locator('.ai-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.screenshot({path:resolve(artifacts,'mobile.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS: Helper + Department, all delimiters, Markdown, XSS, citations, filters, history, interrupted SSE, every prefix, desktop/mobile');
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
