// Rendering engine shared by the Jupyter view and the standalone HTML deck.
// Geometry comes from data/geometry.js (presentation/build_scene_data.py):
// millimetres in the IBSimu assembly frame, beam along +Y.
(function () {
'use strict';

const IBS = window.IBS = window.IBS || {};

// Display-only orientation: beam (+Y of the assembly) runs horizontally along
// world +X, assembly Z stays horizontal, assembly X becomes vertical. All parts
// share this single transform, so relative placement stays exactly as in IBSimu.
const DISPLAY_ROTATION = new THREE.Euler(0, 0, -Math.PI / 2);

// Edges are dark on solid parts and turn cream on see-through (ghost) parts.
const EDGE_SOLID = new THREE.Color(0x080d12);
const EDGE_GHOST = new THREE.Color(0xead4b7);
// A see-through part writes depth only while it still looks almost solid. A faint
// ghost that writes depth hides whatever is drawn after it (the suppressor inside
// the Faraday cup), and the draw order changes as the model turns: the parts behind
// it blink. Faint ghosts are drawn last, over everything that writes depth.
const DEPTH_ALPHA = 0.85;

const MATERIALS = {
  ion_source_body:        { color: 0x8c939b, roughness: 0.44 },
  source_diaphragm:       { color: 0xaeb3b9, roughness: 0.32 },
  accelerating_diaphragm: { color: 0xb3b7bd, roughness: 0.30 },
  suppressor_diaphragm:   { color: 0xa9aeb5, roughness: 0.34 },
  faraday_cup:            { color: 0x8a9098, roughness: 0.40 },
};

function decodeBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function decodePart(part) {
  const q = new Uint16Array(decodeBase64(part.position));
  const position = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) {
    const axis = i % 3;
    position[i] = part.min[axis] + (q[i] / 65535) * (part.max[axis] - part.min[axis]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(decodeBase64(part.normal)), 3, true));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Slit of a plate (beam along assembly Y): the opening around the plate centre,
// found by rays in the plate plane in a few sections across the thickness; the
// narrowest section counts (the throat, not the chamfer). Assembly mm.
function measureSlit(geometry) {
  const pos = geometry.attributes.position.array, box = geometry.boundingBox;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const reach = [Infinity, Infinity, Infinity, Infinity];   // +x, -x, +z, -z
  for (const f of [0.15, 0.3, 0.5, 0.7, 0.85]) {
    const y = box.min.y + (box.max.y - box.min.y) * f + 1e-4;
    const hit = [Infinity, Infinity, Infinity, Infinity];
    for (let i = 0; i < pos.length; i += 9) {
      const cut = [];
      for (let a = 0; a < 3; a++) {
        const p = i + 3 * a, q = i + 3 * ((a + 1) % 3);
        if ((pos[p + 1] - y) * (pos[q + 1] - y) >= 0) continue;
        const k = (y - pos[p + 1]) / (pos[q + 1] - pos[p + 1]);
        cut.push(pos[p] + (pos[q] - pos[p]) * k, pos[p + 2] + (pos[q + 2] - pos[p + 2]) * k);
      }
      if (cut.length !== 4) continue;
      const [x1, z1, x2, z2] = cut;
      if ((z1 - cz) * (z2 - cz) < 0) {
        const d = x1 + (x2 - x1) * (cz - z1) / (z2 - z1) - cx;
        if (d > 0) hit[0] = Math.min(hit[0], d); else hit[1] = Math.min(hit[1], -d);
      }
      if ((x1 - cx) * (x2 - cx) < 0) {
        const d = z1 + (z2 - z1) * (cx - x1) / (x2 - x1) - cz;
        if (d > 0) hit[2] = Math.min(hit[2], d); else hit[3] = Math.min(hit[3], -d);
      }
    }
    for (let i = 0; i < 4; i++) reach[i] = Math.min(reach[i], hit[i]);
  }
  return { x0: cx - reach[1], x1: cx + reach[0], z0: cz - reach[3], z1: cz + reach[2], y0: box.min.y, y1: box.max.y };
}

// Piecewise-linear map that moves the slit edges a, b to a2, b2 and leaves
// everything farther than `band` mm from the slit in place.
function stretch(v, a, b, a2, b2, band) {
  if (v <= a - band || v >= b + band) return v;
  if (v < a) return a - band + (v - a + band) * (a2 - a + band) / band;
  if (v <= b) return a2 + (v - a) * (b2 - a2) / (b - a);
  return b2 + (v - b) * (b + band - b2) / band;
}

// Weight 1 inside [a, b], falling to 0 over `fall` mm outside.
function reachWeight(v, a, b, fall) {
  const out = Math.max(a - v, v - b, 0) / fall;
  return out >= 1 ? 0 : 1 - out * out * (3 - 2 * out);
}

// Moves the vertices of a plate and of its edge lines (from saved copies).
// m: { width, length } slit factors, { offset } mm across the slit, { thickness }
// factor with the face towards the source kept in place. Only the plate plane is
// stretched, so the flat faces stay flat. Illustration, not a CAD rebuild.
function morphMesh(mesh, m) {
  const slit = mesh.userData.slit = mesh.userData.slit || measureSlit(mesh.geometry);
  for (const geometry of [mesh.geometry, mesh.userData.edges.geometry]) {
    const attribute = geometry.attributes.position, pos = attribute.array;
    if (!m) {
      if (geometry.userData.base) { pos.set(geometry.userData.base); delete geometry.userData.base; attribute.needsUpdate = true; }
      continue;
    }
    const base = geometry.userData.base = geometry.userData.base || pos.slice();
    const { x0, x1, z0, z1, y0 } = slit;
    const xc = (x0 + x1) / 2, zc = (z0 + z1) / 2;
    const hw = (x1 - x0) / 2 * (m.width ?? 1), hl = (z1 - z0) / 2 * (m.length ?? 1), shift = m.offset ?? 0;
    const bandX = Math.max(6, x1 - x0), bandZ = 10, fall = 4;
    const thick = m.thickness ?? 1;
    for (let i = 0; i < pos.length; i += 3) {
      const x = base[i], y = base[i + 1], z = base[i + 2];
      const wx = reachWeight(z, Math.min(z0, zc - hl), Math.max(z1, zc + hl), fall);
      const wz = reachWeight(x, Math.min(x0, xc - hw + shift), Math.max(x1, xc + hw + shift), fall);
      pos[i] = x + wx * (stretch(x, x0, x1, xc - hw + shift, xc + hw + shift, bandX) - x);
      pos[i + 1] = y0 + (y - y0) * thick;
      pos[i + 2] = z + wz * (stretch(z, z0, z1, zc - hl, zc + hl, bandZ) - z);
    }
    attribute.needsUpdate = true;
  }
}

// Studio environment for metallic reflections, built in code (no HDR files needed offline).
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vDir; void main(){ float h = vDir.y*0.5+0.5; vec3 c = mix(vec3(0.015,0.017,0.02), vec3(0.11,0.12,0.135), smoothstep(0.2,1.0,h)); gl_FragColor = vec4(c,1.0); }',
    })
  );
  env.add(shell);
  const softbox = (w, h, intensity, position, tint) => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(tint || 0xffffff).multiplyScalar(intensity), side: THREE.DoubleSide });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    panel.position.copy(position);
    panel.lookAt(0, 0, 0);
    env.add(panel);
  };
  softbox(40, 12, 2.2, new THREE.Vector3(0, 30, 10));
  softbox(10, 30, 1.2, new THREE.Vector3(-35, 6, 18), 0xdfe8ff);
  softbox(10, 24, 1.1, new THREE.Vector3(32, 4, -20), 0xfff1e0);
  softbox(30, 4, 0.6, new THREE.Vector3(0, -6, -40));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  return texture;
}

