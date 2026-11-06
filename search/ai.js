// Hyle AI: hold the search bar (~0.7 s) or press the dots button in it. A frame of dots runs around the
// bar clockwise while you hold; once it closes, the frame opens out to the whole screen («Рамка») and the
// dialog appears inside it. Answers come from the home server (api.hyle.space/ask, server-sent events)
// and cite pages of the books; dialogs are kept only in this browser.
// The same file runs on every Hyle subsite: a site may set window.HelperScope / window.HelperBookPage.
import { renderAnswer, sourceLink } from './ai-renderer.js';
import { consumeSSE } from './ai-sse.js';
const API = 'https://api.hyle.space';
const HOLD = 700, OPEN = 850, CLOSE = 420;
const KEY = 'hyle.ai.key', STORE = 'hyle.ai.dialogs.v1';
const still = matchMedia('(prefers-reduced-motion: reduce)');
const box = document.getElementById('searchbox'), input = document.getElementById('search'), button = document.getElementById('ai-button');
if (box && input) init();

function init() {
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v, lerp = (a, b, u) => a + (b - a) * u;
  const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2, easeOut = u => 1 - Math.pow(1 - u, 3);
  const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // ---------- the dialog
  const layer = document.createElement('div');
  layer.className = 'ai-layer'; layer.hidden = true;
  layer.innerHTML = `
    <div class="ai-veil"></div>
    <section class="ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-title">
      <header class="ai-head">
        <button class="ai-icon" type="button" data-act="close" aria-label="Назад к поиску"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="ai-title"><strong id="ai-title">Новый вопрос</strong><span id="ai-scope">ИИ по материалам Hyle</span></div>
        <button class="ai-icon" type="button" data-act="list" aria-label="Все диалоги"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/></svg></button>
        <button class="ai-icon" type="button" data-act="new" aria-label="Новый диалог"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
      </header>
      <div class="ai-filters" aria-label="Область поиска ИИ">
        <label>Источник<select id="ai-source"><option value="">Все материалы</option><option value="helper">Хелпер ФФ</option><option value="nsu-y4s1">НГУ · 4 курс, 1 семестр</option><option value="department">Кафедра</option></select></label>
        <label>Семестр<select id="ai-semester"><option value="">Все</option>${Array.from({length:8}, (_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select></label>
        <label>Предмет<input id="ai-subject" placeholder="Все предметы" aria-label="Название предмета"></label>
      </div>
      <div class="ai-messages" id="ai-messages" aria-live="polite"></div>
      <form class="ai-compose" id="ai-compose">
        <textarea id="ai-input" rows="1" placeholder="Спросите о материалах Hyle" aria-label="Вопрос"></textarea>
        <button class="ai-send" type="submit" aria-label="Спросить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
      </form>
      <div class="ai-sheet" id="ai-sheet" hidden>
        <div class="ai-sheet-head"><strong>Диалоги</strong><span>Хранятся только в этом браузере</span></div>
        <div class="ai-sheet-list" id="ai-sheet-list"></div>
      </div>
    </section>
    <canvas class="ai-frame" aria-hidden="true"></canvas>`;
  document.body.append(layer);
  const dialog = layer.querySelector('.ai-dialog'), veil = layer.querySelector('.ai-veil'), frameCanvas = layer.querySelector('.ai-frame');
  const messages = layer.querySelector('#ai-messages'), compose = layer.querySelector('#ai-compose'), field = layer.querySelector('#ai-input');
  const sheet = layer.querySelector('#ai-sheet'), sheetList = layer.querySelector('#ai-sheet-list');
  const ctx = frameCanvas.getContext('2d');

  // ---------- the dot frame
  let W = 0, H = 0, dpr = 1;
  function size() { W = innerWidth; H = innerHeight; dpr = Math.min(2, devicePixelRatio || 1); frameCanvas.width = W * dpr; frameCanvas.height = H * dpr; }
  function barRect() { const b = box.getBoundingClientRect(), o = 6; return { x: b.left - o, y: b.top - o, w: b.width + 2 * o, h: b.height + 2 * o, r: 15 }; }
  const screenRect = () => ({ x: 6, y: 6, w: W - 12, h: H - 12, r: Math.min(28, W * .06) });
  const mix = (A, B, u) => ({ x: lerp(A.x, B.x, u), y: lerp(A.y, B.y, u), w: lerp(A.w, B.w, u), h: lerp(A.h, B.h, u), r: lerp(A.r, B.r, u) });
  function point(R, s) {
    const { x, y, w, h } = R, r = Math.max(0, Math.min(R.r, w / 2, h / 2)), q = Math.PI * r / 2, seg = [w - 2 * r, q, h - 2 * r, q, w - 2 * r, q, h - 2 * r, q];
    let j = 0; while (s > seg[j] && j < 7) { s -= seg[j]; j++; }
    const arc = (cx, cy, a0) => { const a = a0 + s / (r || 1); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    switch (j) {
      case 0: return [x + r + s, y]; case 1: return arc(x + w - r, y + r, -Math.PI / 2);
      case 2: return [x + w, y + r + s]; case 3: return arc(x + w - r, y + h - r, 0);
      case 4: return [x + w - r - s, y + h]; case 5: return arc(x + r, y + h - r, Math.PI / 2);
      case 6: return [x, y + h - r - s]; default: return arc(x + r, y + r, Math.PI);
    }
  }
  // fill: share of the frame lit clockwise from the top centre; off: the dots' run along the contour.
  function drawFrame(R, { fill = 1, alpha = 1, spacing = 7, off = 0 } = {}) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (alpha <= .01) return;
    const cream = cssVar('--cream') || '#ead4b7', red = cssVar('--accent') || '#d64c50';
    const r = Math.max(0, Math.min(R.r, R.w / 2, R.h / 2)), per = 2 * (R.w + R.h) - (8 - 2 * Math.PI) * r, n = Math.max(12, Math.round(per / spacing));
    for (let k = 0; k < n; k++) {
      const f = k / n; let s = (f * per + R.w / 2 - r + off) % per; if (s < 0) s += per;
      const [px, py] = point(R, s), lit = f < fill, lead = lit && f > fill - .035;
      ctx.globalAlpha = alpha * (lit ? .95 : .18); ctx.fillStyle = lead ? red : cream;
      ctx.beginPath(); ctx.arc(px, py, lit ? 1.6 : 1.1, 0, 6.283); ctx.fill();
    }
  }
  function clip(R) {
    const t = Math.max(0, R.y), l = Math.max(0, R.x), rr = Math.max(0, W - R.x - R.w), b = Math.max(0, H - R.y - R.h);
    dialog.style.clipPath = `inset(${t.toFixed(1)}px ${rr.toFixed(1)}px ${b.toFixed(1)}px ${l.toFixed(1)}px round ${R.r.toFixed(1)}px)`;
  }

  // ---------- hold → open
  let state = 'closed', progress = 0, pressed = false, downAt = 0, raf = 0, last = 0, start = null, auto = false, flow = 0, t0 = 0, pending = '';
  function loop(now) {
    const dt = Math.min(50, now - (last || now)); last = now;
    if (state === 'hold') {
      progress += (pressed || auto ? dt / (auto ? 380 : HOLD) : -dt / 260);
      if (progress >= 1) { progress = 1; open(); }
      else if (progress <= 0 && !pressed && !auto) { progress = 0; state = 'closed'; layer.hidden = true; raf = 0; return; }
      else {
        const shown = now - downAt > 110 || auto;
        veil.style.opacity = shown ? (easeOut(progress) * .55).toFixed(3) : 0;
        drawFrame(barRect(), { fill: progress, alpha: shown ? Math.min(1, progress * 5) : 0 });
      }
    }
    if (state === 'opening' || state === 'closing') {
      const opening = state === 'opening', u = clamp((now - t0) / (opening ? OPEN : CLOSE)), e = ease(u);
      const R = opening ? mix(barRect(), screenRect(), e) : mix(screenRect(), barRect(), e);
      flow += dt * .22 * (opening ? 1 - u : u);
      clip(R);
      veil.style.opacity = opening ? (.55 + .45 * e).toFixed(3) : ((1 - e)).toFixed(3);
      drawFrame(R, { alpha: opening ? 1 - clamp((u - .62) / .38) : 1 - clamp((u - .7) / .3), spacing: lerp(7, 10, opening ? e : 1 - e), off: flow });
      if (u >= 1) {
        if (opening) { state = 'open'; dialog.style.clipPath = 'none'; ctx.clearRect(0, 0, frameCanvas.width, frameCanvas.height); afterOpen(); }
        else { state = 'closed'; layer.hidden = true; document.documentElement.classList.remove('ai-open'); ctx.clearRect(0, 0, frameCanvas.width, frameCanvas.height); }
        raf = 0; return;
      }
    }
    raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } }
  function begin(isAuto) {
    if (state !== 'closed' && state !== 'hold') return;
    size(); layer.hidden = false; dialog.style.clipPath = 'inset(0 0 100% 0)'; veil.style.opacity = 0;
    if (state === 'closed') { state = 'hold'; progress = 0; }
    auto = isAuto; pressed = !isAuto; downAt = performance.now(); kick();
  }
  function open() {
    try { navigator.vibrate?.(12); } catch {}
    pending = input.value.trim(); input.blur(); pressed = false; auto = false; flow = 0;
    document.documentElement.classList.add('ai-open'); layer.classList.add('live');
    if (window.parent !== window) parent.postMessage({type:'hyle-search-ai-open'},location.origin);
    else try { history.pushState({ ...(history.state || {}), hyleAi: true }, ''); } catch {}
    prepare();
    if (still.matches) { state = 'open'; veil.style.opacity = 1; dialog.style.clipPath = 'none'; ctx.clearRect(0, 0, frameCanvas.width, frameCanvas.height); afterOpen(); return; }
    state = 'opening'; t0 = performance.now(); kick();
  }
  function close(fromHistory) {
    if (state !== 'open' && state !== 'opening') return;
    sheet.hidden = true; abort?.abort(); layer.classList.remove('live');
    if (!fromHistory && window.parent !== window) { parent.postMessage({type:'hyle-search-ai-close-request'},location.origin); return; }
    if (!fromHistory && history.state?.hyleAi) { history.back(); return; }
    size();
    if (still.matches) { state = 'closed'; layer.hidden = true; document.documentElement.classList.remove('ai-open'); return; }
    state = 'closing'; t0 = performance.now(); flow = 0; kick();
  }
  addEventListener('popstate', () => { if (window.parent === window && (state === 'open' || state === 'opening')) close(true); });
  addEventListener('message', event => {
    if(event.origin===location.origin && event.source===window.parent && event.data?.type==='hyle-search-ai-close')close(true);
  });

  // A short press only puts the caret in the field; moving the finger (scrolling) cancels the hold.
  box.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    start = { x: e.clientX, y: e.clientY }; begin(false);
  });
  const release = () => { if (state === 'hold' && !auto) pressed = false; start = null; };
  addEventListener('pointerup', release); addEventListener('pointercancel', release);
  addEventListener('pointermove', e => { if (start && state === 'hold' && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) release(); }, { passive: true });
  box.addEventListener('contextmenu', e => { if (state === 'hold' || state === 'opening') e.preventDefault(); });
  button?.addEventListener('click', e => { e.preventDefault(); begin(true); });
  layer.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!sheet.hidden) sheet.hidden = true; else close(); } });

  // ---------- dialogs, kept in this browser
  let dialogs = load(STORE, []), currentId = null, abort = null;
  const now = () => new Date().toISOString();
  const find = id => dialogs.find(d => d.id === id);
  function persist() { dialogs = dialogs.filter(d => d.messages.length).sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 60); save(STORE, dialogs); }
  const sourceFilter = layer.querySelector('#ai-source'), semesterFilter = layer.querySelector('#ai-semester'), subjectFilter = layer.querySelector('#ai-subject');
  function scopeNow() { return { site: sourceFilter.value, semester: semesterFilter.value, subject: subjectFilter.value.trim() }; }
  function prepare() {
    const scope = window.HyleAIScope?.() || {};
    if (scope.site != null) {
      if (![...sourceFilter.options].some(o => o.value === scope.site)) {
        const option = document.createElement('option'); option.value = scope.site; option.textContent = 'Выбранные источники'; sourceFilter.append(option);
      }
      sourceFilter.value = scope.site;
    }
    if (scope.semester != null) semesterFilter.value = scope.semester;
    if (scope.subject != null) subjectFilter.value = scope.subject;
    layer.querySelector('#ai-scope').textContent = 'ИИ · Helper, НГУ и кафедра';
    if (pending || !currentId || !find(currentId)) newDialog(); else renderDialog();
  }
  function afterOpen() {
    if (pending) { const q = pending; pending = ''; ask(q); }
    else if (matchMedia('(hover:hover)').matches) field.focus();
  }
  function newDialog() { currentId = null; layer.querySelector('#ai-title').textContent = 'Новый вопрос'; renderDialog(); }
  function renderDialog() {
    const d = find(currentId);
    layer.querySelector('#ai-title').textContent = d?.title || 'Новый вопрос';
    messages.replaceChildren();
    if (!d) {
      const hello = document.createElement('div'); hello.className = 'ai-empty';
      hello.innerHTML = `<p>Спросите о формуле, определении или задаче. Поиск охватывает Helper, материалы НГУ и кафедры. В ответе будут ссылки на страницы файлов или ячейки notebooks.</p><p class="ai-tip">В следующий раз можно сразу зажать строку поиска с вопросом.</p>`;
      messages.append(hello);
    } else for (const m of d.messages) messages.append(m.role === 'user' ? userBubble(m.content) : botBubble(m));
    if (!load(KEY, '')) messages.append(keyCard());
    messages.scrollTop = messages.scrollHeight;
  }
  const userBubble = text => { const b = document.createElement('div'); b.className = 'ai-me'; b.textContent = text; return b; };
  function bookLink(s, q) {
    return sourceLink(s);
  }
  function format(text, sources) {
    return renderAnswer(text, sources);
  }
  function botBubble(m) {
    const b = document.createElement('div'); b.className = 'ai-bot';
    const who = document.createElement('span'); who.className = 'ai-who'; who.innerHTML = '<img src="' + (document.querySelector('.brand img')?.getAttribute('src') || '') + '" alt="" width="14" height="14"><span>Hyle</span>';
    const body = document.createElement('div'); body.className = 'ai-text';
    if (m.error && !m.content) { body.classList.add('ai-error'); body.textContent = m.error; }
    else if (m.content) body.innerHTML = format(m.content, m.sources);
    else body.innerHTML = '<span class="ai-skel"></span><span class="ai-skel" style="width:78%"></span><span class="ai-skel" style="width:52%"></span>';
    b.append(who, body);
    if (m.content && (m.error || m.interrupted)) {
      const note = document.createElement('p'); note.className = 'ai-error'; note.textContent = m.error || 'Ответ прерван. Показана полученная часть.'; b.append(note);
    }
    const used = (m.sources || []).filter((s, i) => (m.content || '').includes('[' + (i + 1) + ']'));
    if (used.length) {
      const list = document.createElement('div'); list.className = 'ai-sources';
      for (const s of m.sources) {
        const i = m.sources.indexOf(s) + 1; if (!(m.content || '').includes('[' + i + ']')) continue;
        const href = bookLink(s); if (!href) continue;
        const a = document.createElement('a'); a.href = href; a.rel = 'noopener noreferrer'; a.innerHTML = `<b>[${i}]</b><span>${esc(s.title)}</span><em>${s.location_type === 'cell' || s.book?.endsWith('.ipynb') ? 'яч.' : s.location_type === 'line' ? 'строка' : 'стр.'} ${esc(s.page)}</em>`; list.append(a);
      }
      b.append(list);
    }
    return b;
  }
  function keyCard() {
    const card = document.createElement('form'); card.className = 'ai-key';
    card.innerHTML = `<strong>Нужен ключ доступа</strong><span>Его выдаёт владелец сайта. Ключ сохранится только в этом браузере.</span><div><input type="password" id="ai-key-input" placeholder="Ключ" autocomplete="off" aria-label="Ключ доступа"><button type="submit">Сохранить</button></div>`;
    card.addEventListener('submit', e => { e.preventDefault(); const v = card.querySelector('input').value.trim(); if (!v) return; save(KEY, v); card.remove(); if (lastFailed) { const q = lastFailed; lastFailed = ''; ask(q, true); } });
    return card;
  }
  let lastFailed = '';
  async function ask(question, retry) {
    if (abort) return;
    question = question.trim(); if (!question) return;
    let d = find(currentId);
    if (!d) { d = { id: Date.now().toString(36), title: question.slice(0, 80), updated: now(), messages: [] }; dialogs.unshift(d); currentId = d.id; }
    const history = d.messages.filter(m => !m.error && m.content).slice(-6).map(m => ({ role: m.role, content: m.content }));
    if (!retry || d.messages.at(-1)?.content !== question) d.messages.push({ role: 'user', content: question });
    const answer = { role: 'assistant', content: '', sources: [] }; d.messages.push(answer); d.updated = now();
    renderDialog();
    const bubble = messages.querySelector('.ai-bot:last-of-type'), status = document.createElement('span'); status.className = 'ai-status'; status.textContent = 'ищу в материалах…';
    bubble?.querySelector('.ai-who')?.append(status);
    const key = load(KEY, '');
    const refresh = () => { if (currentId === d.id) renderDialog(); };
    const fail = text => { answer.error = text; persist(); refresh(); };
    if (!key) { d.messages.pop(); lastFailed = question; persist(); renderDialog(); return; }
    const controller = new AbortController(); abort = controller;
    const scope = scopeNow();
    try {
      const response = await fetch(API + '/ask', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ q: question, history, ...(scope.site ? { site: scope.site } : {}), ...(scope.semester ? { semester: scope.semester } : {}), ...(scope.subject ? { subject: scope.subject } : {}) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
          save(KEY, ''); try { localStorage.removeItem(KEY); } catch {}
          d.messages = d.messages.filter(m => m !== answer); lastFailed = question; persist(); refresh();
          const hint = messages.querySelector('.ai-key span'); if (hint) hint.textContent = 'Ключ не подошёл. Проверьте его и вставьте ещё раз.';
          return;
        }
        return fail(data.error ? 'Не получилось: ' + data.error + '.' : 'Сервер ответил ' + response.status + '.');
      }
      if (!response.headers.get('Content-Type')?.includes('text/event-stream')) throw new Error('Unexpected response');
      let painted = 0, completed = false;
      const text = bubble.querySelector('.ai-text');
      await consumeSSE(response.body, (event, payload) => {
        if (event === 'status') status.textContent = payload.t || '';
        else if (event === 'sources') answer.sources = Array.isArray(payload.items) ? payload.items.slice(0, 30) : [];
        else if (event === 'delta' && typeof payload.t === 'string') {
          if (answer.content.length + payload.t.length > 150000) throw new Error('Answer too large');
          answer.content += payload.t;
          if (performance.now() - painted > 100 && currentId === d.id) {
            painted = performance.now(); text.innerHTML = format(answer.content, answer.sources); keepBottom();
          }
        } else if (event === 'error') answer.error = 'Не получилось: ' + (payload.message || payload.error || payload.t || 'ошибка сервера');
        else if (event === 'done') completed = true;
      });
      answer.interrupted = !completed && !answer.error;
      if (!answer.content && !answer.error) answer.error = 'Ответ не пришёл. Попробуйте ещё раз.';
      d.updated = now(); persist(); refresh();
    } catch (error) {
      if (error.name === 'AbortError') { answer.interrupted = true; d.updated = now(); persist(); refresh(); return; }
      fail('Домашний сервер не отвечает. Проверьте, что ноутбук включён, и попробуйте ещё раз.');
    } finally { if (abort === controller) abort = null; }
  }
  function keepBottom() { if (messages.scrollHeight - messages.scrollTop - messages.clientHeight < 160) messages.scrollTop = messages.scrollHeight; }

  compose.addEventListener('submit', e => { e.preventDefault(); if (abort) return; const q = field.value; field.value = ''; grow(); ask(q); });
  field.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); compose.requestSubmit(); } });
  const grow = () => { field.style.height = 'auto'; field.style.height = Math.min(140, field.scrollHeight) + 'px'; };
  field.addEventListener('input', grow);
  layer.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') close();
    if (act === 'new') { abort?.abort(); newDialog(); field.focus(); }
    if (act === 'list') { renderSheet(); sheet.hidden = !sheet.hidden; }
    const pick = e.target.closest('[data-dialog]');
    if (pick) { abort?.abort(); currentId = pick.dataset.dialog; sheet.hidden = true; renderDialog(); }
    const del = e.target.closest('[data-delete]');
    if (del) { dialogs = dialogs.filter(d => d.id !== del.dataset.delete); persist(); if (currentId === del.dataset.delete) newDialog(); renderSheet(); }
    if (e.target === sheet) sheet.hidden = true;
  });
  function renderSheet() {
    const when = iso => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    sheetList.innerHTML = dialogs.length ? dialogs.map(d => `<div class="ai-row${d.id === currentId ? ' current' : ''}"><button type="button" data-dialog="${esc(d.id)}"><span>${esc(d.title)}</span><small>${when(d.updated)} · ${d.messages.filter(m => m.role === 'user').length} вопр.</small></button><button type="button" class="ai-del" data-delete="${esc(d.id)}" aria-label="Удалить диалог">×</button></div>`).join('') : '<p class="ai-none">Пока нет сохранённых диалогов.</p>';
  }
  addEventListener('resize', () => { if (state !== 'closed') size(); });
}
