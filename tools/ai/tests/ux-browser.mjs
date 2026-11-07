import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium} = await import(process.env.HYLE_PLAYWRIGHT_MODULE || 'playwright');
const repos = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'};
const server = createServer(async(req,res) => {
  try {
    const pathname = new URL(req.url,'http://localhost').pathname;
    const site = pathname.startsWith('/Helper_PF_NSU/') ? 'helper' : pathname.startsWith('/Department/') ? 'department' : 'home';
    const root = resolve(repos,site,site === 'home' ? '' : 'site');
    let relative = site === 'home' ? pathname : pathname.replace(/^\/[^/]+/,'');
    if (relative.endsWith('/')) relative += 'index.html';
    const file = resolve(root,'.'+decodeURIComponent(relative));
    if (!file.startsWith(root+sep)) throw Error('path');
    const content=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(content);
  } catch {res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:process.env.HYLE_BROWSER_CHANNEL||'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(() => {
  localStorage.setItem('hyle.ai.key',JSON.stringify('local-ux-test'));
  if (window !== window.top) return;
  const viewport = new EventTarget(), native = window.visualViewport;
  let testHeight, testTop = 0;
  Object.defineProperties(viewport,{
    height:{get:()=>testHeight ?? native.height},width:{get:()=>native.width},
    offsetTop:{get:()=>testTop},offsetLeft:{get:()=>0},scale:{get:()=>1}
  });
  Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
  window.resizeTestViewport = (height,offsetTop=0) => {testHeight=height;testTop=offsetTop;viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'));};
});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
let releaseCatalog;
const catalogGate=new Promise(r=>releaseCatalog=r);
await context.route('https://hyle.space/**',async route=>{
  const url=route.request().url();
  if(url.includes('materials.json')||url.includes('search-index/files.json')) {
    await catalogGate;
    const helper=url.includes('Helper_PF_NSU');
    return route.fulfill({contentType:'application/json',body:JSON.stringify({files:[{path:'Физика/Оптика.pdf',title:'Оптика',ext:'pdf',section:helper?'1 семестр':'Физика',group:'Оптика',subject:'Оптика',view:'https://books.hyle.space/Оптика.pdf',size:10}]})});
  }
  return route.fulfill({contentType:'application/json',body:'{}'});
});
await context.route('https://api.hyle.space/**',route=>{
  if (!route.request().url().endsWith('/ask')) return route.fulfill({contentType:'application/json',body:'{"hits":[],"total":0}'});
  const text=Array.from({length:30},(_,i)=>`### Раздел ${i+1}\n\nВолновое уравнение описывает распространение возмущений. $E=mc^2$\n\n`).join('');
  return route.fulfill({contentType:'text/event-stream',body:`event: delta\ndata: ${JSON.stringify({t:text})}\n\nevent: done\ndata: {}\n\n`});
});
try {
  await page.goto(base+'/');
  await page.locator('#search').fill('Оптика');
  const start=Date.now(); await page.locator('#search').press('Enter');
  const frame=page.frameLocator('iframe[title="Общий поиск Hyle"]');
  await frame.locator('#search').waitFor({state:'visible',timeout:2000});
  const openMs=Date.now()-start;
  assert.equal(await frame.locator('#search').inputValue(),'Оптика');
  assert.match(await frame.locator('.catalog-warning').textContent(),/загружаются/);
  await frame.locator('#search').fill('Ландау');
  releaseCatalog();
  await frame.locator('.catalog-warning').waitFor({state:'hidden'});
  assert.equal(await frame.locator('#search').inputValue(),'Ландау','catalog updates must retain typed query');
  await frame.locator('#search').fill('');
  await frame.locator('#ai-button').click();
  await frame.locator('#ai-input').waitFor({state:'visible'});
  await page.waitForTimeout(380);
  assert(await frame.locator('#ai-filters').evaluate(el=>el.hidden));
  await frame.locator('.ai-filter-toggle').click();
  await frame.locator('#ai-source').selectOption('department');
  await frame.locator('#ai-semester').selectOption('7');
  assert.equal(await frame.locator('.ai-filter-count').textContent(),'2');
  await frame.locator('[data-act="close-filters"]').click();
  assert.equal(await frame.locator('.ai-filter-toggle').getAttribute('aria-expanded'),'false');
  await frame.locator('#ai-input').fill('Вопрос');
  // A mobile keyboard can shrink and pan the top-level viewport without changing innerHeight.
  await page.evaluate(()=>resizeTestViewport(430,55));
  await page.waitForTimeout(100);
  const iframeBox=await page.locator('iframe[title="Общий поиск Hyle"]').boundingBox();
  const composeBox=await frame.locator('.ai-compose').boundingBox();
  assert(iframeBox.height<=430 && Math.abs(iframeBox.y-55)<2);
  assert(composeBox.y+composeBox.height<=485,'embedded composer covered by simulated keyboard');
  const artifacts=resolve(fileURLToPath(new URL('../artifacts',import.meta.url)));await mkdir(artifacts,{recursive:true});
  await page.screenshot({path:resolve(artifacts,'keyboard-embedded.png')});
  await page.evaluate(()=>resizeTestViewport(844));
  await frame.locator('.ai-send').click();
  await frame.locator('.ai-text h3').first().waitFor();
  assert(!(await frame.locator('.ai-dialog').evaluate(el=>el.classList.contains('ai-head-hidden'))),'programmatic answer scrolling must not hide the menu');
  await frame.locator('.ai-messages').evaluate(el=>el.scrollTop=0);
  await page.waitForTimeout(260);
  const initial=await frame.locator('.ai-messages').evaluate(el=>el.clientHeight);
  await frame.locator('.ai-messages').hover();await page.mouse.wheel(0,400);
  await frame.locator('.ai-dialog.ai-head-hidden').waitFor();
  await page.waitForTimeout(250);
  assert((await frame.locator('.ai-messages').evaluate(el=>el.clientHeight))>initial+30);
  await page.screenshot({path:resolve(artifacts,'mobile-compact.png')});
  await page.mouse.wheel(0,-100);
  await frame.locator('.ai-dialog:not(.ai-head-hidden)').waitFor();
  await frame.locator('.ai-filter-toggle').click();
  await page.screenshot({path:resolve(artifacts,'mobile-filters.png')});
  await page.keyboard.press('Escape');
  assert(await frame.locator('#ai-filters').evaluate(el=>el.hidden));
  assert(!(await frame.locator('.ai-layer').evaluate(el=>el.hidden)));
  await frame.locator('[data-act="close"]').click();
  await frame.locator('.ai-layer').waitFor({state:'hidden'});
  await frame.locator('[data-action="close"]').click();
  await page.locator('iframe[title="Общий поиск Hyle"]').waitFor({state:'hidden'});
  // Same viewport behavior when AI opens directly on a subsite, outside the iframe.
  await page.goto(base+'/Helper_PF_NSU/');await page.locator('#ai-button').click();
  await page.locator('.ai-dialog[style*="none"]').waitFor();
  await page.locator('#ai-input').fill('Тест');await page.evaluate(()=>resizeTestViewport(400,70));
  await page.waitForFunction(()=>document.querySelector('.ai-compose').getBoundingClientRect().bottom<=470);
  const direct=await page.locator('.ai-compose').boundingBox();assert(direct.y+direct.height<=470);
  await page.locator('.ai-filter-toggle').click();assert(await page.locator('#ai-filters').isVisible());
  await page.screenshot({path:resolve(artifacts,'keyboard-direct.png')});
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>resizeTestViewport());await page.waitForTimeout(100);
  await page.locator('[data-act="reset-filters"]').click();
  await page.locator('#ai-source').selectOption('nsu-y4s1');
  await page.screenshot({path:resolve(artifacts,'desktop-filters.png')});
  const panel=await page.locator('#ai-filters').boundingBox();
  assert(panel.x>=0 && panel.x+panel.width<=1280 && panel.y>=0);
  await page.locator('[data-act="close-filters"]').click();
  assert.equal(await page.locator('.ai-filter-toggle').getAttribute('aria-expanded'),'false');
  await page.locator('.ai-filter-toggle').click();
  assert.equal(await page.locator('#ai-source').inputValue(),'nsu-y4s1');
  await page.locator('[data-act="reset-filters"]').click();
  assert(await page.locator('.ai-filter-count').evaluate(el=>el.hidden));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({openMs,immediateSearchWithoutCatalog:true,queryPreserved:true,filters:true,embeddedKeyboard:true,directKeyboard:true,scrollHeader:true,desktop:true,back:true,errors}));
} finally {releaseCatalog();await browser.close();await new Promise(r=>server.close(r));}
