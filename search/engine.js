import { normalizeText, searchTerms } from './search-text.js';

export const sourceNames = { home: 'Home', helper: 'Хелпер ФФ', department: 'Кафедра', nsu: 'НГУ · Y4 S1', diploma: 'Диплом' };
export const kindNames = { all: 'Всё', book: 'Книги', notes: 'Конспекты', code: 'Код', site: 'Сайты' };

export function termsFor(query) {
  return searchTerms(query).map(item => item.stem);
}

export function textScore(doc, query) {
  const terms = termsFor(query);
  const title = normalizeText(doc.title);
  const text = normalizeText([doc.title, doc.subject, doc.section, doc.description, doc.path].filter(Boolean).join(' '));
  if (!terms.every(term => text.includes(term))) return -1;
  return 20 + terms.filter(term => title.includes(term)).length * 15 + (title.includes(normalizeText(query)) ? 30 : 0);
}

export function shortExcerpt(text, query) {
  const plain = String(text || '').replace(/<\/?mark>/g, '').replace(/\s+/g, ' ').trim();
  const words = plain.split(' ');
  const stems = termsFor(query);
  const found = words.findIndex(word => stems.some(stem => normalizeText(word).includes(stem)));
  const start = Math.max(0, found - 6);
  const excerpt = words.slice(start, start + 22).join(' ');
  return (start ? '…' : '') + excerpt + (start + 22 < words.length ? '…' : '');
}

export function documentUrl(doc, page = 0, query = '') {
  if (doc.url) return doc.url;
  if (doc.site === 'nsu' && doc.path === 'База/Частицы.ipynb') return 'https://hyle.space/NSU_FP_Y4_S1/docs/particles/';
  const bases = { helper: 'Helper_PF_NSU/viewer/', department: 'Department/viewer/', nsu: 'NSU_FP_Y4_S1/docs/' };
  const reader = doc.ext === 'pdf' ? 'pdfjs/viewer.html' : doc.ext === 'ipynb' ? 'notebook/viewer.html' : 'notebook/code.html';
  const url = new URL(bases[doc.site] + reader, 'https://hyle.space/');
  const params = new URLSearchParams({ file: doc.file || doc.path, title: doc.title, subject: doc.subject || '' });
  if (page) params.set(doc.ext === 'pdf' ? 'page' : doc.ext === 'ipynb' ? 'cell' : 'line', page);
  // PDF links open a reading position. A hidden reader search would leave marks active.
  if (query && doc.ext !== 'pdf') params.set('find', query);
  if (doc.version) params.set('v', doc.version);
  if (doc.reason === 'lfs') params.set('lfs', '1');
  if (doc.site === 'helper') params.set('source', doc.file);
  url.search = params.toString();
  return url.href;
}

export function groupedResults(catalog, query, hits = new Map()) {
  const groups = new Map();
  for (const doc of catalog) {
    const score = textScore(doc, query);
    const found = hits.get(doc.id);
    if (query.trim() && score < 0 && !found) continue;
    const key = doc.kind === 'site' || !doc.size ? doc.id : `${normalizeText(doc.title)}|${doc.size}`;
    let group = groups.get(key);
    if (!group) {
      group = { id: doc.id, doc, copies: [], hits: [], score: -1 };
      groups.set(key, group);
    }
    group.copies.push(doc);
    group.score = Math.max(group.score, score + (found ? 20 : 0), found?.score || -1);
    for (const hit of found?.hits || []) {
      if (!group.hits.some(existing => existing.doc.id === doc.id && existing.page === hit.page)) group.hits.push({ ...hit, doc });
    }
  }
  return [...groups.values()].sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title, 'ru'));
}

export class SearchEngine {
  constructor(catalog) {
    this.catalog = catalog;
    this.byId = new Map(catalog.map(doc => [doc.id, doc]));
    this.workers = new Map();
    this.run = 0;
    this.query = '';
    this.hits = new Map();
    this.status = {};
    this.helperOffset = 0;
    this.helperTotal = 0;
    this.helperSubject = '';
    this.helperSemester = '';
  }

  snapshot() {
    return { query: this.query, hits: [...this.hits], status: { ...this.status }, helperOffset: this.helperOffset, helperTotal: this.helperTotal };
  }

