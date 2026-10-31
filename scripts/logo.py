"""PweB logo: a halftone sphere — dots laid out like sunflower seeds (golden angle), so the edge is a true circle —
lit from the upper right, with a round red glint where the light hits.

Each dot's size is how much light the sphere's surface catches there, and the dots also thin out toward the rim, so the
sphere reads as a volume even small. In the glint the dots are largest and reddest at its centre and turn cream toward
its edge. Writes into assets/ (or the folder given):
  logo.svg           the mark for headers (transparent)
  logo-tile.svg      source of the "any" app icons: the sphere on a rounded dark tile
  logo-maskable.svg  source of the maskable icon: full-bleed tile, the sphere inside the 80% safe circle
  logo-launch.svg    the mark with breathing dots, for the app's launch screen
  favicon-soft.svg   source of the 16 px favicon: the same ball shaded smoothly (dots do not survive 16 px)
Then `node scripts/icons.mjs` renders the PNGs.
"""
import math, sys, io, os

CREAM, RED, BG = (234, 212, 183), (214, 76, 80), '#080d12'
GOLDEN = math.pi * (3 - math.sqrt(5))
LIGHT = (.5, -.55, .67)

def smooth(t):
    t = max(0., min(1., t)); return t * t * (3 - 2 * t)

def sphere(R=31, step=4.1, cx=50, cy=50, glint=(.38, -.42, .36), rim=.5, floor=.1, animated=False):
    n = math.sqrt(sum(v * v for v in LIGHT)); L = tuple(v / n for v in LIGHT)
    gx, gy, gr = cx + glint[0] * R, cy + glint[1] * R, glint[2] * R
    count = round(math.pi * R * R / (step * step * .9))
    out = []
    for i in range(count):
        rr, a = R * math.sqrt((i + .5) / count), i * GOLDEN
        x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
        dx, dy = (x - cx) / R, (y - cy) / R
        d = math.hypot(dx, dy)
        z = math.sqrt(max(0., 1 - d * d))
        light = max(0., dx * L[0] + dy * L[1] + z * L[2])
        r = step * .5 * (floor + (1 - floor) * light ** .9) * (.18 + .82 * smooth((1 - d) / rim))
        t = math.hypot(x - gx, y - gy) / gr
        color = CREAM
        if t < 1.25:
            red = smooth(1.15 - t)
            color = tuple(round(CREAM[c] + (RED[c] - CREAM[c]) * red) for c in range(3))
            r *= .62 + .5 * smooth(1 - t)
        if r < .22: continue
        attr = f' style="--d:{d:.2f}"' if animated else ''
        out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r:.2f}" fill="#{color[0]:02x}{color[1]:02x}{color[2]:02x}"{attr}/>')
    return ''.join(out)

GRADIENT = '<defs><radialGradient id="bg" cx=".7" cy=".78" r=".85"><stop offset="0" stop-color="#17212b"/><stop offset=".72" stop-color="#080d12"/></radialGradient></defs>'

def svg(box, body, size, extra=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}" width="{size}" height="{size}">{extra}{body}</svg>\n'

files = {
    'logo.svg': svg('17 17 66 66', sphere(), 66),
    'logo-tile.svg': svg('0 0 100 100', GRADIENT + '<rect width="100" height="100" rx="22" fill="url(#bg)"/>' + sphere(R=36, step=4.4), 512),
    'logo-maskable.svg': svg('0 0 100 100', GRADIENT + '<rect width="100" height="100" fill="url(#bg)"/>' + sphere(R=36, step=4.4), 512),
    'logo-launch.svg': svg('17 17 66 66', sphere(animated=True), 66,
        '<style>circle{transform-box:fill-box;transform-origin:center;animation:b 1.6s ease-in-out infinite;animation-delay:calc(var(--d)*-1.2s)}'
        '@keyframes b{50%{transform:scale(.55)}}@media(prefers-reduced-motion:reduce){circle{animation:none}}</style>'),
    'favicon-soft.svg': svg('0 0 100 100',
        '<defs><radialGradient id="b" cx=".64" cy=".34" r=".78"><stop offset="0" stop-color="#f4e6d2"/><stop offset=".38" stop-color="#d9c2a3"/>'
        '<stop offset=".78" stop-color="#7a6a58"/><stop offset="1" stop-color="#2a2622"/></radialGradient>'
        '<radialGradient id="g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e2565a"/><stop offset=".55" stop-color="#d64c50" stop-opacity=".85"/>'
        '<stop offset="1" stop-color="#d64c50" stop-opacity="0"/></radialGradient></defs>'
        '<rect width="100" height="100" rx="22" fill="#080d12"/><circle cx="50" cy="50" r="38" fill="url(#b)"/><circle cx="64" cy="35" r="15" fill="url(#g)"/>', 100),
}

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
os.makedirs(out, exist_ok=True)
for name, text in files.items():
    io.open(os.path.join(out, name), 'w', encoding='utf-8', newline='\n').write(text)
print('ok')
