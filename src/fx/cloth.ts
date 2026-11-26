import * as THREE from 'three';
import { pillowZ } from './seals';

export interface ClothOpts {
  cx: number; ang: number; length: number; width: number;
  thr: number;            // charge level at which this seal rips
  layer: number;          // stacking order so crossing strips don't intersect
  map: THREE.Texture; env: THREE.Texture;
  onEmber?: (p: THREE.Vector3) => void;
}

const M = 4;              // particles across the strip
const SUB = 1 / 60;       // fixed physics step
const ITER = 10;
const MAX_STEP = 0.06;   // max distance a particle may travel per physics step (prevents tunnelling)
const HX = 1.1, HY = 1.6; // pack half-extents (pack-local)

/**
 * A talisman strip simulated as Verlet cloth in world space. The strip is pasted over the pack (pinned in the middle,
 * folded around the edges onto the back), collides with the pack's pillow surface, is glued down by an adhesion force
 * that weakens as the seal strains, and flutters with the pack's motion. rip() tears it in two.
 */
export class SealCloth {
  readonly group = new THREE.Group();
  readonly thr: number;
  broken = false;

  private n: number; private count: number;
  private pos: Float32Array; private prev: Float32Array;
  private rest: THREE.Vector3[] = [];
  private absS: Float32Array; private far: Float32Array;
  private pinned: Uint8Array;
  private side: Int8Array;   // which face of the pack each particle is on (+1 front, -1 back); only changes by going round an edge
  private ca: number[] = []; private cb: number[] = []; private cl: number[] = []; private ck: number[] = []; private alive: boolean[] = [];
  private geo = new THREE.BufferGeometry();
  private front: THREE.MeshStandardMaterial; private back: THREE.MeshStandardMaterial;
  private margin: number; private pinHalf0: number;
  private acc = 0; private age = 0;
  private dirX: number; private dirY: number;
  private inv = new THREE.Matrix4(); private nz = new THREE.Vector3(); private tmp = new THREE.Vector3();

  constructor(private o: ClothOpts) {
    this.thr = o.thr; this.margin = 0.035 + o.layer * 0.02;
    const n = (this.n = Math.round(o.length / 0.1)); this.count = n * M;
    this.pos = new Float32Array(this.count * 3); this.prev = new Float32Array(this.count * 3);
    this.absS = new Float32Array(this.count); this.far = new Float32Array(this.count); this.pinned = new Uint8Array(this.count); this.side = new Int8Array(this.count);
    this.pinHalf0 = o.length * 0.17;
    const sinA = Math.sin(o.ang), cosA = Math.cos(o.ang);
    this.dirX = -sinA; this.dirY = cosA;

    const uv = new Float32Array(this.count * 2);
    for (let i = 0; i < n; i++) for (let j = 0; j < M; j++) {
      const k = i * M + j, s = (i / (n - 1) - 0.5) * o.length, t = (j / (M - 1) - 0.5) * o.width;
      let x = o.cx - sinA * s + cosA * t, y = cosA * s + sinA * t, side = 1;
      // fold around the pack's edges: the strip continues onto the back, reflected about the edge
      if (Math.abs(x) > HX) { x = Math.sign(x) * Math.max(0, 2 * HX - Math.abs(x)); side = -1; }
      if (Math.abs(y) > HY) { y = Math.sign(y) * Math.max(0, 2 * HY - Math.abs(y)); side = -1; }
      const z = side * (pillowZ(x, y) + this.margin);
      this.rest.push(new THREE.Vector3(x, y, z)); this.side[k] = side;
      this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z;
      uv[k * 2] = j / (M - 1); uv[k * 2 + 1] = i / (n - 1);
      this.absS[k] = Math.abs(s); this.far[k] = Math.abs(s) / (o.length / 2);
      this.pinned[k] = Math.abs(s) <= this.pinHalf0 ? 1 : 0;
    }
    this.prev.set(this.pos);

    // constraints: structural + shear + bend, rest lengths taken from the (folded) starting pose
    const add = (a: number, b: number, stiff: number) => {
      const dx = this.pos[a * 3] - this.pos[b * 3], dy = this.pos[a * 3 + 1] - this.pos[b * 3 + 1], dz = this.pos[a * 3 + 2] - this.pos[b * 3 + 2];
      this.ca.push(a); this.cb.push(b); this.cl.push(Math.hypot(dx, dy, dz)); this.ck.push(stiff); this.alive.push(true);
    };
    for (let i = 0; i < n; i++) for (let j = 0; j < M; j++) {
      const k = i * M + j;
      if (j < M - 1) add(k, k + 1, 1);
      if (i < n - 1) { add(k, k + M, 1); if (j < M - 1) { add(k, k + M + 1, 0.6); add(k + 1, k + M, 0.6); } }
      if (i < n - 2) add(k, k + 2 * M, 0.12);
    }

    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < M - 1; j++) {
      const p00 = i * M + j, p10 = (i + 1) * M + j, p01 = p00 + 1, p11 = p10 + 1;
      idx.push(p00, p01, p10, p10, p01, p11);
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);

