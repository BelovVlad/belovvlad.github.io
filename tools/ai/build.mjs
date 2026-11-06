import {build} from 'esbuild';
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const home = resolve(here, '../..');
const output = resolve(home, 'search');
await build({entryPoints: [resolve(here, 'renderer.js')], bundle: true, format: 'esm', minify: true,
  outfile: resolve(output, 'ai-renderer.js'), legalComments: 'eof', target: 'es2022'});
await cp(resolve(here, 'sse.js'), resolve(output, 'ai-sse.js'));
await cp(resolve(here, 'node_modules/katex/dist/katex.min.css'), resolve(output, 'ai-katex.css'));
await mkdir(resolve(output, 'fonts'), {recursive: true});
await cp(resolve(here, 'node_modules/katex/dist/fonts'), resolve(output, 'fonts'), {recursive: true});
const licenses = [];
for (const [name, license] of [['markdown-it','LICENSE'],['markdown-it-texmath','license.txt'],
  ['katex','LICENSE'],['dompurify','LICENSE'],['highlight.js','LICENSE']]) {
  licenses.push(name + '\n' + await readFile(resolve(here, 'node_modules', name, license), 'utf8'));
}
await writeFile(resolve(output, 'ai-licenses.txt'), licenses.join('\n\n'));
// Optional explicit local synchronization into sibling checkouts; no publish action.
if (process.argv.includes('--sync-sites')) {
  for (const site of ['helper', 'department']) {
    const target = resolve(home, '..', site, 'site/assets');
    for (const asset of ['ai.js','ai.css','ai-renderer.js','ai-sse.js','ai-katex.css','ai-licenses.txt','fonts']) {
      await cp(resolve(output, asset), resolve(target, asset), {recursive: true});
    }
  }
}
