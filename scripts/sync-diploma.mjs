// Copies the built Diploma site (../Diploma/site/dist) into diploma/ for GitHub Pages.
// diploma/web (the 3D presentation, published earlier) is not part of that build and is kept as is.
import { cp, readdir, rm, stat } from 'node:fs/promises';
const source = new URL('../../Diploma/site/dist/', import.meta.url);
const output = new URL('../diploma/', import.meta.url);
const kept = new Set(['web']);
await stat(new URL('index.html', source)).catch(() => { throw new Error('Run "npm run build" in Diploma/site first'); });
for (const entry of await readdir(output).catch(() => [])) if (!kept.has(entry)) await rm(new URL(entry, output), { recursive:true, force:true });
await cp(source, output, { recursive:true });
console.log('Diploma copied to diploma/ (web/ kept)');
