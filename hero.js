// The banner's living dots: the wave chosen in the settings (dots.js — the same waves, grid, speed and clock as the
// patches on every Hyle site) over a grid whose dots brighten to the right, behind the text. The lens follows the
// pointer over the banner and wanders on its own otherwise. It redraws about 30 times a second while the banner is
// on screen; with reduced motion or with the dots switched off in the settings it is drawn once and stays still.
// The banner is dark in both themes, so the colours are fixed.
const canvas = document.querySelector('.hero-art canvas');
const dots = window.PwebDots;

if (canvas && dots) {
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0, y: 0, on: false }, auto = { x: 0, y: 0, on: true };
  let width = 0, height = 0, onScreen = true, drawnAt = -Infinity, running = false;

  const draw = time => {
    ctx.clearRect(0, 0, width, height);
    const { settings } = dots, wave = dots.wave(settings.wave), scale = settings.gap / 13;
    const narrow = width < 600, gap = (narrow ? 11 : 13) * scale;
    auto.x = width * (.62 + .22 * Math.cos(time * .0005)); auto.y = height * (.5 + .32 * Math.sin(time * .0008));
    const lens = pointer.on ? pointer : auto;
    lens.gap = gap;
    for (let y = gap / 2; y < height; y += gap) for (let x = gap / 2; x < width; x += gap) {
      const d = wave.at(x, y, time, lens), s = Math.max(0, Math.min(1, d.s));
      const base = narrow ? .22 + .6 * x / width : .1 + .7 * Math.pow(x / width, 1.2);
      ctx.fillStyle = d.red ? 'rgba(214,76,80,.9)' : `rgba(234,212,183,${Math.min(1, base * (d.a ?? 1)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x + (d.dx || 0), y + (d.dy || 0), (.5 + 2.1 * s) * scale, 0, Math.PI * 2); ctx.fill();
    }
  };
  const moving = () => onScreen && !still.matches && dots.settings.show !== 'off';
  const loop = now => {
    if (!moving()) { running = false; return; }
    if (now - drawnAt >= 33) { draw(dots.clock()); drawnAt = now; }
    requestAnimationFrame(loop);
  };
  const start = () => { if (!running && moving()) { running = true; requestAnimationFrame(loop); } };
  const resize = () => {
    const box = canvas.getBoundingClientRect(), ratio = Math.min(2, devicePixelRatio || 1);
    width = box.width; height = box.height;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(dots.clock());
  };
  const banner = canvas.closest('.hero-art')?.parentElement || canvas;
  banner.addEventListener('pointermove', event => {
    const box = canvas.getBoundingClientRect();
    pointer.x = event.clientX - box.left; pointer.y = event.clientY - box.top; pointer.on = event.pointerType === 'mouse';
  });
  banner.addEventListener('pointerleave', () => { pointer.on = false; });

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; start(); }).observe(canvas);
  still.addEventListener('change', () => { draw(dots.clock()); start(); });
  dots.onChange(() => { draw(dots.clock()); start(); });
  start();
}