  setCatalog(catalog) {
    this.run++;
    this.abort?.abort();
    for (const worker of this.workers.values()) worker.terminate();
    this.workers.clear();
    this.catalog = catalog;
    this.byId = new Map(catalog.map(doc => [doc.id, doc]));
  }

  emit() { this.onUpdate?.(this.snapshot()); }

  worker(site) {
    if (this.workers.has(site)) return this.workers.get(site);
    const worker = new Worker('./search-worker.js', { type: 'module' });
    const base = site === 'department' ? 'https://hyle.space/Department/viewer/' : 'https://hyle.space/NSU_FP_Y4_S1/docs/';
    worker.postMessage({ type: 'init', base, files: this.catalog.filter(doc => doc.site === site && doc.kind !== 'site').map(doc => ({
      path: doc.path, title: doc.title, subject: doc.subject, section: doc.section, ext: '.' + doc.ext, description: ''
    })) });
    worker.onmessage = event => {
      const data = event.data;
      if (data.id !== this.run) return;
      if (data.type === 'progress') {
        this.status[site] = 'loading';
        this.emit();
      }
      if (data.type !== 'results') return;
      for (const group of data.groups) {
        const pageHits = group.hits.filter(hit => hit.page > 0);
        if (!pageHits.length) continue;
        this.hits.set(site + ':' + group.path, {
          score: 35 + Math.min(30, group.score / 8),
          hits: pageHits.map((hit, index) => ({ page: hit.page, text: index === 0 ? shortExcerpt(hit.snippet, this.query) : '' }))
        });
      }
      this.status[site] = data.partial ? 'loading' : data.failed ? 'partial' : 'ready';
      this.emit();
    };
    worker.onerror = event => {
      event.preventDefault();
      worker.terminate();
      this.workers.delete(site);
      this.status[site] = 'error';
      this.emit();
    };
    this.workers.set(site, worker);
    return worker;
  }

  search(query, onUpdate, filters = {}) {
    this.run += 1;
    this.query = query;
    this.onUpdate = onUpdate;
    this.abort?.abort();
    this.hits.clear();
    this.helperOffset = 0;
    this.helperTotal = 0;
    this.helperSubject = filters.subject || '';
    this.helperSemester = filters.semester || '';
    this.status = {};
    for (const worker of this.workers.values()) worker.postMessage({ type: 'cancel', id: this.run });
    if (termsFor(query).length === 0) { this.emit(); return; }
    this.status = { helper: 'loading', department: 'loading', nsu: 'loading' };
    this.emit();
    for (const site of ['department', 'nsu']) this.worker(site).postMessage({ type: 'search', id: this.run, query });
    void this.loadMoreHelper();
  }

  async loadMoreHelper() {
    if (this.helperLoadingRun === this.run) return;
    const run = this.run;
    this.helperLoadingRun = run;
    this.abort = new AbortController();
    const controller = this.abort;
    const timeout = setTimeout(() => controller.abort(), 15000);
    const params = new URLSearchParams({ q: this.query, site: 'helper', limit: '50', offset: String(this.helperOffset) });
    if (this.helperSubject) params.set('subject', this.helperSubject);
    if (this.helperSemester) params.set('semester', this.helperSemester);
    this.status.helper = 'loading';
    this.emit();
    try {
      const response = await fetch('https://api.hyle.space/search?' + params, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (run !== this.run) return;
      this.helperOffset += data.hits.length;
      this.helperTotal = data.total;
      for (const hit of data.hits) {
        const id = 'helper:' + hit.book;
        if (!this.byId.has(id)) continue;
        let group = this.hits.get(id);
        if (!group) {
          group = { score: 35 + (hit.score || 0) * 30, hits: [] };
          this.hits.set(id, group);
        }
        if (!group.hits.some(existing => existing.page === hit.page)) group.hits.push({
          page: hit.page, text: group.hits.length ? '' : shortExcerpt(hit.snippet, this.query)
        });
      }
      this.status.helper = data.hits.length === 0 || this.helperOffset >= data.total ? 'ready' : 'more';
    } catch {
      if (run === this.run) this.status.helper = 'error';
    } finally {
      clearTimeout(timeout);
      if (run === this.run) { this.helperLoadingRun = 0; this.emit(); }
    }
  }
}
