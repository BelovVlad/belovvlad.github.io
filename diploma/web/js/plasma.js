// Schematic of the discharge inside the GRK: electrons, argon atoms, ions,
// magnetic field lines and the plasma column. It illustrates the principle
// (Farley, Rose, Ryding 2004, sec. 8.3; installation scheme), it is NOT an
// IBSimu result: paths are drawn by hand-made rules, not computed.
//
// Everything lives in the assembly frame (mm), so it turns and tilts with the
// CAD model, and is a pure function of the scene time t, like the scenes.
(function () {
'use strict';

const IBS = window.IBS = window.IBS || {};
const { clamp01, lerp } = IBS.ease;
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

// Emission slit of the original source diaphragm, measured on
// GRK/grk_diaphragm_original.stl: x 141.0..144.5 mm, z -27.5..21.5 mm.
const SLIT = { x: [141.0, 144.5], z: [-27.5, 21.5] };
const WALL_MM = 2.6;   // GRK wall thickness (Параметры разрабатываемого источника.md, 1.5)

const COLORS = {
  electron: new THREE.Color(0x8fc2f0),
  atom: new THREE.Color(0x9b958d),
  ion: new THREE.Color(0xe0575b),
  flash: new THREE.Color(0xf1ede7),
};

// Seeded random numbers: the picture is the same on every run.
function random(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const VERTEX = `
  attribute float size; attribute float alpha; attribute vec3 tint;
  uniform float uScale; varying float vAlpha; varying vec3 vTint;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vAlpha = alpha; vTint = tint;
  }`;
const FRAGMENT = `
  varying float vAlpha; varying vec3 vTint;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.32, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vTint, a);
  }`;

class Plasma {
  constructor(engine) {
    this.engine = engine;
    const cathode = engine.partBox('grk_cathode');
    const anticathode = engine.partBox('grk_anticathode');
    const walls = engine.partBox('grk_walls');
    // Discharge axis: along assembly Z through the cathode centre.
    this.axis = cathode.getCenter(new THREE.Vector3());
    this.zCathode = cathode.min.z;        // emitting face
    this.zAnti = anticathode.max.z;       // reflecting face
    this.inner = new THREE.Box3(
      new THREE.Vector3(walls.min.x + WALL_MM, walls.min.y + WALL_MM, walls.min.z + WALL_MM),
      new THREE.Vector3(walls.max.x - WALL_MM, walls.max.y, this.zCathode));
    this.slitY = walls.max.y;             // chamber side of the source diaphragm
    this.slitX = 0.5 * (SLIT.x[0] + SLIT.x[1]);

    this.group = new THREE.Group();
    this.group.visible = false;
    engine.assembly.add(this.group);
    this._buildField();
    this._buildColumn();
    this._buildParticles();
    this.fade = 0;
    this.used = false;
    this.last = null;
  }

  _buildField() {
    // Lines along the discharge axis. Field direction (polarity) of the real
    // magnet is unknown, so the lines carry no arrows.
    // The see-through walls still write depth (engine.js), so the schematic
    // inside the chamber is drawn without the depth test, on top of them.
    const material = new THREE.LineDashedMaterial({ color: 0xead4b7, dashSize: 2.4, gapSize: 1.6,
                                                    transparent: true, opacity: 0, depthWrite: false, depthTest: false });
    const z0 = this.inner.min.z - 10, z1 = this.zCathode + 26;
    this.field = new THREE.Group();
    for (const dx of [-10, 0, 10]) for (const dy of [-7, 0, 7]) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(this.axis.x + dx, this.axis.y + dy, z0),
        new THREE.Vector3(this.axis.x + dx, this.axis.y + dy, z1)]);
      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();
      this.field.add(line);
    }
    this.fieldMaterial = material;
    this.group.add(this.field);
  }

  _buildColumn() {
    const length = this.zCathode - this.zAnti;
    const geometry = new THREE.CylinderGeometry(8, 8, length, 40, 1, true);
    geometry.rotateX(Math.PI / 2);
    this.columnMaterial = new THREE.MeshBasicMaterial({ color: 0xd64c50, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    this.column = new THREE.Mesh(geometry, this.columnMaterial);
    this.column.position.set(this.axis.x, this.axis.y, 0.5 * (this.zCathode + this.zAnti));
    this.group.add(this.column);
  }

  _buildParticles() {
    const rnd = random(20260226);
    const box = this.inner;
    // Primary electrons: guiding centres near the axis, staggered start.
    this.electrons = Array.from({ length: 34 }, (_, i) => ({
      start: i * 0.17, r: 1 + 5 * rnd(), phi: 2 * Math.PI * rnd(), phase: 2 * Math.PI * rnd(),
      spread: 0.6 + 0.8 * rnd(),
    }));
    // Argon atoms: half fill the chamber, half sit in the column and get ionized.
    const atom = (inColumn) => {
      if (inColumn) {
        const r = 7 * Math.sqrt(rnd()), phi = 2 * Math.PI * rnd();
        return new THREE.Vector3(this.axis.x + r * Math.cos(phi), this.axis.y + r * Math.sin(phi),
                                 lerp(this.zAnti + 4, this.zCathode - 4, rnd()));
      }
      return new THREE.Vector3(lerp(box.min.x, box.max.x, rnd()), lerp(box.min.y, box.max.y, rnd()),
                               lerp(box.min.z, box.max.z, rnd()));
    };
    this.atoms = Array.from({ length: 46 }, (_, i) => ({
      home: atom(i % 2 === 0), ionizes: i % 2 === 0, offset: rnd(), phase: 2 * Math.PI * rnd(),
      exitX: (rnd() - 0.5) * 2.4, spreadX: (rnd() - 0.5) * 6,
    }));

    const count = this.electrons.length + 2 * this.atoms.length;
    const geometry = new THREE.BufferGeometry();
    this.position = new Float32Array(count * 3);
    this.tint = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    geometry.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    geometry.boundingSphere = new THREE.Sphere(this.axis.clone(), 400);
    this.uniforms = { uScale: { value: 1 } };
    this.points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
      transparent: true, depthWrite: false, depthTest: false }));
    this.points.renderOrder = 2;
    this.group.add(this.points);
  }

  _set(i, p, color, size, alpha) {
    this.position[3 * i] = p.x; this.position[3 * i + 1] = p.y; this.position[3 * i + 2] = p.z;
    this.tint[3 * i] = color.r; this.tint[3 * i + 1] = color.g; this.tint[3 * i + 2] = color.b;
    this.size[i] = size;
    this.alpha[i] = alpha;
  }

  // Position of an electron that has travelled `d` mm from the cathode:
  // it bounces between cathode and anticathode (triangle wave along Z) and
  // gyrates around its guiding centre. Without the field (confine = 0) it
  // drifts sideways and is lost on the walls.
  _electronAt(e, d, age, confine, out) {
    const L = this.zCathode - this.zAnti;
    const s = d % (2 * L);
    out.z = this.zCathode - (s < L ? s : 2 * L - s);
    const drift = (1 - confine) * d * 0.32 * e.spread;
    const r = e.r * lerp(1.6, 1, confine) + drift;
    const gyro = 1.3 * confine, w = age * 9 + e.phase;
    out.x = this.axis.x + r * Math.cos(e.phi) + gyro * Math.cos(w);
    out.y = this.axis.y + r * Math.sin(e.phi) + gyro * Math.sin(w);
    const lost = smooth((r - 11) / 5);
    return 1 - lost;
  }

  // p: { emit, confine, field, column, atoms, ionize, extract } (0..1 each),
  // ionizeTime / extractTime: seconds since those stages began.
  update(t, p) {
    this.used = true;
    this.last = { t, p };
    this._apply(t, p, 1);
  }

  _apply(t, p, fade) {
    this.group.visible = fade > 0.001;
    if (!this.group.visible) return;
    this.fieldMaterial.opacity = 0.55 * (p.field || 0) * fade;
    this.columnMaterial.opacity = 0.16 * (p.column || 0) * fade;
    const tmp = new THREE.Vector3();
    let i = 0;

    const PERIOD_E = 7.0, SPEED = 34;   // mm/s: slow enough to follow by eye
    for (const e of this.electrons) {
      const run = t - e.start;
      const age = ((run % PERIOD_E) + PERIOD_E) % PERIOD_E;
      const alive = run > 0 ? smooth(age / 0.4) * smooth((PERIOD_E - age) / 0.8) : 0;
      const kept = this._electronAt(e, SPEED * age, age, p.confine || 0, tmp);
      this._set(i++, tmp, COLORS.electron, 1.0, 0.95 * alive * kept * (p.emit || 0) * fade);
    }

    const PERIOD_I = 6.0;
    for (const a of this.atoms) {
      const jitter = 0.5;
      const home = tmp.set(a.home.x + jitter * Math.sin(t * 0.9 + a.phase),
                           a.home.y + jitter * Math.cos(t * 0.7 + a.phase),
                           a.home.z + jitter * Math.sin(t * 0.5 + 2 * a.phase));
      // Local time of this atom's ionization cycle; < 0: still neutral.
      const local = a.ionizes && p.ionize > 0 ? (p.ionizeTime || 0) - a.offset * PERIOD_I : -1;
      const tau = local >= 0 ? local % PERIOD_I : -1;
      const atomAlpha = 0.55 * (p.atoms || 0) * fade;
      if (tau < 0) {
        this._set(i++, home, COLORS.atom, 1.4, atomAlpha);
        this._set(i++, home, COLORS.ion, 0, 0);
        continue;
      }
      // Neutral comes back at the end of the cycle; the ionization flash is short.
      const back = smooth((tau - (PERIOD_I - 0.9)) / 0.9);
      const flash = Math.max(0, 1 - tau / 0.35);
      this._set(i++, home, flash > 0 ? COLORS.flash : COLORS.atom, 1.4 + 2.2 * flash,
                flash > 0 ? 0.9 * fade * p.ionize : atomAlpha * back);
      // Ion: drifts to the slit, then (with extraction on) leaves through it.
      const drift = smooth(tau / 1.8);
      const zSlit = Math.min(Math.max(home.z, SLIT.z[0] + 3), SLIT.z[1] - 3);
      const ion = new THREE.Vector3(lerp(home.x, this.slitX + a.exitX * 0.5, drift),
                                    lerp(home.y, this.slitY - 0.5, drift), lerp(home.z, zSlit, drift));
      const s = clamp01((tau - 1.8) / 1.6) * (p.extract || 0);
      ion.y += 95 * s * s;
      ion.x += a.spreadX * s * s;
      // Without extraction the ions are lost on the walls near the slit.
      const kept = lerp(1 - smooth((tau - 2.2) / 0.8), 1 - smooth((s - 0.85) / 0.15), p.extract || 0);
      this._set(i++, ion, COLORS.ion, 1.7, 0.95 * kept * (1 - back) * clamp01(tau / 0.15) * p.ionize * fade);
    }
    for (const name of ['position', 'tint', 'size', 'alpha']) this.points.geometry.attributes[name].needsUpdate = true;
    const engine = this.engine;
    this.uniforms.uScale.value = engine.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(engine.camera.fov / 2)));
  }

  // Called by the player every frame: a scene that stopped calling update()
  // (another slide) lets the particles fade out instead of vanishing.
  frame(dt) {
    if (this.used) this.fade = 1;
    else if (this.last) {
      this.fade = Math.max(0, this.fade - dt * 1.6);
      this.last.t += dt;
      this._apply(this.last.t, this.last.p, this.fade);
      if (this.fade === 0) this.last = null;
    }
    this.used = false;
  }
}

IBS.Plasma = Plasma;
})();
