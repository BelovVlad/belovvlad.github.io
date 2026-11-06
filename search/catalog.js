import defaults from '../config.js';

const sources = {
  helper: 'https://hyle.space/Helper_PF_NSU/materials.json',
  department: 'https://hyle.space/Department/viewer/search-index/files.json',
  nsu: 'https://hyle.space/NSU_FP_Y4_S1/docs/search-index/files.json'
};
export async function loadCatalog() {
  const sites = await fetch('./sites.json').then(r => { if (!r.ok) throw Error('catalog'); return r.json(); });
  const failed = [];
  const batches = await Promise.all(Object.entries(sources).map(async ([site,url]) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-cache' });
      if (!response.ok) throw Error('catalog');
      const data = await response.json();
      const files = Array.isArray(data) ? data : data.files;
      if (!Array.isArray(files)) throw Error('catalog format');
      return files.map(f => {
        const ext = String(f.ext || f.path.split('.').at(-1)).replace(/^\./,'').toLowerCase();
        const section = f.section || '';
        return { id: site+':'+f.path, site, title:f.title || f.path.split('/').at(-1), path:f.path,
          subject: site==='helper' ? f.group || '' : f.subject || '', section,
          kind:ext==='pdf' ? site==='helper'||/литерат|доп/i.test(section) ? 'book':'notes':'code', ext,
          semester:site==='helper' ? parseInt(f.section,10)||0 : site==='nsu'?7:0,
          file:site==='helper' ? f.view || f.href : f.path,
          size:f.size || f.bytes || 0, pages:f.pages || 0, version:f.version || '', reason:f.reason || '',
          description:f.description || '' };
      });
    } catch { failed.push(site); return []; }
  }));
  const known = new Set(sites.map(d=>d.url));
  for (const item of defaults.resources || []) {
    if (!/^https?:\/\//.test(item.url || '') || known.has(item.url)) continue;
    sites.push({ id:'home:resource:'+item.id, site:'home', kind:'site', ext:'', title:item.title,
      description:item.description || '', url:item.url, subject:'Ресурсы Home', path:'', section:'', size:0 });
    known.add(item.url);
  }
  return { docs:[...sites,...batches.flat()], failed };
}
