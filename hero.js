// The banner's living dot wave: a grid of dots whose size follows a wave that slowly runs across it,
// and red patches that drift with a noise field. The noise is seeded by the date, so every day has its
// own pattern. It redraws about 30 times a second while the banner is on screen, and with reduced
// motion it is drawn once and stays still. The banner is dark in both themes, so the colours are fixed.
const canvas = document.querySelector('.hero-art canvas');

function rng(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function valueNoise(random) {
  const size = 256, grid = new Float32Array(size * size).map(() => random()), smooth = t => t * t * (3 - 2 * t);
  const at = (i, j) => grid[(j & 255) * size + (i & 255)];
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), u = smooth(x - i), v = smooth(y - j), a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

if (canvas) {
  const ctx = canvas.getContext('2d'), today = new Date();
  const noise = valueNoise(rng(today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()));
  const field = (x, y) => noise(x, y) * .65 + noise(x * 2.1 + 17, y * 2.1 + 3) * .35;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, onScreen = true, drawnAt = -Infinity, running = false;

  const draw = time => {
    ctx.clearRect(0, 0, width, height);
    const narrow = width < 600, gap = narrow ? 11 : 13, drift = time * .00004, phase = time * .0009;
    for (let y = gap / 2; y < height; y += gap) for (let x = gap / 2; x < width; x += gap) {
      const n = field(x / 130 + drift, y / 130), wave = Math.sin(x * .017 + y * .06 + n * 5 - phase) * .5 + .5;
      const alpha = narrow ? .22 + .6 * x / width : .1 + .7 * Math.pow(x / width, 1.2);
      ctx.fillStyle = n > .73 ? 'rgba(214,76,80,.9)' : `rgba(234,212,183,${alpha.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, .5 + 2.1 * wave * wave, 0, Math.PI * 2); ctx.fill();
    }
  };
  const loop = time => {
    if (!onScreen || still.matches) { running = false; return; }
    if (time - drawnAt >= 33) { draw(time); drawnAt = time; }
    requestAnimationFrame(loop);
  };
  const start = () => { if (!running && onScreen && !still.matches) { running = true; requestAnimationFrame(loop); } };
  const resize = () => {
    const box = canvas.getBoundingClientRect(), ratio = Math.min(2, devicePixelRatio || 1);
    width = box.width; height = box.height;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(performance.now());
  };

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; start(); }).observe(canvas);
  still.addEventListener('change', () => { draw(performance.now()); start(); });
  start();
}
