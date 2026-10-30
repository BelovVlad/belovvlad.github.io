// Publication uses a fresh artifact directory; source checkout is never deleted.
import { cp, mkdir } from 'node:fs/promises';
const output = new URL('../_site/', import.meta.url);
await mkdir(output, { recursive:true });
for (const file of ['index.html','styles.css','app.js','model.js','config.js','icons.js','site-search.js','sw.js','assets','.nojekyll']) {
  await cp(new URL('../' + file, import.meta.url), new URL(file, output), { recursive:true });
}
console.log('Static site prepared in _site/');
