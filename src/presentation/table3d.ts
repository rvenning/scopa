/**
 * The enhanced 3D tabletop. Loaded on demand (dynamic import) and only when
 * mode.ts chooses the 3D view.
 *
 * It paints; it never decides. The DOM table above it is still what is tapped,
 * focused and read aloud, and every card's pose comes from the scene model via
 * CardFlights. The camera is fixed: a seat at the table, looking down across
 * the cloth under a warm lamp, with a restrained tilt. Screen positions are
 * mapped onto the table by ray casting, so each card lands under its DOM box.
 *
 * Frames are drawn only while something moves or changes, so an idle table
 * costs nothing; a FrameGuard watches those frames and asks for the flat table
 * if the device cannot keep up.
 */
import * as THREE from 'three';
import { animate } from 'motion';
import type { CardId } from '../rules/cards.ts';
import { CardFlights, type Tween } from './cardFlights.ts';
import { FrameGuard } from './mode.ts';
import type { Pose } from './sceneModel.ts';

import walnutTex from '../ui/textures/walnut.webp';
import feltTex from '../ui/textures/felt.webp';
import marbleTex from '../ui/textures/marble.webp';
import linenTex from '../ui/textures/linen.webp';

export type Highlight = 'legal' | 'take' | 'pick' | 'dim' | null;

export interface Table3DOpts {
  faceUrl(c: CardId): string;
  backUrl: string;
  table: 'walnut' | 'felt' | 'marble' | 'linen';
  /** Called once if the 3D table has to give way to the flat one. */
  onFallback(reason: string): void;
}

const SURFACES = {
  walnut: { url: walnutTex, rough: 0.62, tint: 0xffffff, tile: 220 },
  felt: { url: feltTex, rough: 0.95, tint: 0xffffff, tile: 180 },
  marble: { url: marbleTex, rough: 0.28, tint: 0xffffff, tile: 320 },
  linen: { url: linenTex, rough: 0.9, tint: 0xffffff, tile: 200 },
} as const;

const TILT = THREE.MathUtils.degToRad(11);
const FOV = 24;
const FACE_W = 320, FACE_H = 512;
const MAX_FACES = 24;

