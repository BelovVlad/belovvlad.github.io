// Renders the app icons (assets/app-*.png, apple-touch-icon.png) and favicons (favicon-16/32.png) from the logo SVGs
// that scripts/logo.py writes.
// Needs a Chromium: PWEB_BROWSER is the path to its executable (Edge works).
//   python scripts/logo.py && node scripts/icons.mjs
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const assets = new URL('../assets/', import.meta.url);
const svg = async name => (await readFile(new URL(name, assets), 'utf8')).replace(/<!--.*?-->/s, '');
const browser = await chromium.launch(process.env.PWEB_BROWSER ? { executablePath: process.env.PWEB_BROWSER } : {});
const page = await browser.newPage();
const tile = await svg('logo-tile.svg'), maskable = await svg('logo-maskable.svg'), soft = await svg('favicon-soft.svg');
// "any" icons keep the rounded tile; maskable and Apple icons are full-bleed (the system rounds them itself).
// Favicons: at 16 px dots blur into a smudge, so the tab gets the smoothly shaded ball; from 32 px it gets the dots.
for (const [name, source, size] of [['app-192', tile, 192], ['app-512', tile, 512], ['app-maskable-512', maskable, 512], ['apple-touch-icon', tile.replace(/rx="\d+"/, 'rx="0"'), 180],
  ['favicon-16', soft, 16], ['favicon-32', tile, 32]]) {
  await page.setViewportSize({ width:size, height:size });
  await page.setContent(`<body style="margin:0;background:transparent">${source.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body>`);
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, assets)), omitBackground: true, clip:{ x:0, y:0, width:size, height:size } });
}
await browser.close();
console.log('Icons rendered into assets/');