function groundGrid(size) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      extensions: { derivatives: true },
      uniforms: { uOpacity: { value: 1 }, uFade: { value: new THREE.Vector2(120, 420) } },
      vertexShader: 'varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: [
        'uniform float uOpacity; uniform vec2 uFade; varying vec3 vWorld;',
        'float lines(vec2 p, float step){ vec2 g = abs(fract(p/step - 0.5) - 0.5) / fwidth(p/step); return 1.0 - min(min(g.x,g.y),1.0); }',
        'void main(){',
        '  float minor = lines(vWorld.xz, 10.0) * 0.35;',
        '  float major = lines(vWorld.xz, 50.0);',
        '  float fade = 1.0 - smoothstep(uFade.x, uFade.y, length(vWorld.xz));',
        '  float a = max(minor, major * 0.75) * fade * uOpacity * 0.22;',
        '  gl_FragColor = vec4(vec3(0.55,0.66,0.78), a);',
        '}',
      ].join('\n'),
    })
  );
}

class Engine {
  constructor(container, data) {
    this.container = container;
    this.data = data;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;   // wipe from an original part to its own variant
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.environment = studioEnvironment(this.renderer);
    // Near plane 10 mm (camera stays > 80 mm away): depth precision for the 0.05 mm
    // gaps between nested parts, so their faces do not fight.
    this.camera = new THREE.PerspectiveCamera(28, 1, 10, 5000);
    this.target = new THREE.Vector3();

    this._buildLights();
    this._buildModel();
    this._buildGround();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _buildLights() {
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-180, 420, 260);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.6;
    key.shadow.radius = 6;
    Object.assign(key.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 50, far: 1200 });
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xe6cfb4, 0.7);
    rim.position.set(260, 120, -320);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xb9aa98, 0x080d12, 0.25));
    this.keyLight = key;
  }

  _buildModel() {
    const d = this.data;
    const lo = new THREE.Vector3().fromArray(d.assembly_bbox_mm.min);
    const hi = new THREE.Vector3().fromArray(d.assembly_bbox_mm.max);
    this.assemblyCenter = lo.clone().add(hi).multiplyScalar(0.5);

    // turntable (world Y) -> display orientation -> assembly frame (mm, IBSimu)
    this.turntable = new THREE.Group();
    this.display = new THREE.Group();
    this.display.rotation.copy(DISPLAY_ROTATION);
    this.assembly = new THREE.Group();
    this.assembly.position.copy(this.assemblyCenter).negate();
    this.display.add(this.assembly);
    this.turntable.add(this.display);
    this.scene.add(this.turntable);

    this.parts = {};
    this.groups = {};
    this.own = {};   // own electrode variants (data/geometry.own.js), keyed by original part key
    this.extras = {};   // parts outside the IBSimu model (heater filament); hidden unless a scene shows them
    const ownParts = (window.IBS_GEOMETRY_OWN || {}).parts || [];
    for (const part of d.parts.concat(ownParts)) {
      const isOwn = ownParts.includes(part);
      const geometry = decodePart(part);
      const look = MATERIALS[part.group] || MATERIALS.ion_source_body;
      const material = new THREE.MeshStandardMaterial({
        color: look.color, metalness: 1.0, roughness: look.roughness,
        envMapIntensity: 1.0, side: THREE.DoubleSide, shadowSide: THREE.BackSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = isOwn ? part.key + ':own' : part.key;
      mesh.userData.part = part;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 32),
        new THREE.LineBasicMaterial({ color: EDGE_SOLID, transparent: true, opacity: 0.38 }));
      mesh.add(edges);
      mesh.userData.edges = edges;
      mesh.userData.opacity = mesh.userData.target = 1;
      mesh.userData.lift = 0;
      this.assembly.add(mesh);
      if (isOwn) { this.own[part.key] = mesh; this._setMeshOpacity(mesh, 0); continue; }
      if (part.extra) { this.extras[part.key] = mesh; this._setMeshOpacity(mesh, 0); continue; }
      this.parts[part.key] = mesh;
      (this.groups[part.group] = this.groups[part.group] || []).push(mesh);
    }

    // Model bounds in world space (turntable rotation does not change the height).
    this.turntable.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.display);
    this.worldBox = box;
    this.radius = box.getBoundingSphere(new THREE.Sphere()).radius;
  }

  _buildGround() {
    const y = this.worldBox.min.y - 6;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.ShadowMaterial({ opacity: 0.6 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = y;
    shadow.receiveShadow = true;
    const grid = groundGrid(1200);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = y - 0.05;
    this.ground = { shadow, grid, y, base: y };
    this.scene.add(grid, shadow);
  }

  // Every scene starts from the same look: horizontal beam, all parts solid.
  reset() {
    this.setBeamTilt(0);
    this.turntable.rotation.set(0, 0, 0);
    for (const key in this.parts) this.setOpacity(key, 1);
    for (const key in this.own) this.setOwnOpacity(key, 0);
    for (const key in this.parts) this.setLift(key, 0);
    for (const key in this.own) this.setSwap(key, null);
    for (const key in this.parts) this.setMorph(key, null);
    this.setSection(null);
    for (const key in this.extras) this.setExtraOpacity(key, 0);
    for (const mesh of this.meshes()) this._setGlow(mesh, 0, 0);
    this.ground.grid.material.uniforms.uOpacity.value = 1;
    this.ground.shadow.material.opacity = 0.6;
  }

  // Beam direction on screen: 0 = horizontal (scene 1), 1 = vertical, pointing up.
  // The ground follows the lowest corner of the assembly box.
  setBeamTilt(k) {
    this.tilt = k;
    this._applyTilt(k);
  }

  _applyTilt(k) {
    this.tiltShown = k;
    this.display.rotation.set(0, 0, DISPLAY_ROTATION.z * (1 - k));
    this.turntable.updateMatrixWorld(true);
    const lo = new THREE.Vector3().fromArray(this.data.assembly_bbox_mm.min);
    const hi = new THREE.Vector3().fromArray(this.data.assembly_bbox_mm.max);
    let bottom = Infinity;
    for (let i = 0; i < 8; i++) {
      const corner = new THREE.Vector3(i & 1 ? hi.x : lo.x, i & 2 ? hi.y : lo.y, i & 4 ? hi.z : lo.z);
      bottom = Math.min(bottom, this.assembly.localToWorld(corner).y);
    }
    const y = Math.min(bottom - 6, this.ground.base);
    this.ground.shadow.position.y = y;
    this.ground.grid.position.y = y - 0.05;
  }

  // Part opacity: below 1 the part becomes a see-through ghost without shadows, 0 hides it.
  setOpacity(key, alpha) { if (this.parts[key]) this._setMeshOpacity(this.parts[key], alpha); }
  setOwnOpacity(key, alpha) { if (this.own[key]) this._setMeshOpacity(this.own[key], alpha); }
  setExtraOpacity(key, alpha) { if (this.extras[key]) this._setMeshOpacity(this.extras[key], alpha); }

  // Glow of a part (and its own variant), k = 0..1: marks the part being explained.
  setHighlight(key, k, color = 0xd64c50) {
    for (const mesh of [this.parts[key], this.own[key], this.extras[key]]) if (mesh) this._setGlow(mesh, k, color);
  }

  _setGlow(mesh, k, color) {
    const glow = mesh.userData.glow = mesh.userData.glow || new THREE.Color();
    glow.set(color).multiplyScalar(k);
    mesh.material.emissive.copy(glow);
  }

  _setMeshOpacity(mesh, alpha) {
    mesh.userData.target = alpha;
    this._applyOpacity(mesh, alpha);
  }

  _applyOpacity(mesh, alpha) {
    if (mesh.userData.opacity === alpha) return;
    mesh.visible = alpha > 0;
    const ghost = alpha < 1, material = mesh.material;
    if (material.transparent !== ghost) material.needsUpdate = true;
    material.transparent = ghost;
    // Depth stays on while the part is nearly solid, so it does not show its own
    // inner and back faces: going from 1 to 0.99 looks the same. The shadow stays
    // for the same reason.
    material.depthWrite = alpha >= DEPTH_ALPHA;
    mesh.renderOrder = mesh.userData.edges.renderOrder = material.depthWrite ? 0 : 1;
    material.opacity = alpha;
    const edges = mesh.userData.edges.material;
    edges.depthWrite = material.depthWrite;
    edges.color.copy(EDGE_SOLID).lerp(EDGE_GHOST, Math.min((1 - alpha) * 1.5, 1));
    edges.opacity = 0.12 + 0.26 * alpha;
    mesh.userData.opacity = alpha;
  }

  // Every mesh, original and own: used to carry a look from one scene into the next.
  meshes() { return Object.values(this.parts).concat(Object.values(this.own), Object.values(this.extras)); }

  // What is on screen now (opacity, lift, beam tilt), to blend scenes.
  look() {
    return { tilt: this.tiltShown, meshes: new Map(this.meshes().map((m) => [m,
      { opacity: m.userData.opacity, lift: m.position.y, emissive: m.material.emissive.clone() }])) };
  }

  // Show a mix of a previous look (k = 0) and the values the scene asked for (k = 1).
  blendLook(from, k) {
    this._applyTilt(from.tilt + (this.tilt - from.tilt) * k);
    for (const [mesh, old] of from.meshes) {
      this._applyOpacity(mesh, old.opacity + (mesh.userData.target - old.opacity) * k);
      mesh.position.y = old.lift + (mesh.userData.lift - old.lift) * k;
      mesh.material.emissive.lerpColors(old.emissive, mesh.userData.glow, k);
    }
  }

  // Wipe from the original part to its own variant: a plane sweeps across the
  // plate (assembly X), the original stays on one side, the own part on the other.
  // s = 0: only the original, 1: only the own part; null removes the cut.
  setSwap(key, s) {
    const original = this.parts[key], own = this.own[key];
    if (!original || !own) return;
    if (s === null) {
      for (const mesh of [original, own]) this._clip(mesh, null);
      return;
    }
    const box = this.partBox(key);
    const x = box.min.x - 1 + (box.max.x - box.min.x + 2) * s;
    this.turntable.updateMatrixWorld(true);
    const normal = new THREE.Vector3(1, 0, 0).applyQuaternion(this.assembly.getWorldQuaternion(new THREE.Quaternion()));
    const point = this.assembly.localToWorld(new THREE.Vector3(x, 0, 0));
    this._clip(original, new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point));
    this._clip(own, new THREE.Plane().setFromNormalAndCoplanarPoint(normal.clone().negate(), point));
  }

  _clip(mesh, plane) {
    const planes = plane ? [plane] : null;
    for (const material of [mesh.material, mesh.userData.edges.material]) {
      if (!!material.clippingPlanes !== !!planes) material.needsUpdate = true;
      material.clippingPlanes = planes;
      material.clipShadows = true;
    }
  }

  // Illustrative change of a plate (and its own variant), see morphMesh; null restores it.
  setMorph(key, m) {
    for (const mesh of [this.parts[key], this.own[key]]) if (mesh && (m || mesh.geometry.userData.base)) morphMesh(mesh, m);
  }

  // The variant on screen in the later slides: own part if loaded, else the original.
  shown(key) { return this.own[key] || this.parts[key]; }

  // Slit of the shown variant of a plate before any morph (assembly mm).
  slit(key) {
    const mesh = this.shown(key);
    if (!mesh.userData.slit) {
      const morphed = mesh.geometry.userData.base;
      if (morphed) mesh.geometry.attributes.position.array.set(morphed);
      mesh.userData.slit = measureSlit(mesh.geometry);
      if (morphed) this.setMorph(key, null);
    }
    return mesh.userData.slit;
  }

  // Cut-away at the assembly plane z = const (mm): the half on the camera side is
  // removed from every part, so the section is seen. The plane follows the model
  // while it turns (updated before each frame). null shows whole parts.
  setSection(z) {
    if (z === null && this.section !== null && this.section !== undefined)
      for (const mesh of this.meshes()) this._clip(mesh, null);
    this.section = z;
  }

  _applySection() {
    this.turntable.updateMatrixWorld(true);
    const camera = this.assembly.worldToLocal(this.camera.position.clone());
    const keep = camera.z > this.section ? -1 : 1;
    const normal = new THREE.Vector3(0, 0, keep).applyQuaternion(this.assembly.getWorldQuaternion(new THREE.Quaternion()));
    const point = this.assembly.localToWorld(new THREE.Vector3(0, 0, this.section));
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    for (const mesh of this.meshes()) this._clip(mesh, plane);
  }

  // Shift a part (and its own variant) along the beam, mm; used for exploded views.
  setLift(key, mm) {
    for (const mesh of [this.parts[key], this.own[key]]) if (mesh) mesh.position.y = mesh.userData.lift = mm;
  }

  // Assembly-frame point on the rim of a plate (beam along assembly Y) that faces
  // the given world direction; keeps a label anchor visible while the model turns.
  rimPoint(keys, worldDir, fraction = 0.9, lift = 0) {
    const box = this.partBox(keys);
    this.turntable.updateMatrixWorld(true);
    const inverse = this.assembly.getWorldQuaternion(new THREE.Quaternion()).invert();
    const dir = worldDir.clone().applyQuaternion(inverse).setY(0).normalize();
    const radius = 0.5 * Math.min(box.max.x - box.min.x, box.max.z - box.min.z) * fraction;
    const point = box.getCenter(new THREE.Vector3()).addScaledVector(dir, radius);
    point.y = box.max.y + lift;
    return point;
  }

  // Bounding box (assembly mm frame) of individual parts.
  partBox(keys) {
    const box = new THREE.Box3();
    for (const key of [].concat(keys)) {
      const mesh = this.parts[key] || this.extras[key];
      if (mesh) box.union(mesh.geometry.boundingBox);
    }
    return box;
  }

  // Height of an assembly-frame point in the world (the turntable does not change it).
  worldY(pointAssembly) {
    this.turntable.updateMatrixWorld(true);
    return this.assembly.localToWorld(pointAssembly.clone()).y;
  }

  // Bounding box (assembly mm frame) of one or several component groups.
  groupBox(names) {
    const box = new THREE.Box3();
    for (const name of [].concat(names))
      for (const mesh of this.groups[name] || []) box.union(mesh.geometry.boundingBox);
    return box;
  }

  // Assembly-frame point (mm) -> world -> CSS pixels.
  project(pointAssembly) {
    const world = this.assembly.localToWorld(pointAssembly.clone());
    const ndc = world.project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: (ndc.x * 0.5 + 0.5) * rect.width, y: (-ndc.y * 0.5 + 0.5) * rect.height, behind: ndc.z > 1 };
  }

  // Camera on a sphere around the target; distance in units of the fit distance.
  setOrbit(azimuthDeg, elevationDeg, distanceFactor, target) {
    const fit = this.fitDistance();
    const az = THREE.MathUtils.degToRad(azimuthDeg), el = THREE.MathUtils.degToRad(elevationDeg);
    if (target) this.target.copy(target);
    const r = fit * distanceFactor;
    this.camera.position.set(
      this.target.x + r * Math.cos(el) * Math.sin(az),
      this.target.y + r * Math.sin(el),
      this.target.z + r * Math.cos(el) * Math.cos(az));
    this.camera.lookAt(this.target);
  }

  fitDistance() {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    return this.radius / Math.sin(Math.min(vfov, hfov) / 2);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  render() {
    if (this.section !== null && this.section !== undefined) this._applySection();
    this.renderer.render(this.scene, this.camera);
  }
}

IBS.Engine = Engine;
IBS.ease = {
  clamp01: (x) => Math.min(Math.max(x, 0), 1),
  inOutCubic: (x) => { x = Math.min(Math.max(x, 0), 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
  outCubic: (x) => { x = Math.min(Math.max(x, 0), 1); return 1 - Math.pow(1 - x, 3); },
  // 0 before t0, 1 after t1, smooth in between.
  window: (t, t0, t1) => IBS.ease.inOutCubic((t - t0) / (t1 - t0)),
  lerp: (a, b, k) => a + (b - a) * k,
};
})();