/** Motion drives every flight: a gently damped spring on a 0→1 progress value. */
const motionTween: Tween = (o) => {
  const c = animate(0, 1, { type: 'spring', visualDuration: o.duration, bounce: o.bounce, delay: o.delay, onUpdate: o.onUpdate, onComplete: o.onComplete });
  return { stop: () => c.stop() };
};

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** ShapeGeometry UVs are in shape units; map them onto 0..1 so a card image fills the face. */
function planeUv(g: THREE.BufferGeometry, w: number, h: number, mirror = false) {
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / w + 0.5;
    uv[2 * i] = mirror ? 1 - u : u;
    uv[2 * i + 1] = pos.getY(i) / h + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export class Table3D {
  readonly canvas: HTMLCanvasElement;
  readonly flights: CardFlights;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 10, 20000);
  private cloth: THREE.Mesh;
  private clothMat: THREE.MeshStandardMaterial;
  private lamp: THREE.SpotLight;
  private cards = new Map<CardId, { g: THREE.Group; face: THREE.Mesh; faceMat: THREE.MeshStandardMaterial; glow: THREE.Mesh; glowMat: THREE.MeshBasicMaterial; hl: Highlight }>();
  private shared: { body: THREE.BufferGeometry; faceGeo: THREE.BufferGeometry; backGeo: THREE.BufferGeometry; bodyMat: THREE.MeshStandardMaterial; backMat: THREE.MeshStandardMaterial; blankMat: THREE.MeshStandardMaterial; glowGeo: THREE.BufferGeometry };
  private faces = new Map<CardId, { tex: THREE.Texture | null; used: number; loading: boolean }>();
  private highlights = new Map<CardId, Highlight>();
  private w = 1; private h = 1;
  private raf = 0;
  private lastFrameAt = 0;
  private guard = new FrameGuard();
  private disposed = false;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private tmp = new THREE.Vector3();
  frames = 0;

  private host: HTMLElement;
  private opts: Table3DOpts;

  constructor(host: HTMLElement, opts: Table3DOpts) {
    this.host = host;
    this.opts = opts;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'table3d';
    this.canvas.setAttribute('aria-hidden', 'true');
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: dpr < 2, alpha: false, powerPreference: 'default' });
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.fail('the graphics context was lost'); });

    this.scene.background = new THREE.Color(0x1d1209);
    // Warm room light from above, a lamp pooled over the middle of the table, a cool fill from the window side.
    this.scene.add(new THREE.HemisphereLight(0xfff0d8, 0x2a170b, 1.15));
    this.lamp = new THREE.SpotLight(0xffe2b0, 2.4, 0, THREE.MathUtils.degToRad(48), 0.85, 0);
    this.lamp.castShadow = true;
    const small = Math.min(innerWidth, innerHeight) < 600;
    this.lamp.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    this.lamp.shadow.bias = -0.0004;
    this.lamp.shadow.normalBias = 0.6;
    this.scene.add(this.lamp, this.lamp.target);
    const fill = new THREE.DirectionalLight(0xd6e4ff, 0.35);
    fill.position.set(-600, -400, 900);
    this.scene.add(fill);

    const s = SURFACES[opts.table];
    this.clothMat = new THREE.MeshStandardMaterial({ color: s.tint, roughness: s.rough, metalness: 0 });
    this.cloth = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.clothMat);
    this.cloth.receiveShadow = true;
    this.scene.add(this.cloth);
    this.setSurface(opts.table);

    const cw = 1, ch = 1.6, r = 0.075;
    const shape = roundedRect(cw, ch, r);
    const body = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 5 });
    body.translate(0, 0, -0.5);
    // Face and back sit just outside the body's two sides (the body is 1 unit thick before scaling).
    const faceGeo = planeUv(new THREE.ShapeGeometry(shape, 5), cw, ch).translate(0, 0, 0.51);
    const backGeo = planeUv(new THREE.ShapeGeometry(shape, 5), cw, ch, true);
    backGeo.rotateY(Math.PI).translate(0, 0, -0.51);
    const glowGeo = new THREE.ShapeGeometry(roundedRect(cw * 1.14, ch * 1.1, r * 1.8), 5);
    this.shared = {
      body, faceGeo, backGeo, glowGeo,
      bodyMat: new THREE.MeshStandardMaterial({ color: 0xeee3cb, roughness: 0.9 }),
      backMat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
      blankMat: new THREE.MeshStandardMaterial({ color: 0xf6efdf, roughness: 0.7 }),
    };
    this.setBack(opts.backUrl);

    this.flights = new CardFlights(motionTween);
    this.flights.onChange = () => this.requestFrame();
    host.prepend(this.canvas);
    this.resize();
  }

  // ---------------------------------------------------------------- surfaces and textures

  private loadCanvasTexture(url: string, w: number, h: number): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d')!;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, w, h);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        resolve(t);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  setSurface(id: Table3DOpts['table']) {
    const s = SURFACES[id];
    new THREE.TextureLoader().load(s.url, (t) => {
      if (this.disposed) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.clothMat.map?.dispose();
      this.clothMat.map = t;
      this.clothMat.roughness = s.rough;
      this.clothMat.needsUpdate = true;
      this.fitCloth();
      this.requestFrame();
    });
    this.opts.table = id;
  }

  setBack(url: string) {
    void this.loadCanvasTexture(url, FACE_W, FACE_H).then((t) => {
      if (this.disposed) { t.dispose(); return; }
      this.shared.backMat.map?.dispose();
      this.shared.backMat.map = t;
      this.shared.backMat.needsUpdate = true;
      this.requestFrame();
    }).catch(() => undefined);
  }

  /** Face images load on demand and the least recently shown are released, to keep GPU memory small on phones. */
  /** Start loading faces that are about to be seen (the player's hand, cards that will turn face up in flight). */
  prepare(cards: Iterable<CardId>) {
    for (const c of cards) this.faceFor(c, null);
  }

  private faceFor(c: CardId, mat: THREE.MeshStandardMaterial | null) {
    let f = this.faces.get(c);
    if (!f) { f = { tex: null, used: 0, loading: false }; this.faces.set(c, f); }
    f.used = performance.now();
    if (f.tex) { if (mat && mat.map !== f.tex) { mat.map = f.tex; mat.color.set(0xffffff); mat.needsUpdate = true; } return; }
    if (f.loading) return;
    f.loading = true;
    const entry = f;
    void this.loadCanvasTexture(this.opts.faceUrl(c), FACE_W, FACE_H).then((t) => {
      if (this.disposed) { t.dispose(); return; }
      entry.tex = t; entry.loading = false;
      this.evictFaces();
      this.requestFrame();
    }).catch(() => { entry.loading = false; });
  }

  private evictFaces() {
    const loaded = [...this.faces.entries()].filter(([, f]) => f.tex);
    if (loaded.length <= MAX_FACES) return;
    loaded.sort((a, b) => a[1].used - b[1].used);
    for (const [c, f] of loaded.slice(0, loaded.length - MAX_FACES)) {
      const card = this.cards.get(c);
      if (card && card.faceMat.map === f.tex) { card.faceMat.map = null; card.faceMat.needsUpdate = true; }
      f.tex!.dispose();
      this.faces.delete(c);
    }
  }

  /** Card faces changed style: drop every loaded face so they reload in the new style. */
  refreshFaces() {
    for (const [c, f] of this.faces) {
      f.tex?.dispose();
      const card = this.cards.get(c);
      if (card) { card.faceMat.map = null; card.faceMat.needsUpdate = true; }
    }
    this.faces.clear();
    this.requestFrame();
  }

  private meshFor(c: CardId) {
    let m = this.cards.get(c);
    if (m) return m;
    const g = new THREE.Group();
    g.rotation.order = 'ZXY';
    const body = new THREE.Mesh(this.shared.body, this.shared.bodyMat);
    body.castShadow = true;
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xf6efdf, roughness: 0.55 });
    const face = new THREE.Mesh(this.shared.faceGeo, faceMat);
    const back = new THREE.Mesh(this.shared.backGeo, this.shared.backMat);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffcf5a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const glow = new THREE.Mesh(this.shared.glowGeo, glowMat);
    glow.visible = false;
    g.add(body, face, back);
    this.scene.add(g, glow);
    m = { g, face, faceMat, glow, glowMat, hl: null };
    this.cards.set(c, m);
    return m;
  }

  // ---------------------------------------------------------------- geometry

  resize() {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    const cam = this.camera;
    cam.aspect = this.w / this.h;
    // Distance at which one world unit on the table, at the centre of the screen, is one CSS pixel.
    const d = (this.h / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    cam.position.set(0, -Math.sin(TILT) * d, Math.cos(TILT) * d);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    cam.near = d * 0.2; cam.far = d * 3;
    cam.updateProjectionMatrix();
    const reach = Math.max(this.w, this.h);
    this.lamp.position.set(-reach * 0.08, reach * 0.12, reach * 1.25);
    this.lamp.target.position.set(0, -this.h * 0.04, 0);
    const sc = this.lamp.shadow.camera as THREE.PerspectiveCamera;
    sc.near = reach * 0.4; sc.far = reach * 2.2;
    this.fitCloth();
    this.requestFrame();
  }

  private fitCloth() {
    // Cover everything the camera can see, with margin for the tilt.
    const size = Math.max(this.w, this.h) * 2.4;
    this.cloth.scale.set(size, size, 1);
    const t = this.clothMat.map;
    if (t) {
      const tile = SURFACES[this.opts.table].tile;
      t.repeat.set(size / tile, size / tile);
    }
  }

  /** The point on the table (at height z, CSS px) that appears at screen position (sx, sy). */
  toTable(sx: number, sy: number, z: number, out = new THREE.Vector3()) {
    const ndc = new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    this.plane.constant = -z;
    return this.ray.ray.intersectPlane(this.plane, out) ?? out.set(sx - this.w / 2, this.h / 2 - sy, z);
  }

  // ---------------------------------------------------------------- sync and frames

  setHighlights(h: Map<CardId, Highlight>) {
    this.highlights = h;
    this.requestFrame();
  }

  requestFrame() {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(t: number) {
    this.raf = 0;
    if (this.disposed) return;
    const continuous = t - this.lastFrameAt < 50;
    this.lastFrameAt = t;
    this.applyPoses();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (this.flights.moving > 0) {
      if (!this.guard.tripped && this.guard.frame(t, continuous)) this.fail('frames were too slow on this device');
      this.requestFrame();
    }
  }

  private applyPoses() {
    const a = this.tmp, b = new THREE.Vector3();
    for (const [c, p] of this.flights.poses) {
      const m = this.meshFor(c);
      const hl = this.highlights.get(c) ?? null;
      const lift = hl === 'take' ? 7 : hl === 'pick' ? 4 : 0;
      const z = p.z + lift + 0.6;
      const centre = this.toTable(p.x, p.y, z, new THREE.Vector3());
      // World size that projects to the card's width and height on screen at this spot.
      const ww = this.toTable(p.x - p.w / 2, p.y, z, a).distanceTo(this.toTable(p.x + p.w / 2, p.y, z, b));
      const wh = this.toTable(p.x, p.y - p.w * 0.8, z, a).distanceTo(this.toTable(p.x, p.y + p.w * 0.8, z, b));
      const grow = hl === 'take' ? 1.05 : 1;
      m.g.position.copy(centre);
      m.g.scale.set(ww * grow, (wh / 1.6) * grow, 0.55);
      m.g.rotation.set(THREE.MathUtils.degToRad(p.tilt), Math.PI * (1 - p.face), THREE.MathUtils.degToRad(-p.rot));
      m.g.visible = p.show > 0.01;
      if (p.face > 0.01) this.faceFor(c, m.faceMat);
      m.faceMat.color.set(hl === 'dim' ? 0x8c8579 : 0xffffff);
      const glowOn = (hl === 'legal' || hl === 'take' || hl === 'pick') && m.g.visible && p.face > 0.9;
      m.glow.visible = glowOn;
      if (glowOn) {
        m.glow.position.set(centre.x, centre.y, 0.3);
        m.glow.scale.set(ww * grow, (wh / 1.6) * grow, 1);
        m.glow.rotation.set(0, 0, THREE.MathUtils.degToRad(-p.rot));
        m.glowMat.color.set(hl === 'pick' ? 0x9ed0ff : 0xffcf5a);
        m.glowMat.opacity = hl === 'take' ? 0.95 : 0.7;
      }
    }
  }

  /** Card poses and highlights as the scene holds them; e2e reads this to check state consistency. */
  debug() {
    return { moving: this.flights.moving, mismatches: this.flights.mismatches(), cards: this.cards.size, frames: this.frames, faces: [...this.faces.values()].filter((f) => f.tex).length };
  }

  /** Where the 3D card actually is on screen (projected centre), for alignment checks. */
  screenOf(c: CardId): { x: number; y: number } | null {
    const m = this.cards.get(c);
    if (!m) return null;
    const v = m.g.position.clone().project(this.camera);
    return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h };
  }

  private fail(reason: string) {
    if (this.disposed) return;
    this.opts.onFallback(reason);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.flights.finish();
    for (const f of this.faces.values()) f.tex?.dispose();
    for (const m of this.cards.values()) { m.faceMat.dispose(); m.glowMat.dispose(); }
    const sh = this.shared;
    [sh.body, sh.faceGeo, sh.backGeo, sh.glowGeo].forEach((g) => g.dispose());
    [sh.bodyMat, sh.backMat, sh.blankMat].forEach((m) => { m.map?.dispose(); m.dispose(); });
    this.clothMat.map?.dispose(); this.clothMat.dispose(); this.cloth.geometry.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

export type Pose3D = Pose;
