import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// On GitHub Pages the other sites are published next to the hub; locally, serve the sibling
// checkouts at the same paths, in the layout their Pages builds publish (longest prefix wins).
const nsu = process.env.PWEB_NSU_ROOT || fileURLToPath(new URL('../../NSU Y4 S1/', import.meta.url));
const department = process.env.PWEB_DEPARTMENT_ROOT || fileURLToPath(new URL('../../Department/', import.meta.url));
const mounts = {
  '/NSU_FP_Y4_S1/docs/': resolve(nsu, 'site', 'web'),
  '/NSU_FP_Y4_S1/': nsu,
  '/Department/files/': department,
  '/Department/': resolve(department, 'site')
};
const port = Number(process.env.PORT || 43871);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.pdf':'application/pdf', '.webp':'image/webp', '.png':'image/png', '.webmanifest':'application/manifest+json', '.mjs':'text/javascript; charset=utf-8', '.woff2':'font/woff2', '.bcmap':'application/octet-stream' };
const server = http.createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), base = root;
    const mount = Object.keys(mounts).sort((a, b) => b.length - a.length).find(prefix => path.startsWith(prefix));
    if (mount) { base = mounts[mount]; path = '/' + path.slice(mount.length); }
    const file = resolve(base, '.' + (path.endsWith('/') ? path + 'index.html' : path));
    if (!file.startsWith(base.endsWith(sep) ? base : base + sep)) { res.writeHead(403).end('Forbidden'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type':types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`PweB Home: http://127.0.0.1:${port}`));
