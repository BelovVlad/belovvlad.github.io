// HTML callouts with leader lines. Labels sit in the side margins and switch
// sides when their anchor crosses the model centre, so they never cover the model.
(function () {
'use strict';

const IBS = window.IBS = window.IBS || {};
const SVG = 'http://www.w3.org/2000/svg';

class Callout {
  constructor(layer, svg, { title, subtitle, anchor, row, side }) {
    this.anchor = anchor;          // THREE.Vector3 in the assembly frame (mm)
    this.row = row;                // vertical position, fraction of the viewport height
    this.fixedSide = side || null; // 'left' | 'right' keeps the label on one side
    this.side = this.fixedSide;
    this.vis = 0;
    this.el = document.createElement('div');
    this.el.className = 'callout';
    this.el.innerHTML = `<div class="callout-title"></div><div class="callout-sub"></div>`;
    this.el.querySelector('.callout-title').textContent = title;
    this.el.querySelector('.callout-sub').textContent = subtitle || '';
    layer.appendChild(this.el);
    this.line = document.createElementNS(SVG, 'polyline');
    this.line.setAttribute('class', 'leader');
    this.dot = document.createElementNS(SVG, 'circle');
    this.dot.setAttribute('class', 'leader-dot');
    this.dot.setAttribute('r', '3.5');
    svg.append(this.line, this.dot);
  }

  update(engine, centerX, opacity, dt) {
    const p = engine.project(this.anchor);
    const wanted = this.fixedSide || (p.x < centerX ? 'left' : 'right');
    if (this.side === null || opacity < 0.01) this.side = wanted;
    const target = (wanted === this.side && !p.behind) ? 1 : 0;
    this.vis += Math.sign(target - this.vis) * Math.min(Math.abs(target - this.vis), dt * 3.5);
    if (this.vis === 0 && wanted !== this.side && Math.abs(p.x - centerX) > 12) this.side = wanted;

    const rect = engine.renderer.domElement.getBoundingClientRect();
    const margin = Math.max(24, rect.width * 0.035);
    const y = rect.height * this.row;
    this.el.classList.toggle('right', this.side === 'right');
    this.el.style.top = `${y}px`;
    this.el.style.left = this.side === 'left' ? `${margin}px` : '';
    this.el.style.right = this.side === 'right' ? `${margin}px` : '';
    const box = this.el.getBoundingClientRect();
    const edge = this.side === 'left' ? box.right - rect.left + 10 : box.left - rect.left - 10;
    const elbow = this.side === 'left' ? edge + 28 : edge - 28;
    this.line.setAttribute('points', `${edge},${y} ${elbow},${y} ${p.x},${p.y}`);
    this.dot.setAttribute('cx', p.x);
    this.dot.setAttribute('cy', p.y);
    const alpha = String(opacity * this.vis);
    this.el.style.opacity = alpha;
    this.line.style.opacity = alpha;
    this.dot.style.opacity = alpha;
  }

  remove() { this.el.remove(); this.line.remove(); this.dot.remove(); }
}

class Overlay {
  constructor(root) {
    this.layer = root.querySelector('.callouts');
    this.svg = root.querySelector('svg.leaders');
    this.callouts = [];
  }
  add(options) { const c = new Callout(this.layer, this.svg, options); this.callouts.push(c); return c; }
  clear() { this.callouts.forEach((c) => c.remove()); this.callouts = []; }
  update(engine, opacity, dt) {
    const center = engine.project(engine.assembly.worldToLocal(new THREE.Vector3()));
    this.callouts.forEach((c) => c.update(engine, center.x, opacity, dt));
  }
}

IBS.Overlay = Overlay;
})();
