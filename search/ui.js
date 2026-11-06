import { sourceNames, kindNames, termsFor, groupedResults, documentUrl } from './engine.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fallback = { search: '⌕', x: '×', 'arrow-up-right': '↗', 'arrow-left': '←', 'sliders-horizontal': '☷', sun: '☼', moon: '☾', globe: '◎', lock: '▣', 'corner-down-left': '↵', 'chevron-down': '⌄' };
const icon = name => `<span class="icon" aria-hidden="true"><i data-lucide="${name}" data-fallback="${fallback[name] || '·'}"></i></span>`;
const icons = () => globalThis.lucide?.createIcons({ attrs: { width: 18, height: 18 } });
const sourceIds = Object.keys(sourceNames);

function highlight(text, query) {
  const terms = termsFor(query);
  return String(text).split(/([\p{L}\p{N}]+)/gu).map((part, index) => {
    const match = index % 2 && terms.some(term => part.toLocaleLowerCase('ru').replaceAll('ё', 'е').includes(term));
    return match ? `<mark>${escape(part)}</mark>` : escape(part);
  }).join('');
}

function plural(count) {
  const last = count % 10;
  if (count % 100 >= 11 && count % 100 <= 14) return 'материалов';
  return last === 1 ? 'материал' : last >= 2 && last <= 4 ? 'материала' : 'материалов';
}

