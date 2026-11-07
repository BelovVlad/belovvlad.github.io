import defaults from '../config.js';

const sources = {
  helper: 'https://hyle.space/Helper_PF_NSU/materials.json',
  department: 'https://hyle.space/Department/viewer/search-index/files.json',
  nsu: 'https://hyle.space/NSU_FP_Y4_S1/docs/search-index/files.json'
};
export async function loadCatalog(onUpdate = () => {}) {
  const failed = [], batches = new Map();
  let pending = Object.keys(sources).length + 1;
  const snapshot = () => {
    // Keep source priority independent of network completion order.
    const docs = ['home', ...Object.keys(sources)].flatMap(site => batches.get(site) || []);
    const known = new Set(docs.map(d => d.url));
    for (const item of defaults.resources || []) {
      if (!/^https?:\/\//.test(item.url || '') || known.has(item.url)) continue;
      docs.push({id:'home:resource:'+item.id,site:'home',kind:'site',ext:'',title:item.title,
        description:item.description || '',url:item.url,subject:'Ресурсы Home',path:'',section:'',size:0});
      known.add(item.url);
    }
    return {docs, failed:[...failed], pending};
  };
  onUpdate(snapshot());
  const tasks = Object.entries(sources).map(async ([site,url]) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-cache' });
      if (!response.ok) throw Error('catalog');
      const data = await response.json();
      const files = Array.isArray(data) ? data : data.files;
      if (!Array.isArray(files)) throw Error('catalog format');
      batches.set(site, files.map(f => {
        const ext = String(f.ext || f.path.split('.').at(-1)).replace(/^\./,'').toLowerCase();
        const section = f.section || '';
        return { id: site+':'+f.path, site, title:f.title || f.path.split('/').at(-1), path:f.path,
          subject: site==='helper' ? f.group || '' : f.subject || '', section,
          kind:ext==='pdf' ? site==='helper'||/литерат|доп/i.test(section) ? 'book':'notes':'code', ext,
          semester:site==='helper' ? parseInt(f.section,10)||0 : site==='nsu'?7:0,
          file:site==='helper' ? f.view || f.href : f.path,
          size:f.size || f.bytes || 0, pages:f.pages || 0, version:f.version || '', reason:f.reason || '',
          description:f.description || '' };
      }));
    } catch { failed.push(site); }
    finally { pending--; onUpdate(snapshot()); }
  });
  tasks.push((async () => {
    try {
      const response = await fetch('./sites.json', {signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw Error('catalog');
      const sites = await response.json();
      if (!Array.isArray(sites)) throw Error('catalog format');
      batches.set('home', sites);
    } catch { failed.push('home'); }
    finally { pending--; onUpdate(snapshot()); }
  })());
  await Promise.all(tasks);
  return snapshot();
}
