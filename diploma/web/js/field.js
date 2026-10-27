// Electrostatic potential in the section across the slit, for the slide on the
// electrode potentials. NOT an IBSimu result: a 2D Laplace problem (no space
// charge, no beam) on the cross-section of the shown CAD electrodes, plane
// z = slit centre. Electrode cells are fixed potentials; the plasma side below
// the source diaphragm is at the source potential, the far end inside the cup
// at 0 V, the side edges are open (zero normal field).
//
// Laplace is linear, so the field is solved once per electrode at 1 V (others at
// 0 V) and any set of voltages is their sum: phi = Vs*phi_s + Va*phi_a + Vp*phi_p.
// The solve runs in small steps between frames (step), coarse grid first.
(function () {
'use strict';

const IBS = window.IBS = window.IBS || {};

// Electrode -> parts; the Faraday cup is the 0 V reference.
const ELECTRODES = [
  { id: 'source', parts: ['grk_walls', 'source_diaphragm'] },
  { id: 'accel', parts: ['accelerating_diaphragm', 'accelerating_shield'] },
  { id: 'suppressor', parts: ['suppressor_diaphragm'] },
];
const GROUND = ['faraday_cup'];
const STEP_MM = 0.5;                 // finest grid
const LEVELS_MM = [2, 1, STEP_MM];   // coarse -> fine, each starts from the previous one
const HALF_WIDTH_MM = 52;            // domain across the slit: the cup wall
const HEIGHT_MM = 100;               // along the beam from the source diaphragm

const VERTEX = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// Colour: potential on a fixed 0..uMax kV scale; negative potential in blue.
// Lines: every 10 kV, every 0.5 kV within ±3 kV, the 0 V line brighter.
// The domain fades out at its open sides and far end.
const FRAGMENT = `
  uniform sampler2D uBasis; uniform vec3 uV; uniform float uMax; uniform float uOpacity;
  varying vec2 vUv;
  vec3 ramp(float k) {
    vec3 c0 = vec3(0.063, 0.102, 0.141), c1 = vec3(0.231, 0.165, 0.227);
    vec3 c2 = vec3(0.659, 0.263, 0.290), c3 = vec3(0.941, 0.769, 0.604);
    return k < 0.35 ? mix(c0, c1, k / 0.35) : k < 0.7 ? mix(c1, c2, (k - 0.35) / 0.35) : mix(c2, c3, (k - 0.7) / 0.3);
  }
  float line(float v) { return 1.0 - min(abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-5), 1.0); }
  void main() {
    vec4 b = texture2D(uBasis, vUv);
    float phi = dot(b.rgb, uV);
    vec3 c = ramp(clamp(phi / uMax, 0.0, 1.0));
    c = mix(c, vec3(0.15, 0.32, 0.55), clamp(-phi / 3.0, 0.0, 1.0) * 0.7);
    // No lines where there is no field (inside the cup): phi ~ 0 everywhere there.
    float field = step(2e-4, fwidth(phi));
    float major = line(phi / 10.0) * field;
    float minor = line(phi / 0.5) * (1.0 - smoothstep(2.0, 3.0, abs(phi))) * field;
    float zero = (1.0 - min(abs(phi) / max(fwidth(phi), 1e-5) / 1.2, 1.0)) * field;
    c = mix(c, vec3(0.92, 0.83, 0.72), max(major * 0.5, minor * 0.32));
    c = mix(c, vec3(0.96, 0.95, 0.92), zero * 0.9);
    vec3 cap = mix(vec3(0.40, 0.43, 0.47), ramp(clamp(phi / uMax, 0.0, 1.0)), 0.35);
    c = mix(c, cap, smoothstep(0.3, 0.7, b.a));
    // Soft edges of the domain: the open sides, the plasma side and the far end in the cup.
    float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x) * smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
    gl_FragColor = vec4(c, uOpacity * mix(edge, 1.0, smoothstep(0.3, 0.7, b.a)));
  }`;

// Section of a mesh by the plane z = zs: segments [x1, y1, x2, y2] (assembly mm).
// Always the CAD shape in place: no morph (geometry slide), no lift.
function sectionSegments(mesh, zs) {
  const pos = mesh.geometry.userData.base || mesh.geometry.attributes.position.array, out = [];
  for (let i = 0; i < pos.length; i += 9) {
    const cut = [];
    for (let a = 0; a < 3; a++) {
      const p = i + 3 * a, q = i + 3 * ((a + 1) % 3);
      if ((pos[p + 2] - zs) * (pos[q + 2] - zs) >= 0) continue;
      const k = (zs - pos[p + 2]) / (pos[q + 2] - pos[p + 2]);
      cut.push(pos[p] + (pos[q] - pos[p]) * k, pos[p + 1] + (pos[q + 1] - pos[p + 1]) * k);
    }
    if (cut.length === 4) out.push(cut);
  }
  return out;
}

class Field {
  constructor(engine) {
    this.engine = engine;
    const slit = engine.slit('source_diaphragm');
    this.axisX = (slit.x0 + slit.x1) / 2;
    this.zSlice = (slit.z0 + slit.z1) / 2 + 1e-3;
    this.x0 = this.axisX - HALF_WIDTH_MM;
    this.y0 = engine.partBox('source_diaphragm').min.y;
    // Plates along the beam (mm from the source diaphragm), for the axis profile.
    this.spans = ['source_diaphragm', 'accelerating_diaphragm', 'suppressor_diaphragm'].map((key) => {
      const box = engine.partBox(key);
      return { key, y0: box.min.y - this.y0, y1: box.max.y - this.y0 };
    });
    this.length = HEIGHT_MM;
    this.ready = false;
    this.job = this._solve();
  }

  // Labels of grid nodes: -1 free, 0..2 electrode, 3 ground.
  _rasterize(h) {
    const nx = Math.round(2 * HALF_WIDTH_MM / h) + 1, ny = Math.round(HEIGHT_MM / h) + 1;
    const label = new Int8Array(nx * ny).fill(-1);
    // Ground first: an electrode overlapping the cup keeps its own potential.
    const groups = [{ value: 3, parts: GROUND }].concat(ELECTRODES.map((e, i) => ({ value: i, parts: e.parts })));
    for (const group of groups) {
      for (const key of group.parts) {
        const mesh = this.engine.shown(key);
        if (!mesh) continue;
        const segments = sectionSegments(mesh, this.zSlice);
        for (let j = 0; j < ny; j++) {
          const y = this.y0 + j * h + 1e-4, xs = [];
          for (const [x1, y1, x2, y2] of segments)
            if ((y1 - y) * (y2 - y) < 0) xs.push(x1 + (x2 - x1) * (y - y1) / (y2 - y1));
          xs.sort((a, b) => a - b);
          for (let k = 0; k + 1 < xs.length; k += 2) {
            const i0 = Math.max(0, Math.ceil((xs[k] - this.x0) / h)), i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - this.x0) / h));
            for (let i = i0; i <= i1; i++) label[j * nx + i] = group.value;
          }
        }
      }
    }
    return { nx, ny, h, label };
  }

  // Coarse to fine; yields between sweeps so the page keeps drawing.
  *_solve() {
    let previous = null;
    for (const h of LEVELS_MM) {
      const grid = this._rasterize(h);
      const { nx, ny, label } = grid;
      const omega = 2 / (1 + Math.sin(Math.PI / Math.max(nx, ny)));
      grid.basis = [];
      for (let b = 0; b < ELECTRODES.length; b++) {
        const u = new Float32Array(nx * ny), fixed = new Uint8Array(nx * ny);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          if (label[k] >= 0) { fixed[k] = 1; u[k] = label[k] === b ? 1 : 0; }
          else if (j === 0) { fixed[k] = 1; u[k] = b === 0 ? 1 : 0; }     // plasma side: source potential
          else if (j === ny - 1) { fixed[k] = 1; u[k] = 0; }              // inside the cup: 0 V
          else if (previous) u[k] = this._sample(previous, previous.basis[b], this.x0 + i * grid.h, this.y0 + j * grid.h);
        }
        for (let sweep = 0; sweep < 4000; sweep++) {
          let change = 0;
          for (let color = 0; color < 2; color++) {
            for (let j = 1; j < ny - 1; j++) {
              for (let i = (j + color) & 1, k = j * nx + i; i < nx; i += 2, k += 2) {
                if (fixed[k]) continue;
                const left = i > 0 ? u[k - 1] : u[k + 1], right = i < nx - 1 ? u[k + 1] : u[k - 1];
                const d = 0.25 * (left + right + u[k - nx] + u[k + nx]) - u[k];
                u[k] += omega * d;
                if (d > change) change = d; else if (-d > change) change = -d;
              }
            }
          }
          if (change < 2e-6) break;
          if (sweep % 6 === 5) yield;
        }
        grid.basis.push(u);
        yield;
      }
      previous = grid;
    }
    this.grid = previous;
  }

  // Bilinear value of a grid field at (x, y), assembly mm.
  _sample(grid, u, x, y) {
    const fx = Math.min(Math.max((x - this.x0) / grid.h, 0), grid.nx - 1.001);
    const fy = Math.min(Math.max((y - this.y0) / grid.h, 0), grid.ny - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), a = fx - i, c = fy - j, k = j * grid.nx + i;
    return (u[k] * (1 - a) + u[k + 1] * a) * (1 - c) + (u[k + grid.nx] * (1 - a) + u[k + grid.nx + 1] * a) * c;
  }

  // Closed outlines of the parts in the section plane, for 2D drawings:
  // [{ id: electrode id or 'ground', loops: [[x, y, x, y, ...], ...] }], mm from
  // (axisX, y0). Segments of the mesh section are chained end to end.
  outlines() {
    if (this._outlines) return this._outlines;
    const groups = ELECTRODES.map((e) => ({ id: e.id, parts: e.parts })).concat([{ id: 'ground', parts: GROUND }]);
    const key = (x, y) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)}`;
    this._outlines = groups.map((group) => {
      const loops = [];
      for (const part of group.parts) {
        const mesh = this.engine.shown(part);
        if (!mesh) continue;
        const segments = sectionSegments(mesh, this.zSlice), ends = new Map(), used = new Uint8Array(segments.length);
        segments.forEach((s, n) => {
          for (const k of [key(s[0], s[1]), key(s[2], s[3])]) (ends.get(k) || ends.set(k, []).get(k)).push(n);
        });
        for (let n = 0; n < segments.length; n++) {
          if (used[n]) continue;
          used[n] = 1;
          const loop = [segments[n][0], segments[n][1], segments[n][2], segments[n][3]];
          for (;;) {
            const x = loop[loop.length - 2], y = loop[loop.length - 1];
            const next = (ends.get(key(x, y)) || []).find((m) => !used[m]);
            if (next === undefined) break;
            used[next] = 1;
            const s = segments[next], forward = key(s[0], s[1]) === key(x, y);
            loop.push(forward ? s[2] : s[0], forward ? s[3] : s[1]);
          }
          if (loop.length >= 8) loops.push(loop.map((v, i) => (i % 2 ? v - this.y0 : v - this.axisX)));
        }
      }
      return { id: group.id, loops };
    });
    return this._outlines;
  }

  // Advances the solve for up to `ms` milliseconds; true once the field is ready.
  step(ms) {
    if (this.ready) return true;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      if (!this.job.next().done) continue;
      this._buildMesh();
      this.ready = true;
      break;
    }
    return this.ready;
  }

  _buildMesh() {
    const { nx, ny, h, label, basis } = this.grid;
    const data = new Float32Array(nx * ny * 4);
    for (let k = 0; k < nx * ny; k++) {
      data[4 * k] = basis[0][k]; data[4 * k + 1] = basis[1][k]; data[4 * k + 2] = basis[2][k];
      data[4 * k + 3] = label[k] >= 0 ? 1 : 0;
    }
    const texture = new THREE.DataTexture(data, nx, ny, THREE.RGBAFormat, THREE.FloatType);
    const linear = this.engine.renderer.extensions.has('OES_texture_float_linear');
    texture.minFilter = texture.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
    texture.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT,
      uniforms: { uBasis: { value: texture }, uV: { value: new THREE.Vector3() }, uMax: { value: 80 }, uOpacity: { value: 0 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      extensions: { derivatives: true },
    });
    // Texel centres on the grid nodes.
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(nx * h, ny * h), this.material);
    plane.position.set(this.x0 + (nx - 1) * h / 2, this.y0 + (ny - 1) * h / 2, this.zSlice);
    plane.visible = false;
    this.engine.assembly.add(plane);
    this.mesh = plane;
  }

  // Shows the field for voltages { source, accel, suppressor } in kV.
  show(volts, opacity) {
    if (!this.ready) return;
    this.material.uniforms.uV.value.set(volts.source, volts.accel, volts.suppressor);
    this.material.uniforms.uOpacity.value = opacity;
    this.mesh.visible = opacity > 0;
  }

  hide() { if (this.mesh) this.mesh.visible = false; }

  // Potential on the beam axis, kV: [{ y (mm from the source diaphragm), phi }].
  axis(volts) {
    const { nx, ny, h, basis } = this.grid;
    const i = Math.round((this.axisX - this.x0) / h), out = [];
    for (let j = 0; j < ny; j++) {
      const k = j * nx + i;
      out.push({ y: j * h, phi: volts.source * basis[0][k] + volts.accel * basis[1][k] + volts.suppressor * basis[2][k] });
    }
    return out;
  }
}

IBS.Field = Field;
})();