export function mountSearch(root, catalog, engine, options = {}) {
  const state = { query: options.initialQuery || '', type: 'all', sources: [...sourceIds], subject: '', semester: '', sort: 'relevance', limit: 5, entry: sourceIds.includes(options.entry) ? options.entry : 'home', closed: false };
  let live = { query: '', hits: [], status: {} };
  let baseResults = [];
  let timer;
  let interacted = false;
  const views = [];
  const subjects = [...new Set(catalog.map(doc => doc.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  let entryScroll = 0;
  const historyKey = 'hyleUnifiedSearch';
  function setSearchOpen(open, fromHistory = false) {
    if (!open && options.onClose) { options.onClose(); return; }
    if (!fromHistory && !options.preview && !options.onClose) {
      if (open && !history.state?.[historyKey]) {
        entryScroll = scrollY;
        history.pushState({ ...history.state, [historyKey]: true }, '');
      } else if (!open && history.state?.[historyKey]) { history.back(); return; }
    }
    state.closed = !open;
    update();
    if (!open) {
      if (!options.preview) scrollTo(0, entryScroll);
      views.find(view=>view.app.offsetParent!==null)?.app.querySelector('[data-action="open"]')?.focus({preventScroll:true});
    }
  }
  if (!options.preview && !options.onClose) {
    if (!history.state?.[historyKey]) history.pushState({ ...history.state, [historyKey]: true }, '');
    window.addEventListener('popstate', () => {
      if (history.state?.hyleAi) return;
      setSearchOpen(Boolean(history.state?.[historyKey]), true);
    });
  }

  function filtered(groups, choices = state) {
    return groups.flatMap(group => {
      const copies = group.copies.filter(doc => choices.sources.includes(doc.site) &&
        (!choices.subject || doc.subject === choices.subject) && (!choices.semester || String(doc.semester) === choices.semester));
      if (!copies.length || choices.type !== 'all' && group.doc.kind !== choices.type) return [];
      const allowed = new Set(copies.map(doc => doc.id));
      return [{ ...group, doc: copies[0], copies, hits: group.hits.filter(hit => allowed.has(hit.doc.id)) }];
    });
  }

  function save() {
    interacted = true;
    options.onState?.({ ...state });
    window.openai?.setWidgetState?.({ modelContent: { query: state.query, sources: state.sources, type: state.type }, privateContent: { state } })?.catch(() => {});
  }

  function update() {
    const matching = live.query === state.query ? new Map(live.hits) : new Map();
    baseResults = groupedResults(catalog, state.query, matching);
    const results = filtered(baseResults);
    if (state.sort === 'title') results.sort((a, b) => a.doc.title.localeCompare(b.doc.title, 'ru'));
    for (const view of views) view.render(results);
    icons();
  }

  function search(immediate = false) {
    clearTimeout(timer);
    state.limit = 5;
    update();
    const run = () => engine.search(state.query, snapshot => { live = snapshot; update(); }, state);
    if (immediate) run();
    else timer = setTimeout(run, 250);
  }

  for (const section of root.querySelectorAll(':scope > section')) {
    const phone = section.dataset.mode === 'phone';
    const app = document.createElement('div');
    app.className = 'search-app';
    app.dataset.mode = phone ? 'phone' : 'desktop';
    app.setAttribute('aria-label', phone ? 'Поиск Hyle на телефоне' : 'Поиск Hyle на компьютере');
    section.append(app);
    app.innerHTML = `<header class="topbar"><div class="brand"><img src="${escape(options.logo || './logo.svg')}" alt=""><span>Hyle</span><small>Поиск</small></div><div class="top-actions"><button type="button" class="quiet icon-button" data-action="close" aria-label="Закрыть поиск">${icon('x')}</button></div></header>
      <div class="launcher" hidden><nav class="entry-nav" aria-label="Открыть поиск с сайта">${sourceIds.map(source => `<button type="button" data-entry="${source}">${escape(sourceNames[source])}</button>`).join('')}</nav><h1 data-entry-title>Home</h1><button type="button" class="launch-search" data-action="open">${icon('search')}Поиск по всему Hyle</button></div>
      <main class="body"><form class="search-field" role="search" aria-label="Общий поиск Hyle">${icon('search')}<input type="search" aria-label="Поисковый запрос" placeholder="Книга, автор, тема или фраза…" enterkeyhint="search" maxlength="250" autocomplete="off" spellcheck="false"><button type="button" class="quiet icon-button" data-action="clear-query" aria-label="Очистить запрос">${icon('x')}</button><button type="submit" class="submit-query quiet icon-button" aria-label="Найти">${icon('corner-down-left')}</button><button type="button" class="quiet ai-trigger" data-action="ai" aria-label="Спросить ИИ по книгам Хелпера"><img src="${escape(options.logo || './logo.svg')}" alt=""></button></form>
        <div class="query-note"><span>Все сайты и материалы Hyle</span><span data-entry-note></span></div>
        <div class="tabs-bar"><div class="tabs" role="group" aria-label="Тип материала">${Object.entries(kindNames).map(([key, label]) => `<button type="button" data-type="${key}" aria-pressed="${key === 'all'}">${label}</button>`).join('')}</div><button type="button" class="filter-button" data-action="filters" aria-haspopup="dialog" aria-label="Фильтры">${icon('sliders-horizontal')}<span class="filter-label">Фильтры</span><span class="filter-badge" hidden></span></button></div>
        <div class="active-filters" hidden></div>
        <div class="result-meta-bar"><span class="result-total" aria-live="polite" aria-atomic="true"></span><select class="sort" aria-label="Сортировка"><option value="relevance">По релевантности</option><option value="title">По названию</option></select></div>
        <ul class="results" aria-label="Результаты поиска"></ul>
        <div class="empty" hidden><h2>Ничего не нашлось</h2><p>Измените запрос или расширьте фильтры.</p><button type="button" data-action="reset">Сбросить фильтры</button></div>
        <div class="suggestions" hidden><h2>Что ищем?</h2><div class="suggestion-list">${['Оптика', 'Ландау', 'Квантовая механика', 'Интерференция', 'Численные методы'].map(query => `<button type="button" data-query="${query}">${query}</button>`).join('')}</div><p class="coverage">${catalog.filter(doc => doc.kind !== 'site').length} файлов · Home, Хелпер ФФ, Кафедра и НГУ<br>Материалы диплома открываются по паролю.</p></div>
        <div class="pager"><button type="button" data-action="more" hidden>Показать ещё</button><button type="button" class="quiet" data-action="more-text" hidden>Ещё совпадения в книгах</button></div>
        <div class="search-status" aria-live="polite" aria-atomic="true"></div>
      </main>
      <div class="scrim" hidden></div><dialog class="filter-dialog" aria-modal="true" aria-label="Фильтры поиска"><div class="dialog-header"><h2>Фильтры</h2><button type="button" class="quiet icon-button" data-action="cancel-filters" aria-label="Закрыть фильтры">${icon('x')}</button></div><fieldset class="source-options"><legend>Где искать</legend>${sourceIds.map(source => `<label class="check"><input type="checkbox" data-source="${source}"><span>${escape(sourceNames[source])}</span><span class="count" data-source-count="${source}"></span></label>`).join('')}</fieldset><p class="locked-note">В дипломе доступна страница входа. Файлы зашифрованы.</p>
        <div class="filter-fields"><label class="field">Предмет<select data-field="subject"><option value="">Все предметы</option>${subjects.map(subject => `<option>${escape(subject)}</option>`).join('')}</select></label><label class="field">Семестр<select data-field="semester"><option value="">Все семестры</option>${[1,2,3,4,5,6,7,8].map(n => `<option value="${n}">${n} семестр</option>`).join('')}</select></label><label class="field">Тип<select data-field="type">${Object.entries(kindNames).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label></div><div class="dialog-footer"><button type="button" data-action="reset-draft">Сбросить</button><button type="button" class="primary" data-action="apply">Показать результаты</button></div></dialog>`;

    const $ = selector => app.querySelector(selector);
    const input = $('input[type="search"]');
    const body = $('.body');
    const dialog = $('dialog');
    let expanded = '';
    let expandedLimit = 12;
    let draft;
    let previousHeight;

    function openFilters() {
      draft = { ...state, sources: [...state.sources] };
      syncDraft();
      body.inert = true;
      $('.topbar').inert = true;
      $('.scrim').hidden = false;
      dialog.show();
      previousHeight = app.style.minHeight;
      app.style.minHeight = Math.max(app.offsetHeight, dialog.offsetTop + dialog.offsetHeight + 15) + 'px';
      $('[data-action="cancel-filters"]').focus();
    }

    function syncDraft() {
      for (const checkbox of dialog.querySelectorAll('[data-source]')) {
        checkbox.checked = draft.sources.includes(checkbox.dataset.source);
        $(`[data-source-count="${checkbox.dataset.source}"]`).textContent = baseResults.filter(group => group.copies.some(doc => doc.site === checkbox.dataset.source)).length;
      }
      for (const select of dialog.querySelectorAll('[data-field]')) select.value = draft[select.dataset.field];
      const count = filtered(baseResults, draft).length;
      $('[data-action="apply"]').textContent = `Показать ${count} ${plural(count)}`;
    }

    function row(group) {
      const doc = group.doc;
      const subject = doc.subject && !doc.title.toLocaleLowerCase('ru').includes(doc.subject.toLocaleLowerCase('ru')) ? doc.subject : '';
      const semesters = [...new Set(group.copies.map(copy => copy.semester).filter(Boolean))].sort((a,b) => a-b);
      const place = [sourceNames[doc.site], subject, semesters.length ? `${semesters.join(', ')} сем.` : ''].filter(Boolean).join(' · ');
      const textHit = group.hits.find(hit => hit.text);
      const orderedHits = [...group.hits].sort((a,b) => a.page-b.page);
      const hits = orderedHits.slice(0, expanded === group.id ? expandedLimit : 3);
      const firstPage = group.hits[0]?.page || 0;
      const fileLabel = doc.locked ? icon('lock') : doc.kind === 'site' ? icon('globe') : doc.ext.toUpperCase();
      const label = doc.ext === 'pdf' ? 'стр.' : doc.ext === 'ipynb' ? 'яч.' : 'строка';
      const morePages = expanded === group.id && hits.length < group.hits.length ? `<button type="button" data-page-more="${escape(group.id)}">Показать ещё ${Math.min(12, group.hits.length - hits.length)}</button>` : '';
      const detail = group.hits.length ? `<div class="result-detail"><p class="match-count">${doc.ext === 'pdf' ? 'Страницы с совпадениями' : 'Места с совпадениями'}: ${group.hits.length}${doc.site === 'helper' && live.status.helper === 'more' ? ' · загруженная часть' : ''}</p>${textHit ? `<p class="snippet">${highlight(textHit.text, state.query)}</p>` : ''}<div class="page-links">${hits.map(hit => `<a href="${escape(documentUrl(hit.doc, hit.page, state.query))}" target="_blank" rel="noopener noreferrer" aria-label="${escape(doc.title)}, ${label} ${hit.page}">${label} ${hit.page}</a>`).join('')}${morePages}${group.hits.length > 3 ? `<button type="button" data-expand="${escape(group.id)}" aria-expanded="${expanded === group.id}">${expanded === group.id ? 'Свернуть' : 'Выбрать страницу'}</button>` : ''}</div></div>` : '';
      return `<li class="result"><a class="result-main" href="${escape(documentUrl(doc, firstPage, state.query))}" target="_blank" rel="noopener noreferrer"><span class="file-badge ${doc.ext === 'pdf' ? 'pdf' : ''}" aria-hidden="true">${fileLabel}</span><span><span class="result-title">${highlight(doc.title, state.query)}</span><span class="result-breadcrumb">${escape(place)}${group.copies.length > 1 ? ` · ${group.copies.length} размещения` : ''}${doc.locked ? ' · По паролю' : ''}</span></span><span class="row-arrow">${icon('arrow-up-right')}</span></a>${detail}</li>`;
    }

    function render(results) {
      if (input.value !== state.query) input.value = state.query;
      body.hidden = state.closed;
      $('.launcher').hidden = !state.closed;
      $('[data-action="close"]').hidden = state.closed;
      $('[data-entry-title]').textContent = sourceNames[state.entry];
      $('[data-entry-note]').textContent = sourceNames[state.entry];
      for (const button of app.querySelectorAll('[data-entry]')) button.setAttribute('aria-pressed', button.dataset.entry === state.entry);
      for (const button of app.querySelectorAll('[data-type]')) button.setAttribute('aria-pressed', button.dataset.type === state.type);
      $('[data-action="clear-query"]').hidden = !state.query;
      $('.sort').value = state.sort;
      const filters = [];
      if (state.sources.length !== sourceIds.length) filters.push(['sources', state.sources.length ? state.sources.map(id => sourceNames[id]).join(', ') : 'Источники не выбраны']);
      if (state.subject) filters.push(['subject', state.subject]);
      if (state.semester) filters.push(['semester', `${state.semester} семестр`]);
      $('.filter-badge').hidden = !filters.length;
      $('.filter-badge').textContent = filters.length;
      $('.active-filters').hidden = !filters.length;
      $('.active-filters').innerHTML = filters.map(([key,label]) => `<button type="button" data-remove="${key}" aria-label="Убрать фильтр ${escape(label)}">${escape(label)} ×</button>`).join('');
      const hasQuery = Boolean(state.query.trim());
      $('.suggestions').hidden = hasQuery;
      $('.result-meta-bar').hidden = !hasQuery;
      $('.results').hidden = !hasQuery;
      $('.empty').hidden = !hasQuery || results.length > 0;
      const incomplete = !options.preview && live.query === state.query && Object.values(live.status).some(status => status === 'loading' || status === 'more' || status === 'partial' || status === 'error');
      $('.result-total').textContent = `${results.length}${incomplete ? '+' : ''} ${plural(results.length)}`;
      const narrow = phone || app.clientWidth > 0 && app.clientWidth <= 620;
      const size = narrow ? Math.max(4, state.limit - 1) : state.limit;
      $('.results').innerHTML = results.slice(0, size).map(row).join('');
      $('[data-action="more"]').hidden = !hasQuery || results.length <= size;
      $('[data-action="more-text"]').hidden = options.preview || !hasQuery || live.query !== state.query || live.status.helper !== 'more';
      const states = options.preview ? `<span>Каталог от 6 ноября · ${catalog.filter(doc => doc.kind !== 'site').length} файлов</span>` : Object.entries(live.query === state.query ? live.status : {}).map(([site, status]) => {
        const label = { loading:'поиск…', ready:'готово', more:`${live.helperOffset} из ${live.helperTotal} страниц`, error:'временно недоступен', partial:'часть индекса недоступна' }[status];
        return `<span class="${status === 'error' || status === 'partial' ? 'error-note' : ''}"><span class="status-dot" aria-hidden="true"></span>${escape(sourceNames[site])} · ${label}</span>`;
      }).join('');
      $('.search-status').innerHTML = hasQuery ? states : '';
      if (dialog.open) syncDraft();
    }

    function reset() {
      Object.assign(state, { sources: [...sourceIds], subject: '', semester: '', type: 'all' });
      search(true);
    }

    input.addEventListener('input', () => { interacted = true; state.query = input.value; search(); save(); });
    input.addEventListener('change', save);
    $('form').addEventListener('submit', event => { event.preventDefault(); search(true); if (app.clientWidth <= 620) input.blur(); save(); });
    app.addEventListener('change', event => {
      if (dialog.contains(event.target)) {
        if (event.target.dataset.source) draft.sources = [...dialog.querySelectorAll('[data-source]:checked')].map(input => input.dataset.source);
        else if (event.target.dataset.field) draft[event.target.dataset.field] = event.target.value;
        syncDraft();
      } else if (event.target.matches('.sort')) { state.sort = event.target.value; update(); save(); }
    });
    app.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !app.contains(button)) return;
      const { action, type, query, entry, remove, expand, pageMore } = button.dataset;
      if (type) { state.type = type; state.limit = 5; update(); }
      if (query) { state.query = query; search(true); }
      if (entry) { state.entry = entry; update(); }
      if (remove) { state[remove] = remove === 'sources' ? [...sourceIds] : ''; search(true); }
      if (expand) { expanded = expanded === expand ? '' : expand; expandedLimit = 12; update(); app.querySelector(`[data-expand="${CSS.escape(expand)}"]`)?.focus(); }
      if (pageMore) { expandedLimit += 12; update(); (app.querySelector(`[data-page-more="${CSS.escape(pageMore)}"]`) || app.querySelector(`[data-expand="${CSS.escape(pageMore)}"]`))?.focus(); }
      if (action === 'close') setSearchOpen(false);
      if (action === 'open') { setSearchOpen(true); input.focus(); }
      if (action === 'clear-query') { state.query = ''; search(true); input.focus(); }
      if (action === 'filters') openFilters();
      if (action === 'cancel-filters') dialog.close();
      if (action === 'reset-draft') { Object.assign(draft, {sources:[...sourceIds],subject:'',semester:'',type:'all'}); syncDraft(); }
      if (action === 'apply') { Object.assign(state, { sources:[...draft.sources],subject:draft.subject,semester:draft.semester,type:draft.type }); dialog.close(); search(true); }
      if (action === 'reset') reset();
      if (action === 'more') { state.limit += 5; update(); $('[data-action="more"]').hidden ? $('.results li:last-child a').focus() : $('[data-action="more"]').focus(); }
      if (action === 'more-text') engine.loadMoreHelper?.();
      save();
    });
    $('.scrim').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      body.inert = false;
      $('.topbar').inert = false;
      $('.scrim').hidden = true;
      app.style.minHeight = previousHeight;
      $('[data-action="filters"]').focus();
    });
    app.addEventListener('keydown', event => {
      if (dialog.open) {
        if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
        if (event.key === 'Tab') {
          const focusable = [...dialog.querySelectorAll('button,input,select')].filter(el => !el.disabled);
          const end = event.shiftKey ? focusable[0] : focusable.at(-1);
          if (document.activeElement === end) { event.preventDefault(); (event.shiftKey ? focusable.at(-1) : focusable[0]).focus(); }
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); input.focus(); input.select(); }
      if (event.key === 'Escape' && !state.closed) { event.preventDefault(); setSearchOpen(false); save(); }
      const links = [...app.querySelectorAll('.result-main')];
      const current = links.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' && (document.activeElement === input || current >= 0)) { event.preventDefault(); links[Math.min(current + 1, links.length - 1)]?.focus(); }
      if (event.key === 'ArrowUp' && current >= 0) { event.preventDefault(); (current === 0 ? input : links[current - 1]).focus(); }
    });
    if (globalThis.Tweak) {
      const design = { density: 'comfortable', excerpts: true };
      const tweak = new Tweak({ container: app, onChange: () => {
        app.dataset.density = design.density;
        app.dataset.excerpts = design.excerpts ? 'on' : 'off';
      } });
      tweak.addSelect(design, 'density', { label:'Плотность', options:[{label:'Свободная',value:'comfortable'},{label:'Компактная',value:'compact'}] });
      tweak.addToggle(design, 'excerpts', { label:'Фрагменты текста' });
    }
    if (options.preview) options.mountAi?.(app, {
      box: $('.search-field'), input, button: $('[data-action="ai"]'),
      getScope: () => ({ subject: state.subject, semester: state.semester, label: ['книги Хелпера', state.subject, state.semester ? `${state.semester} семестр` : ''].filter(Boolean).join(' · ') })
    });
    views.push({ render, app, focus: () => { setSearchOpen(true); input.focus(); input.select(); } });
    let width = app.clientWidth;
    const observer = new ResizeObserver(() => {
      if (app.clientWidth > 0 && app.clientWidth !== width) { width = app.clientWidth; update(); }
    });
    observer.observe(app);
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  }

  function restore(snapshot) {
    const saved = snapshot?.privateContent?.state;
    if (!saved || typeof saved.query !== 'string') return;
    state.query = saved.query.slice(0,250);
    if (Object.hasOwn(kindNames,saved.type)) state.type=saved.type;
    if (Array.isArray(saved.sources)) state.sources=sourceIds.filter(source=>saved.sources.includes(source));
    if (subjects.includes(saved.subject) || saved.subject==='') state.subject=saved.subject;
    if (/^[1-8]?$/.test(saved.semester)) state.semester=saved.semester;
  }
  restore(window.openai?.widgetState);
  document.addEventListener('keydown', event => {
    if (document.documentElement.classList.contains('ai-open')) return;
    if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
    const active = views.find(view => view.app.offsetParent !== null);
    if (active && !active.app.querySelector('dialog[open]')) { event.preventDefault(); active.focus(); }
  });
  window.addEventListener('openai:set_globals', event => { if (!interacted) { restore(event.detail?.globals?.widgetState); search(true); } });
  search(true);
  return { getState: () => ({ ...state }), getSnapshot: () => live, open(query) {
    if(typeof query==='string' && query!==state.query){state.query=query.slice(0,250);search(true);}
    views.find(view=>view.app.offsetParent!==null)?.focus();
  } };
}

