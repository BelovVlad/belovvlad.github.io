// Keep Hyle documents inside the search surface instead of opening an Android custom tab.
// The search DOM, filters, scroll position and loaded results remain mounted behind the reader.
const READER_PATH = /^\/(?:(?:Helper_PF_NSU|Department)\/viewer|NSU_FP_Y4_S1\/docs)\/(?:pdfjs\/viewer|notebook\/(?:viewer|code))\.html$/;
const READER_ORIGINS = new Set(['https://hyle-space.github.io', 'https://hyle.space']);
const HISTORY_KEY = 'hyleSearchReader';

function readerUrl(href) {
  let url;
  try { url = new URL(href, location.href); } catch { return null; }
  return READER_ORIGINS.has(url.origin) && READER_PATH.test(url.pathname) && url.searchParams.has('file') ? url : null;
}

export function installReaderNavigation() {
  const overlay = document.createElement('section');
  overlay.className = 'hyle-reader-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Просмотр документа Hyle');
  overlay.hidden = true;

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'hyle-reader-back';
  back.textContent = '← К поиску';
  back.setAttribute('aria-label', 'Вернуться к результатам поиска');

  const original = document.createElement('a');
  original.className = 'hyle-reader-original';
  original.target = '_blank';
  original.rel = 'noopener noreferrer';
  original.textContent = '↗';
  original.title = 'Открыть документ отдельно';
  original.setAttribute('aria-label', 'Открыть документ отдельно');

  overlay.append(back, original);
  document.body.append(overlay);

  let frame = null;
  let activeUrl = '';
  let previousFocus = null;
  let previousOverflow = '';
  let closeRequested = false;
  let closeTimeout = 0;

  function resetCloseRequest() {
    clearTimeout(closeTimeout);
    closeRequested = false;
    back.textContent = '← К поиску';
    back.title = '';
  }

  function show(url) {
    if (!overlay.hidden && activeUrl === url.href) return;
    if (overlay.hidden) {
      previousFocus = document.activeElement;
      previousOverflow = document.documentElement.style.overflow;
    }
    frame?.remove();
    resetCloseRequest();
    activeUrl = url.href;
    overlay.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    // PDF.js already has its own back arrow and scroll-aware toolbar.
    // Do not add an overlapping search button or enable its reduced embed chrome.
    const isPdf = url.pathname.includes('/pdfjs/viewer.html');
    overlay.classList.toggle('hyle-reader-pdf', isPdf);
    original.href = url.href;
    frame = document.createElement('iframe');
    frame.className = 'hyle-reader-frame';
    frame.title = 'Документ: ' + (url.searchParams.get('title') || 'Hyle');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    // Normal PDF reader mode restores its existing arrow and auto-hide-on-scroll behavior.
    if (isPdf) url.searchParams.delete('embed');
    frame.src = url.href;
    overlay.prepend(frame);
    if (!isPdf) back.focus({ preventScroll: true });
  }

  function hide() {
    if (overlay.hidden) return;
    resetCloseRequest();
    overlay.hidden = true;
    frame?.remove();
    frame = null;
    activeUrl = '';
    document.documentElement.style.overflow = previousOverflow;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }

  function goBack() {
    if (history.state?.[HISTORY_KEY]) history.back();
    else hide();
  }

  function requestClose() {
    if (overlay.hidden) return;
    // The PDF reader flushes annotations before acknowledging the close request.
    if (frame && activeUrl.includes('/pdfjs/') && closeRequested !== true) {
      if (closeRequested === 'retry') { goBack(); return; }
      closeRequested = true;
      back.textContent = 'Сохраняю…';
      frame.contentWindow?.postMessage({ type: 'hyle-reader-request-close' }, new URL(activeUrl).origin);
      closeTimeout = setTimeout(() => {
        if (closeRequested !== true) return;
        closeRequested = 'retry';
        back.textContent = '← К поиску';
        back.title = 'Просмотрщик не ответил. Нажмите ещё раз для возврата.';
      }, 2200);
      return;
    }
    goBack();
  }

  back.addEventListener('click', requestClose);

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('.results a[href]');
    if (!link) return;
    const url = readerUrl(link.href);
    if (!url) return; // Sites, locked files and external links keep their normal behavior.
    event.preventDefault();
    event.stopPropagation();
    document.activeElement?.blur();
    history.pushState({ ...history.state, [HISTORY_KEY]: url.href }, '', location.href);
    show(url);
  }, true);

  window.addEventListener('popstate', () => {
    const url = readerUrl(history.state?.[HISTORY_KEY] || '');
    if (url) show(url);
    else hide();
  });

  window.addEventListener('message', event => {
    if (overlay.hidden || !frame || event.source !== frame.contentWindow || !READER_ORIGINS.has(event.origin)) return;
    if (event.data?.type === 'nsu-close-pdf' || event.data?.type === 'hyle-reader-close') goBack();
  });

  window.addEventListener('keydown', event => {
    if (overlay.hidden || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    requestClose();
  }, true);

  const restored = readerUrl(history.state?.[HISTORY_KEY] || '');
  if (restored) show(restored);
}
