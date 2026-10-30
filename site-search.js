// Full-text search in the other PweB sites. They share this origin, so the hub runs each
// site's own search worker over its own index and links straight into its reader.
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// The NSU site names subjects and sections by the path (site.js subjectOf/sectionOf);
// with facetsFromPath the hub's filters show the same names.
const SECTION_WORDS = [['лекц','Лекции'],['семинар','Семинары'],['лаборатор','Лабораторные'],['месяч','Задачи'],['задач','Задачи'],['литерат','Литература'],['практик','Практика'],['теори','Теория']];
export function pathFacets(path) {
  const parts = path.split('/'), qm = parts[0] === 'База' && parts[1] === 'КМ', subject = qm ? 'КМ' : parts[0];
  if (parts.length === 2) return { subject, section:'Справочники' };
  const raw = qm ? 'Лекции' : (parts[1] || 'Материалы').replace(/^\d+[_ .-]*/, '').replace(/_/g, ' '), low = raw.toLowerCase();
  return { subject, section: SECTION_WORDS.find(([word]) => low.includes(word))?.[1] || raw };
}

// One site from SITE_SEARCH (config.js): base holds search-worker.js, search-index/ and the readers.
export function materialsSource({ id, name, label, base, home, searchHash = false, facets = [], facetsFromPath = false, exclude = [], skipFolders = [], links = {} }) {
  let filesPromise = null, workerPromise = null, run = 0, pending = null;
  const meta = new Map();
  function files() {
    filesPromise ||= fetch(base + 'search-index/files.json', { cache:'no-cache' }).then(response => {
      if (!response.ok) throw new Error('files.json ' + response.status);
      return response.json();
    }).then(data => {
      // Same selection as the site's own catalogue.
      const rows = (data.files || []).filter(x => x?.path && /\.(pdf|ipynb)$/i.test(x.path) && !exclude.includes(x.path) && !skipFolders.some(folder => x.path.includes('/' + folder + '/')));
      for (const row of rows) meta.set(row.path, row);
      return rows.map(row => ({ path:row.path, title:row.title || row.path.split('/').pop(), subject:row.subject || '', section:row.section || '', ext:'.' + String(row.type || row.path.split('.').pop()).toLowerCase(), description:'' }));
    }).catch(error => { filesPromise = null; throw error; });
    return filesPromise;
  }
  function ensureWorker() {
    workerPromise ||= files().then(list => {
      const worker = new Worker(base + 'search-worker.js', { type:'module' });
      worker.postMessage({ type:'init', files:list });
      worker.onmessage = event => {
        const data = event.data;
        if (data.type !== 'results' || data.partial || data.id !== run || !pending) return;
        pending.resolve({ groups:data.groups, stems:data.stems || [], incomplete:!!data.failed });
        pending = null;
      };
      worker.onerror = event => { event.preventDefault(); worker.terminate(); workerPromise = null; pending?.reject(new Error('search worker failed')); pending = null; };
      return worker;
    }).catch(error => { workerPromise = null; throw error; });
    return workerPromise;
  }
  function link(path, location, query) {
    const row = meta.get(path) || {}, params = new URLSearchParams({ file:path, subject:row.subject || '', title:row.title || '' });
    if (links[path]) return base + links[path];
    const pdf = /\.pdf$/i.test(path);
    if (location) params.set(pdf ? 'page' : 'cell', location);
    if (row.version) params.set('v', row.version);
    if (row.reason === 'lfs') params.set('lfs', '1');
    if (query) params.set('find', query);
    return base + (pdf ? 'pdfjs/viewer.html?' : 'notebook/viewer.html?') + params.toString().replace(/\+/g, '%20');
  }
  return {
    id, name, label: label || name, facets,
    allUrl: query => searchHash ? home + '#search=' + encodeURIComponent(query) : home,
    async search(query) {
      const current = await ensureWorker();
      pending?.reject(new DOMException('superseded', 'AbortError'));
      const searchId = ++run;
      const result = new Promise((resolve, reject) => { pending = { resolve, reject }; });
      current.postMessage({ type:'search', id:searchId, query });
      const { groups, stems, incomplete } = await result;
      return {
        stems, incomplete,
        groups: groups.map(group => {
          const row = meta.get(group.path) || {}, pdf = /\.pdf$/i.test(group.path);
          const { subject, section } = facetsFromPath ? pathFacets(group.path) : { subject:row.subject || '', section:row.section || '' };
          return {
            title: row.title || group.path.split('/').pop(),
            subject, section,
            meta: [row.subject, row.section].filter(Boolean).join(' · '),
            badge: row.subject || '',
            url: link(group.path, group.hits[0]?.page || 0, query),
            snippet: group.hits[0]?.snippet || '',
            hits: group.hits.map(hit => ({ label: hit.page ? (pdf ? 'стр. ' : 'ячейка ') + hit.page : (pdf ? 'PDF' : 'Notebook'), url: link(group.path, hit.page, query) }))
          };
        })
      };
    }
  };
}

// Groups of one site's result narrowed by its facet choices, e.g. { subject:'ТДиСФ' }.
export function filterGroups(groups, choices = {}) {
  return groups.filter(group => Object.entries(choices).every(([key, value]) => !value || group[key] === value));
}

// Facet values present in the results with their document counts, in the site's own order of appearance.
export function facetValues(groups, key) {
  const counts = new Map();
  for (const group of groups) if (group[key]) counts.set(group[key], (counts.get(group[key]) || 0) + 1);
  return [...counts].sort((a, b) => a[0].localeCompare(b[0], 'ru')).map(([value, count]) => ({ value, count }));
}

// Marks the matched stems, extended to the end of each word, as the materials site does.
export function highlight(text, stems) {
  const raw = String(text || '');
  if (!stems.length) return escape(raw);
  const low = raw.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const pattern = new RegExp([...stems].sort((a,b) => b.length - a.length).map(t => [...t].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[-‐-―]?')).join('|'), 'gu');
  let out = '', pos = 0;
  for (const match of low.matchAll(pattern)) {
    if (match.index < pos) continue;
    let end = match.index + match[0].length;
    while (end < raw.length && /[\p{L}\p{N}]/u.test(raw[end])) end++;
    out += escape(raw.slice(pos, match.index)) + '<mark>' + escape(raw.slice(match.index, end)) + '</mark>';
    pos = end;
  }
  return out + escape(raw.slice(pos));
}
