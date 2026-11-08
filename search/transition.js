// Shared-element search transition for the same-origin Hyle search iframe.
// The iframe and its catalog loading run independently of the animation.
export function createSearchTransition({ box, input, getOverlay, getFrame }) {
  const DURATION = 520;
  const EASING = 'cubic-bezier(.22, 1, .36, 1)';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let ghost = null;
  let operations = [];
  let generation = 0;

  function cancel() {
    generation++;
    for (const animation of operations) animation.cancel();
    operations = [];
    ghost?.remove();
    ghost = null;
  }

  function rectInOverlay(rect) {
    const host = getOverlay().getBoundingClientRect();
    return { left: rect.left - host.left, top: rect.top - host.top,
      width: rect.width, height: rect.height };
  }

  function sourceRect() {
    return rectInOverlay(box.getBoundingClientRect());
  }

  function destinationRect() {
    const frame = getFrame();
    try {
      // The frame is same-origin (/search/), so actual element geometry is available.
      const field = frame.contentDocument?.querySelector('.search-field');
      if (!field) return null;
      const rect = field.getBoundingClientRect();
      const outer = frame.getBoundingClientRect();
      return rectInOverlay({ left: outer.left + rect.left, top: outer.top + rect.top,
        width: rect.width, height: rect.height });
    } catch {
      return null; // Fallback: show the page directly if access is restricted.
    }
  }

  function position(element, rect) {
    element.style.left = rect.left + 'px';
    element.style.top = rect.top + 'px';
    element.style.width = rect.width + 'px';
    element.style.height = rect.height + 'px';
  }

  function makeGhost(rect, value, large = false) {
    const overlay = getOverlay();
    ghost = box.cloneNode(true);
    ghost.removeAttribute('for');
    ghost.removeAttribute('role');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    ghost.querySelectorAll('button,input').forEach(element => {
      element.tabIndex = -1;
      if (element instanceof HTMLInputElement) element.readOnly = true;
    });
    ghost.style.cssText = 'position:absolute;z-index:10;pointer-events:none;box-sizing:border-box;margin:0;min-width:0;max-width:none;transform:none;';
    position(ghost, rect);
    const field = ghost.querySelector('input');
    if (field) {
      field.value = value;
      field.style.fontSize = large ? '21px' : '14px';
    }
    const kbd = ghost.querySelector('kbd');
    if (kbd) kbd.style.opacity = large ? '0' : '1';
    overlay.append(ghost);
    return ghost;
  }

  function track(animation) {
    operations.push(animation);
    return animation;
  }

  function move(from, to, backwards) {
    const animation = track(ghost.animate([
      { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' },
      { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px' }
    ], { duration: DURATION, easing: EASING, fill: 'forwards' }));
    const field = ghost.querySelector('input');
    if (field) track(field.animate([
      { fontSize: backwards ? '21px' : '14px' },
      { fontSize: backwards ? '14px' : '21px' }
    ], { duration: DURATION, easing: EASING, fill: 'forwards' }));
    const kbd = ghost.querySelector('kbd');
    if (kbd) track(kbd.animate([
      { opacity: backwards ? 0 : 1 },
      { opacity: backwards ? 1 : 0 }
    ], { duration: DURATION * .8, easing: 'ease', fill: 'forwards' }));
    return animation.finished.catch(() => {});
  }

  function begin(value) {
    cancel();
    const frame = getFrame();
    const overlay = getOverlay();
    overlay.style.backgroundColor = '#080d12';
    frame.style.opacity = '0';
    frame.style.visibility = 'hidden';
    if (!reduceMotion.matches) makeGhost(sourceRect(), value);
  }

  async function reveal() {
    const frame = getFrame();
    const token = generation;
    const to = destinationRect();
    if (!ghost || !to || reduceMotion.matches) {
      ghost?.remove(); ghost = null;
      frame.style.visibility = 'visible';
      frame.style.opacity = '1';
      return;
    }
    const from = sourceRect();
    frame.style.visibility = 'visible';
    frame.style.opacity = '0';
    const moving = move(from, to, false);
    track(frame.animate([
      { opacity: 0, offset: 0 }, { opacity: 0, offset: .55 }, { opacity: 1, offset: 1 }
    ], { duration: DURATION, easing: 'linear', fill: 'forwards' }));
    await moving;
    if (generation !== token) return;
    frame.style.opacity = '1';
    ghost?.remove(); ghost = null;
  }

  async function dismiss(value, done) {
    cancel();
    const token = generation;
    const overlay = getOverlay();
    const frame = getFrame();
    const from = destinationRect();
    const to = sourceRect();
    if (!from || reduceMotion.matches) {
      frame.style.opacity = '1';
      frame.style.visibility = 'hidden';
      overlay.style.backgroundColor = '#080d12';
      done();
      return;
    }
    makeGhost(from, value, true);
    const moving = move(from, to, true);
    track(frame.animate([
      { opacity: 1, offset: 0 }, { opacity: 0, offset: .4 }, { opacity: 0, offset: 1 }
    ], { duration: DURATION, easing: 'linear', fill: 'forwards' }));
    track(overlay.animate([
      { backgroundColor: '#080d12' }, { backgroundColor: 'rgba(8,13,18,0)' }
    ], { duration: DURATION, easing: 'ease', fill: 'forwards' }));
    await moving;
    if (generation !== token) return;
    cancel();
    frame.style.opacity = '1';
    frame.style.visibility = 'hidden';
    overlay.style.backgroundColor = '#080d12';
    done();
  }

  return { begin, reveal, dismiss, cancel };
}
