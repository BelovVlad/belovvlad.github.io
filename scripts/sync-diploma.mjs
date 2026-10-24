// Copies the built Diploma site (../Diploma/dist) into diploma/ for GitHub Pages.
import { cp, rm, stat } from 'node:fs/promises';
const source = new URL('../../Diploma/dist/', import.meta.url);
const output = new URL('../diploma/', import.meta.url);
await stat(new URL('index.html', source)).catch(() => { throw new Error('Run "npm run build" in Diploma first'); });
await rm(output, { recursive:true, force:true });
await cp(source, output, { recursive:true });
console.log('Diploma copied to diploma/');