    this.front = new THREE.MeshStandardMaterial({ map: o.map, emissive: 0xffffff, emissiveMap: o.map, emissiveIntensity: 0.4, roughness: 0.85,
      side: THREE.FrontSide, transparent: true, envMap: o.env, envMapIntensity: 0.1 });
    this.back = new THREE.MeshStandardMaterial({ color: 0xd9b565, emissive: 0x3a2a10, roughness: 0.9, side: THREE.BackSide, transparent: true });
    const f = new THREE.Mesh(this.geo, this.front), b = new THREE.Mesh(this.geo, this.back);
    f.frustumCulled = b.frustumCulled = false; f.renderOrder = b.renderOrder = 2 + o.layer;
    this.group.add(f, b);
  }

  /** Advance the simulation by real time dt. `c` = hold charge 0..1, used for strain. */
  update(dt: number, pack: THREE.Object3D, c: number, time: number) {
    pack.updateMatrixWorld(true);
    this.acc += dt; let steps = 0;
    while (this.acc >= SUB && steps < 3) { this.simulate(pack, c, time + steps * SUB); this.acc -= SUB; steps++; }
    if (steps === 3) this.acc = 0;
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.geo.computeVertexNormals();

    const near = this.broken ? 1 : Math.pow(Math.min(1, c / this.thr), 3);
    this.front.emissive.setRGB(1, 1 - near * 0.6, 1 - near * 0.8);   // paper reddens as the spell strains
    this.front.emissiveIntensity = 0.4 + near * 0.9 + (this.broken ? 0 : Math.sin(time * 22) * near * 0.15);
    if (this.broken) {
      this.age += dt;
      const fade = 1 - Math.min(1, Math.max(0, (this.age - 0.5) / 0.9));
      this.front.opacity = this.back.opacity = fade;
      if (this.age < 1.3 && this.o.onEmber) for (let e = 0; e < 3; e++) {
        const k = Math.floor(Math.random() * this.count) * 3;
        this.o.onEmber(this.tmp.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]).clone());
      }
      if (fade <= 0) this.group.visible = false;
    }
  }

  /** Tear the strip in two near its middle and throw both halves off the pack. */
  rip() {
    if (this.broken) return;
    this.broken = true;
    const n = this.n, cut = Math.floor(n * (0.4 + Math.random() * 0.2));
    for (let e = 0; e < this.ca.length; e++) {
      const ia = Math.floor(this.ca[e] / M), ib = Math.floor(this.cb[e] / M);
      if (Math.min(ia, ib) <= cut && Math.max(ia, ib) > cut) this.alive[e] = false;
    }
    for (let k = 0; k < this.count; k++) {
      this.pinned[k] = 0;
      const half = Math.floor(k / M) <= cut ? -1 : 1, b = k * 3;
      const ix = this.dirX * half * (2 + Math.random() * 4) + (Math.random() - 0.5) * 2;
      const iy = this.dirY * half * (2 + Math.random() * 4) + Math.random() * 2;
      const iz = (0.4 + Math.random() * 1.2) * this.side[k];   // away from the pack face it sits on, never through it
      this.prev[b] = this.pos[b] - (ix + this.nz.x * iz) * SUB; this.prev[b + 1] = this.pos[b + 1] - (iy + this.nz.y * iz) * SUB; this.prev[b + 2] = this.pos[b + 2] - (this.nz.z * iz) * SUB;
    }
  }

  private simulate(pack: THREE.Object3D, c: number, time: number) {
    const { pos, prev } = this, mw = pack.matrixWorld;
    this.inv.copy(mw).invert();
    this.nz.set(0, 0, 1).transformDirection(mw);
    const near = this.broken ? 1 : Math.pow(Math.min(1, c / this.thr), 3);
    const pinHalf = this.broken ? -1 : this.pinHalf0 * (1 - 0.85 * near);     // glue releases from the ends inward
    const amp = 6 * (0.25 + c * 1.2 + near * 2.5) * (this.broken ? 2 : 1);
    const adh = this.broken ? 0 : 34 * (1 - 0.92 * near);                      // glue strength fades as the seal strains
    const dt2 = SUB * SUB, v = this.tmp;

    for (let k = 0; k < this.count; k++) {
      const b = k * 3;
      if (this.pinned[k] && this.absS[k] > pinHalf) this.pinned[k] = 0;
      if (this.pinned[k]) {
        v.copy(this.rest[k]).applyMatrix4(mw);
        pos[b] = prev[b] = v.x; pos[b + 1] = prev[b + 1] = v.y; pos[b + 2] = prev[b + 2] = v.z;
        continue;
      }
      const i = (k / M) | 0, j = k % M;
      let ax = 0, ay = -2.5, az = 0;
      const f = amp * this.far[k] * (Math.sin(time * 3.3 + i * 0.31) + 0.6 * Math.sin(time * 7.1 + j * 1.7 + i * 0.5));
      ax += this.nz.x * f; ay += this.nz.y * f; az += this.nz.z * f;
      if (adh > 0) {
        v.set(pos[b], pos[b + 1], pos[b + 2]).applyMatrix4(this.inv);
        if (Math.abs(v.x) < HX && Math.abs(v.y) < HY) {
          const side = this.side[k];
          ax -= this.nz.x * adh * side; ay -= this.nz.y * adh * side; az -= this.nz.z * adh * side;
        }
      }
      const damp = this.broken ? 0.97 : 0.985;
      const vx = (pos[b] - prev[b]) * damp, vy = (pos[b + 1] - prev[b + 1]) * damp, vz = (pos[b + 2] - prev[b + 2]) * damp;
      prev[b] = pos[b]; prev[b + 1] = pos[b + 1]; prev[b + 2] = pos[b + 2];
      let dx = vx + ax * dt2, dy = vy + ay * dt2, dz = vz + az * dt2;
      const mv = Math.hypot(dx, dy, dz);
      if (mv > MAX_STEP) { const r = MAX_STEP / mv; dx *= r; dy *= r; dz *= r; }
      pos[b] += dx; pos[b + 1] += dy; pos[b + 2] += dz;
    }

    for (let it = 0; it < ITER; it++) {
      for (let e = 0; e < this.ca.length; e++) {
        if (!this.alive[e]) continue;
        const a = this.ca[e], bb = this.cb[e], ia = a * 3, ib = bb * 3;
        const dx = pos[ia] - pos[ib], dy = pos[ia + 1] - pos[ib + 1], dz = pos[ia + 2] - pos[ib + 2];
        const d = Math.hypot(dx, dy, dz); if (d < 1e-6) continue;
        const wa = this.pinned[a] ? 0 : 1, wb = this.pinned[bb] ? 0 : 1, w = wa + wb; if (!w) continue;
        const corr = ((d - this.cl[e]) / d) * this.ck[e] / w;
        pos[ia] -= dx * corr * wa; pos[ia + 1] -= dy * corr * wa; pos[ia + 2] -= dz * corr * wa;
        pos[ib] += dx * corr * wb; pos[ib + 1] += dy * corr * wb; pos[ib + 2] += dz * corr * wb;
      }
      this.collide(mw);
    }
  }

  /**
   * Keep the paper outside the pack's pillowy surface. Each particle remembers its face (front/back); inside the pack's
   * outline it can only stay on that face, so it can never be pushed through to the other side. Beyond the edges it is
   * free to swing round and change face. Contact adds friction so paper doesn't slide off.
   */
  private collide(mw: THREE.Matrix4) {
    const { pos, prev } = this, v = this.tmp;
    for (let k = 0; k < this.count; k++) {
      if (this.pinned[k]) continue;
      const b = k * 3;
      v.set(pos[b], pos[b + 1], pos[b + 2]).applyMatrix4(this.inv);
      if (Math.abs(v.x) >= HX || Math.abs(v.y) >= HY) {              // past the edge: free space, may change face
        if (Math.abs(v.z) > 0.012) this.side[k] = v.z > 0 ? 1 : -1;
        continue;
      }
      const sd = this.side[k], h = pillowZ(v.x, v.y) + this.margin;
      if (v.z * sd >= h) continue;
      v.z = sd * h;
      v.applyMatrix4(mw);
      const vx = pos[b] - prev[b], vy = pos[b + 1] - prev[b + 1], vz = pos[b + 2] - prev[b + 2];
      pos[b] = v.x; pos[b + 1] = v.y; pos[b + 2] = v.z;
      prev[b] = v.x - vx * 0.55; prev[b + 1] = v.y - vy * 0.55; prev[b + 2] = v.z - vz * 0.55;
    }
  }
}
