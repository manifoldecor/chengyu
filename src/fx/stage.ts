import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Card, RARITIES, Rarity } from '../game/types';
import { cardBackTexture, cardFrontTexture, packTexture, spriteTexture } from './textures';
import { haptic, sfx } from './audio';
import { GLYPHS, crackMaskTexture, makeCrackMaterial, pillowZ, talismanTexture } from './seals';
import { SealCloth } from './cloth';

interface RarityFx { color: number; burst: number; shake: number; rays: number; bloom: number; rings: number; foil: number; }
const FX: Record<Rarity, RarityFx> = {
  common:    { color: 0xffe2a0, burst: 90,  shake: 0,    rays: 0,   bloom: 0.5, rings: 1, foil: 0 },
  uncommon:  { color: 0x6bdc74, burst: 180, shake: 0.02, rays: 0.25, bloom: 0.8, rings: 1, foil: 0 },
  rare:      { color: 0x4aa3ff, burst: 300, shake: 0.04, rays: 0.45, bloom: 1.0, rings: 2, foil: 0.3 },
  epic:      { color: 0xb872ff, burst: 480, shake: 0.09, rays: 0.65, bloom: 1.3, rings: 3, foil: 0.4 },
  legendary: { color: 0xffb62e, burst: 800, shake: 0.16, rays: 0.85, bloom: 1.6, rings: 4, foil: 0.5 },
};

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeBack = (k: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ───────────────────────── particles ─────────────────────────
class Particles {
  readonly max = 2600;
  private pos = new Float32Array(this.max * 3);
  private col = new Float32Array(this.max * 3);
  private base = new Float32Array(this.max * 3);
  private vel = new Float32Array(this.max * 3);
  private life = new Float32Array(this.max);
  private span = new Float32Array(this.max);
  private drag = new Float32Array(this.max);
  private grav = new Float32Array(this.max);
  private i = 0;
  readonly points: THREE.Points;
  constructor(sprite: THREE.Texture) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.16, map: sprite, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }
  spawn(p: THREE.Vector3, v: THREE.Vector3, c: THREE.Color, life: number, drag = 0.98, grav = 2) {
    const k = this.i++ % this.max, j = k * 3;
    this.pos[j] = p.x; this.pos[j + 1] = p.y; this.pos[j + 2] = p.z;
    this.vel[j] = v.x; this.vel[j + 1] = v.y; this.vel[j + 2] = v.z;
    this.base[j] = c.r; this.base[j + 1] = c.g; this.base[j + 2] = c.b;
    this.life[k] = this.span[k] = life; this.drag[k] = drag; this.grav[k] = grav;
  }
  update(dt: number) {
    for (let k = 0; k < this.max; k++) {
      const j = k * 3;
      if (this.life[k] <= 0) { this.col[j] = this.col[j + 1] = this.col[j + 2] = 0; continue; }
      this.life[k] -= dt;
      const d = Math.pow(this.drag[k], dt * 60);
      this.vel[j] *= d; this.vel[j + 1] = this.vel[j + 1] * d - this.grav[k] * dt; this.vel[j + 2] *= d;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      const f = Math.max(this.life[k] / this.span[k], 0);
      this.col[j] = this.base[j] * f; this.col[j + 1] = this.base[j + 1] * f; this.col[j + 2] = this.base[j + 2] * f;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ───────────────────────── shaders ─────────────────────────
const FOIL_FRAG = /* glsl */`
  uniform vec2 uTilt; uniform float uTime, uStrength; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec3 hue(float x){ return clamp(abs(mod(x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  void main(){
    float d = vUv.x * 0.9 + vUv.y * 0.7 + uTilt.x * 0.9 - uTilt.y * 0.7;
    vec3 rainbow = hue(fract(d * 1.1 + uTime * 0.04));
    float sheen = pow(max(0.0, 1.0 - abs(fract(d * 0.7 - uTime * 0.08) - 0.5) * 3.2), 2.0);
    vec2 g = floor(vUv * vec2(70.0, 105.0)); float r = h(g);
    float tw = step(0.9965, r) * (0.5 + 0.5 * sin(uTime * 5.0 + r * 60.0 + uTilt.x * 12.0));
    float a = uStrength * (0.05 + sheen * 0.8) + tw * uStrength * 0.8;
    gl_FragColor = vec4(rainbow * a + vec3(tw * uStrength), a);
  }`;
const RAYS_FRAG = /* glsl */`
  uniform float uTime, uAlpha; uniform vec3 uColor; varying vec2 vUv;
  void main(){
    vec2 p = vUv - 0.5; float r = length(p), a = atan(p.y, p.x);
    float rays = pow(abs(sin(a * 7.0 + uTime * 0.5)), 5.0) * 0.6 + pow(abs(sin(a * 15.0 - uTime * 0.35)), 9.0) * 0.5;
    float c = (rays * smoothstep(0.5, 0.02, r) + exp(-r * 8.0) * 0.8) * uAlpha;
    gl_FragColor = vec4(uColor * c, c);
  }`;
const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

interface Shard { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; age: number }
type State = 'idle' | 'charging' | 'tearing' | 'waitFlip' | 'flipping' | 'revealed';
interface Tween { t: number; dur: number; fn: (k: number) => void; ease: (k: number) => number; done: () => void; }

export interface StageOpts { auto?: boolean; onRevealed?: () => void; }

export class PackStage {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  private clock = new THREE.Clock();
  private raf = 0;
  private state: State = 'idle';
  private fx: RarityFx;
  private color: THREE.Color;
  private tweens: Tween[] = [];
  private particles: Particles;
  private hint: HTMLDivElement;
  private env!: THREE.Texture;
  private crackMats: THREE.ShaderMaterial[] = [];
  private seals: SealCloth[] = [];
  private shards: Shard[] = [];
  private floor = 0;   // seal progress is a ratchet: broken talismans never re-form

  private pack = new THREE.Group();
  private strip!: THREE.Mesh; private body!: THREE.Mesh;
  private stripBack!: THREE.Mesh; private bodyBack!: THREE.Mesh;
  private packMats: THREE.MeshPhysicalMaterial[] = [];
  private glow = new THREE.PointLight(0xffffff, 0, 9, 1.6);
  private key = new THREE.DirectionalLight(0xffffff, 0.6);

  private cardGroup = new THREE.Group();
  private foilMat!: THREE.ShaderMaterial;
  private raysMat!: THREE.ShaderMaterial;
  private rays!: THREE.Mesh;
  private rings: THREE.Mesh[] = [];

  private charge = 0; private holding = false; private chargeSnd: ReturnType<typeof sfx.chargeLoop> | null = null;
  private tilt = new THREE.Vector2(); private tiltTarget = new THREE.Vector2();
  private flash = 0; private shake = 0; private time = 0;
  private ro: ResizeObserver;
  private listeners: [string, EventListener][] = [];

  constructor(private host: HTMLElement, private card: Card, private opts: StageOpts = {}) {
    this.fx = FX[card.rarity]; this.color = new THREE.Color(this.fx.color);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block';
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0e0a09);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();   // assigned per-material so envMapIntensity applies
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2), this.key, this.glow);
    this.key.position.set(2, 3, 5);

    this.particles = new Particles(spriteTexture());
    this.scene.add(this.particles.points);
    this.buildBackdrop(); this.buildPack(); this.buildCard(); this.buildEffects();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.35, 1.0);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());

    this.hint = document.createElement('div');
    this.hint.className = 'stage-hint';
    this.hint.textContent = opts.auto ? '' : 'HOLD THE PACK';
    host.appendChild(this.hint);

    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize();

    const el = this.renderer.domElement;
    this.on(el, 'pointerdown', () => this.onDown());
    this.on(el, 'pointermove', e => this.onMove(e as PointerEvent));
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) this.on(el, t, () => this.onUp());

    this.clock.start(); this.loop();
    if (opts.auto) setTimeout(() => this.autoCharge(), 350);
  }

  // ───── construction ─────
  private on(el: HTMLElement, type: string, fn: EventListener) { el.addEventListener(type, fn); this.listeners.push([type, fn]); }

  private buildBackdrop() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d')!, r = g.createRadialGradient(256, 256, 10, 256, 256, 256);
    r.addColorStop(0, '#3a1a14'); r.addColorStop(0.6, '#170c0a'); r.addColorStop(1, '#0e0a09');
    g.fillStyle = r; g.fillRect(0, 0, 512, 512);
    const bgTex = new THREE.CanvasTexture(c); bgTex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: bgTex, toneMapped: false }));
    m.position.z = -8; this.scene.add(m);
    // drifting ink-dust
    for (let i = 0; i < 70; i++)
      this.particles.spawn(new THREE.Vector3(rnd(-6, 6), rnd(-4, 4), rnd(-5, 1)), new THREE.Vector3(rnd(-.1, .1), rnd(.05, .25), 0),
        new THREE.Color(0x7a5a3a), rnd(6, 14), 1, -0.0);
  }

  private panel(w: number, h: number, cx: number, cy: number, v0: number, v1: number, mat: THREE.Material, sign = 1) {
    const geo = new THREE.PlaneGeometry(w, h, 28, Math.max(2, Math.round(h * 12)));
    const p = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i) + cy;                // pack-space y
      p.setZ(i, sign * pillowZ(x, y));                                     // pillowy foil bag with crimped seams
      uv.setY(i, v0 + (uv.getY(i)) * (v1 - v0));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.position.set(cx, cy, 0); return m;
  }

  private buildPack() {
    const map = packTexture();
    const mk = () => {
      const m = new THREE.MeshPhysicalMaterial({
        map, metalness: 0.55, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25, envMap: this.env, envMapIntensity: 0.7,
        emissive: this.color, emissiveMap: map, emissiveIntensity: 0, side: THREE.DoubleSide, transparent: true,
      });
      this.packMats.push(m); return m;
    };
    const stripH = 0.3, total = 3.2, v = 1 - stripH / total;
    this.body = this.panel(2.2, total - stripH, 0, -stripH / 2, 0, v, mk());
    this.strip = this.panel(2.2, stripH, 0, total / 2 - stripH / 2, v, 1, mk());
    // a real back sheet so the talismans have something to wrap onto
    this.bodyBack = this.panel(2.2, total - stripH, 0, -stripH / 2, 0, v, mk(), -1);
    this.stripBack = this.panel(2.2, stripH, 0, total / 2 - stripH / 2, v, 1, mk(), -1);
    this.pack.add(this.body, this.strip, this.bodyBack, this.stripBack);
    this.buildSeals();
    this.scene.add(this.pack);
  }

  /** Glowing fissures + 禁咒 talisman strips that bind the pack. */
  private buildSeals() {
    const mask = crackMaskTexture(), crackCol = this.color.clone().lerp(new THREE.Color(0xffd79a), 0.4);
    for (const host of [this.body, this.strip]) {
      const mat = makeCrackMaterial(mask, crackCol); this.crackMats.push(mat);
      const m = new THREE.Mesh(host.geometry, mat); m.position.z = 0.006; m.renderOrder = 3; host.add(m);
    }
    // [centre x, rotation, glyph, break threshold, length]
    const defs: [number, number, string, number, number][] = [[-0.05, 0.62, GLYPHS[0], 0.3, 4.6], [0.05, -0.62, GLYPHS[1], 0.55, 4.6], [0, 0, GLYPHS[2], 0.8, 4.2]];
    const ember = [new THREE.Color(0xff7a1a), new THREE.Color(0xffd27a)];
    defs.forEach(([cx, ang, glyph, thr, length], layer) => {
      const cloth = new SealCloth({
        cx, ang, length, width: 0.5, thr, layer, map: talismanTexture(glyph), env: this.env,
        onEmber: p => this.particles.spawn(p, new THREE.Vector3(rnd(-1, 1), rnd(0.5, 2.5), rnd(0, 1.2)), ember[Math.random() < 0.5 ? 0 : 1], rnd(0.5, 1.2), 0.97, -0.4),
      });
      this.scene.add(cloth.group); this.seals.push(cloth);
    });
  }

  private buildCard() {
    const w = 1.8, h = 2.7;
    const frontTex = cardFrontTexture(this.card);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map: frontTex, emissive: 0xffffff, emissiveMap: frontTex, emissiveIntensity: 0.55, roughness: 0.55, metalness: 0, transparent: true, alphaTest: 0.5, envMap: this.env, envMapIntensity: 0.08,
    }));
    const backTex = cardBackTexture(this.card.rarity);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map: backTex, roughness: 0.55, metalness: 0.1, transparent: true, alphaTest: 0.5, envMap: this.env, envMapIntensity: 0.1,
      emissive: 0xffffff, emissiveMap: backTex, emissiveIntensity: 0.4,
    }));
    back.rotation.y = Math.PI; back.position.z = -0.004; front.position.z = 0.004;
    this.foilMat = new THREE.ShaderMaterial({
      uniforms: { uTilt: { value: new THREE.Vector2() }, uTime: { value: 0 }, uStrength: { value: 0 } },
      vertexShader: VERT, fragmentShader: FOIL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const foil = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.93, h * 0.93), this.foilMat); foil.position.z = 0.008;
    this.cardGroup.add(front, back, foil);
    this.cardGroup.visible = false; this.cardGroup.rotation.y = Math.PI;
    this.cardGroup.position.set(0, -0.2, -0.1);
    this.scene.add(this.cardGroup);
  }

  private buildEffects() {
    this.raysMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: this.color } },
      vertexShader: VERT, fragmentShader: RAYS_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.rays = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), this.raysMat); this.rays.position.z = -2.5;
    this.scene.add(this.rays);
    for (let i = 0; i < this.fx.rings; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64),
        new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.z = 0.5; ring.visible = false; this.rings.push(ring); this.scene.add(ring);
    }
  }

  // ───── interaction ─────
  private onDown() {
    if (this.state === 'idle' || this.state === 'charging') {
      if (this.opts.auto) return;
      this.holding = true; this.state = 'charging'; this.hint.classList.add('off');
      this.chargeSnd ??= sfx.chargeLoop(); haptic(15);
    } else if (this.state === 'waitFlip') void this.flip();
  }
  private onUp() { this.holding = false; }
  private onMove(e: PointerEvent) {
    const b = this.renderer.domElement.getBoundingClientRect();
    this.tiltTarget.set(((e.clientX - b.left) / b.width - 0.5) * 2, ((e.clientY - b.top) / b.height - 0.5) * 2);
  }
  private autoCharge() {
    this.state = 'charging'; this.holding = true; this.chargeSnd ??= sfx.chargeLoop();
  }

  // ───── animation helpers ─────
  private anim(dur: number, fn: (k: number) => void, ease = easeOut) {
    return new Promise<void>(done => this.tweens.push({ t: 0, dur, fn, ease, done }));
  }
  private wait(s: number) { return this.anim(s, () => {}); }
  private burst(origin: THREE.Vector3, n: number, speed: number, spread = 1, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.5) * Math.PI * spread, s = speed * rnd(0.25, 1);
      const col = Math.random() < 0.3 ? new THREE.Color(0xffffff) : this.color;
      this.particles.spawn(origin, new THREE.Vector3(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + up, Math.cos(e) * Math.sin(a) * s * 0.6),
        col, rnd(0.8, 2.2), 0.96, 1.2);
    }
  }
  private fireRing(i: number, delay: number) {
    const ring = this.rings[i]; if (!ring) return;
    setTimeout(() => {
      ring.visible = true; ring.position.copy(this.cardGroup.position);
      void this.anim(0.9, k => {
        ring.scale.setScalar(0.3 + k * (5 + i * 1.4));
        (ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
      }).then(() => { ring.visible = false; });
    }, delay);
  }

  // ───── sequence ─────
  private async tear() {
    this.state = 'tearing'; this.chargeSnd?.stop(); this.chargeSnd = null;
    for (const m of this.crackMats) m.uniforms.uProg.value = 1;
    sfx.shatter(); haptic([40, 20, 90, 20, 40]);
    this.flash = 2.2; this.shake = 0.16; this.glow.intensity = 7;
    this.shatterPack();
    this.burst(new THREE.Vector3(0, 0, 0.8), 260, 9, 1);
    this.cardGroup.visible = true; this.cardGroup.position.set(0, 0, 0.1); this.cardGroup.scale.setScalar(0.7);
    sfx.whoosh();
    // the freed card surges forward out of the light
    await this.anim(1.0, k => {
      this.cardGroup.position.set(0, 0, 0.1 + k * 1.7); this.cardGroup.scale.setScalar(0.7 + k * 0.48);
      this.glow.intensity = 7 * (1 - k);
    }, easeBack);
    this.glow.intensity = 0;
    this.state = 'waitFlip';
    this.hint.textContent = 'TAP TO REVEAL'; this.hint.classList.remove('off');
    // rarity tease: the card back glows the colour of what's inside
    this.raysMat.uniforms.uAlpha.value = 0.12 + this.fx.rays * 0.1;
    this.burst(this.cardGroup.position, 30, 2.5);
  }

  private async flip() {
    this.state = 'flipping'; this.hint.classList.add('off');
    sfx.flip(); haptic(20);
    const z0 = this.cardGroup.position.z, s0 = this.cardGroup.scale.x;
    await this.anim(0.75, k => {
      this.cardGroup.rotation.y = Math.PI * (1 - k);
      const bump = Math.sin(k * Math.PI);
      this.cardGroup.position.z = z0 + bump * 0.9; this.cardGroup.scale.setScalar(s0 + bump * 0.15);
      this.cardGroup.rotation.z = Math.sin(k * Math.PI * 2) * 0.05;
    }, easeInOut);
    this.cardGroup.rotation.z = 0;
    // the payoff, scaled by rarity
    const tier = RARITIES.indexOf(this.card.rarity);
    sfx.reveal(tier); haptic(tier >= 3 ? [60, 30, 140, 30, 80] : tier >= 2 ? [50, 30, 70] : 35);
    this.flash = this.fx.bloom * 1.6; this.shake = this.fx.shake;
    this.burst(this.cardGroup.position, this.fx.burst, 4 + tier * 1.6);
    if (tier >= 3) for (let i = 0; i < 60 + tier * 40; i++)    // falling confetti
      this.particles.spawn(new THREE.Vector3(rnd(-3, 3), rnd(2.5, 4), rnd(-1, 2)), new THREE.Vector3(rnd(-.4, .4), rnd(-1, -.2), 0),
        new THREE.Color().setHSL(Math.random(), 0.9, 0.6), rnd(2.5, 4.5), 1, 0.6);
    for (let i = 0; i < this.fx.rings; i++) this.fireRing(i, i * 140);
    this.foilMat.uniforms.uStrength.value = this.fx.foil;
    this.raysMat.uniforms.uAlpha.value = this.fx.rays; this.raysMat.uniforms.uAlpha.value ||= 0.1;
    this.state = 'revealed';
    this.opts.onRevealed?.();
    if (this.card.rarity === 'legendary') this.legendaryPulse();
  }

  private legendaryPulse() {
    const id = setInterval(() => {
      if (this.state !== 'revealed') return clearInterval(id);
      this.flash = 0.5;
      this.burst(new THREE.Vector3(rnd(-1, 1), rnd(-1.4, 1.4), 1.8), 18, 2.5);
    }, 900);
  }

  // ───── frame loop ─────
  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h); this.bloom.resolution.set(w, h);
    this.camera.aspect = w / h;
    this.camera.position.z = Math.max(7.2, 7.2 * (0.72 / this.camera.aspect));
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05); this.time += dt;
    this.step(dt);
    this.composer.render();
  };

  private step(dt: number) {
    for (const tw of [...this.tweens]) {
      tw.t += dt; const k = Math.min(tw.t / tw.dur, 1); tw.fn(tw.ease(k));
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.done(); }
    }
    this.tilt.lerp(this.tiltTarget, 1 - Math.pow(0.001, dt));

    // pack idle / charging
    if (this.state === 'idle' || this.state === 'charging') {
      this.charge = THREE.MathUtils.clamp(this.charge + (this.holding ? dt / (this.opts.auto ? 1.5 : 2.2) : -dt / 0.6), this.floor, 1);
      const c = this.charge, shake = c * c * 0.07;
      this.pack.position.set((Math.random() - 0.5) * shake, Math.sin(this.time * 1.6) * 0.06 * (1 - c) + (Math.random() - 0.5) * shake, 0);
      this.pack.rotation.set(this.tilt.y * 0.25, this.tilt.x * 0.45 + Math.sin(this.time * 0.8) * 0.08 * (1 - c), (Math.random() - 0.5) * shake * 0.6);
      this.pack.scale.setScalar(1 + c * 0.12);
      for (const m of this.packMats) m.emissiveIntensity = c * c * 0.4;
      this.glow.color.copy(this.color); this.glow.position.set(0, 0.5, 2.2); this.glow.intensity = c * 2.2;
      this.bloom.strength = 0.25 + c * 0.3;
      this.chargeSnd?.set(c);
      this.updateSeals(c, dt);
      if (c > 0.05) for (let i = 0; i < Math.ceil(c * 5); i++) {      // energy spirals into the pack
        const a = Math.random() * Math.PI * 2, r = rnd(2.2, 3.4), p = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 1.2, rnd(-0.5, 1));
        this.particles.spawn(p, p.clone().multiplyScalar(-1.3).add(new THREE.Vector3(-p.y * 0.6, p.x * 0.6, 0)), this.color, 0.9, 1, 0);
      }
      if (this.charge >= 1 && this.holding) { this.holding = false; void this.tear(); }
      else if (this.charge <= this.floor + 1e-3 && this.state === 'charging' && !this.holding) { this.state = 'idle'; this.chargeSnd?.stop(); this.chargeSnd = null; this.hint.textContent = this.floor > 0 ? 'KEEP HOLDING - THE SEALS ARE BREAKING' : 'HOLD THE PACK'; this.hint.classList.remove('off'); }
    }

    // card idle motion
    if (this.state === 'waitFlip' || this.state === 'revealed') {
      const bob = Math.sin(this.time * 1.7) * 0.05;
      this.cardGroup.position.y = bob;
      const power = this.state === 'revealed' ? 0.45 : 0.18;
      this.cardGroup.rotation.y = (this.state === 'waitFlip' ? Math.PI : 0) + this.tilt.x * power;   // back faces camera until flipped
      this.cardGroup.rotation.x = this.tilt.y * power;
      this.key.position.set(this.tilt.x * 3, 3 - this.tilt.y * 3, 4);
    }
    this.foilMat.uniforms.uTilt.value.copy(this.tilt); this.foilMat.uniforms.uTime.value = this.time;
    this.raysMat.uniforms.uTime.value = this.time;

    // flash / shake decay
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.state !== 'idle' && this.state !== 'charging') this.bloom.strength = 0.25 + this.flash;
    this.shake = Math.max(0, this.shake - dt * 0.35);
    this.camera.position.x = (Math.random() - 0.5) * this.shake; this.camera.position.y = (Math.random() - 0.5) * this.shake;

    this.updateShards(dt);
    this.particles.update(dt);
  }

  private updateSeals(c: number, dt: number) {
    for (const m of this.crackMats) { m.uniforms.uProg.value = c; m.uniforms.uTime.value = this.time; }
    for (const sl of this.seals) {
      sl.update(dt, this.pack, c, this.time);
      if (!sl.broken && c >= sl.thr) this.breakSeal(sl);
    }
  }

  private breakSeal(sl: SealCloth) {
    this.floor = Math.max(this.floor, sl.thr);
    sl.rip();
    sfx.seal(); haptic([25, 15, 45]);
    this.flash = Math.max(this.flash, 0.7); this.shake = Math.max(this.shake, 0.06);
  }

  /** Splits the pack into jittered triangles that burst outward. */
  private shatterPack() {
    const nx = 7, ny = 9, W = 2.2, H = 3.2;
    const pt: THREE.Vector2[][] = [];
    for (let j = 0; j <= ny; j++) { pt[j] = []; for (let i = 0; i <= nx; i++) {
      const edge = i === 0 || j === 0 || i === nx || j === ny;
      pt[j][i] = new THREE.Vector2(-W / 2 + (i / nx) * W + (edge ? 0 : rnd(-0.1, 0.1)), -H / 2 + (j / ny) * H + (edge ? 0 : rnd(-0.1, 0.1)));
    } }
    const mat = this.packMats[0].clone(); mat.opacity = 1; mat.emissive.copy(this.color); mat.emissiveIntensity = 0.9;
    const tris: THREE.Vector2[][] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = pt[j][i], b = pt[j][i + 1], c = pt[j + 1][i + 1], d = pt[j + 1][i];
      tris.push(Math.random() < 0.5 ? [a, b, c] : [a, b, d], Math.random() < 0.5 ? [a, c, d] : [b, c, d]);
    }
    for (const t of tris) {
      const cen = new THREE.Vector2((t[0].x + t[1].x + t[2].x) / 3, (t[0].y + t[1].y + t[2].y) / 3);
      const pos: number[] = [], uvs: number[] = [];
      for (const v of t) { pos.push(v.x - cen.x, v.y - cen.y, pillowZ(v.x, v.y)); uvs.push((v.x + W / 2) / W, (v.y + H / 2) / H); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(cen.x, cen.y, 0);
      this.pack.add(mesh);
      const out = new THREE.Vector3(cen.x, cen.y * 0.9, 0.5).normalize();
      this.shards.push({ mesh, vel: out.multiplyScalar(rnd(2.5, 8)).add(new THREE.Vector3(0, 1.5, rnd(1, 4))), spin: new THREE.Vector3(rnd(-7, 7), rnd(-7, 7), rnd(-7, 7)), age: 0 });
    }
    this.body.visible = this.strip.visible = this.bodyBack.visible = this.stripBack.visible = false;
    for (const sl of this.seals) sl.group.visible = false;
  }

  private updateShards(dt: number) {
    if (!this.shards.length) return;
    for (const sh of this.shards) {
      sh.age += dt; sh.vel.y -= 7 * dt; sh.vel.multiplyScalar(Math.pow(0.985, dt * 60));
      sh.mesh.position.addScaledVector(sh.vel, dt);
      sh.mesh.rotation.x += sh.spin.x * dt; sh.mesh.rotation.y += sh.spin.y * dt; sh.mesh.rotation.z += sh.spin.z * dt;
      const m = sh.mesh.material as THREE.MeshPhysicalMaterial;
      m.opacity = Math.max(0, 1 - (sh.age - 0.5) / 1.1); m.emissiveIntensity = Math.max(0, 0.9 - sh.age);
    }
    if (this.shards[0].age > 1.8) {
      for (const sh of this.shards) { this.pack.remove(sh.mesh); sh.mesh.geometry.dispose(); }
      (this.shards[0].mesh.material as THREE.Material).dispose(); this.shards = []; this.pack.visible = false;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf); this.ro.disconnect(); this.chargeSnd?.stop();
    const el = this.renderer.domElement;
    for (const [t, f] of this.listeners) el.removeEventListener(t, f);
    this.scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
    this.composer.dispose(); this.renderer.dispose();
    el.remove(); this.hint.remove();
  }
}
