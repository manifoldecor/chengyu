import * as THREE from 'three';
import { HANZI, SANS } from './textures';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Crack "birth-time" map: white = no crack, grey = crack whose value is when (0..1) the fissure reaches
 * that pixel as the seal progress grows. The shader reveals pixels with birth < progress.
 */
export function crackMaskTexture(): THREE.CanvasTexture {
  const w = 512, h = 768, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'darken'; g.lineCap = 'round'; g.lineJoin = 'round';
  const maxD = 640;
  const grow = (x: number, y: number, ang: number, dist: number, width: number, depth: number) => {
    let px = x, py = y, a = ang, d = dist;
    const steps = 16 + Math.floor(Math.random() * 16);
    for (let i = 0; i < steps; i++) {
      a += (Math.random() - 0.5) * 0.8;
      const len = 12 + Math.random() * 16, nx = px + Math.cos(a) * len, ny = py + Math.sin(a) * len;
      d += len;
      if (nx < -12 || nx > w + 12 || ny < -12 || ny > h + 12) break;
      const v = Math.floor(Math.min(0.96, (d / maxD) * 0.96) * 255);
      g.strokeStyle = `rgb(${v},${v},${v})`;
      g.lineWidth = Math.max(1.6, width * (1 - (i / steps) * 0.55));
      g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
      px = nx; py = ny;
      if (depth < 3 && Math.random() < 0.17) grow(px, py, a + (Math.random() < 0.5 ? -1 : 1) * rnd(0.45, 1.1), d, width * 0.62, depth + 1);
    }
  };
  // main fissures radiate from the seal's weak point, a few more start at the edges
  const n = 9;
  for (let i = 0; i < n; i++) grow(w / 2 + rnd(-24, 24), h * 0.48 + rnd(-40, 40), (i / n) * Math.PI * 2 + rnd(-0.25, 0.25), 0, 7, 0);
  for (let i = 0; i < 4; i++) grow(rnd(0, w), Math.random() < 0.5 ? 0 : h, Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2, 220, 5, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

export const GLYPHS = ['封', '镇', '禁', '咒'];

/** Yellow-paper 符 talisman strip with cinnabar writing (tall: the strip is wrapped round the pack). */
export function talismanTexture(glyph: string): THREE.CanvasTexture {
  const w = 192, h = 1280, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const paper = g.createLinearGradient(0, 0, w, h);
  paper.addColorStop(0, '#f0d58f'); paper.addColorStop(0.5, '#e0bd6c'); paper.addColorStop(1, '#cfa754');
  g.fillStyle = paper; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {                                   // paper fibres
    g.strokeStyle = `rgba(120,80,20,${rnd(0.04, 0.12)})`; g.lineWidth = rnd(0.5, 1.4);
    const x = rnd(0, w), y = rnd(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-14, 14), y + rnd(-30, 30)); g.stroke();
  }
  const v = g.createLinearGradient(0, 0, 0, h);                      // aged, darker toward the ends
  v.addColorStop(0, 'rgba(60,20,0,.35)'); v.addColorStop(0.2, 'rgba(60,20,0,0)'); v.addColorStop(0.8, 'rgba(60,20,0,0)'); v.addColorStop(1, 'rgba(60,20,0,.35)');
  g.fillStyle = v; g.fillRect(0, 0, w, h);

  const red = '#b3201a';
  g.strokeStyle = red; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
  g.lineWidth = 2; g.strokeRect(22, 22, w - 44, h - 44);
  g.fillStyle = red; g.strokeStyle = red; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineCap = 'round'; g.lineWidth = 5;
  const runes = (y0: number, n: number) => { for (let i = 0; i < n; i++) {
    const y = y0 + i * 34; g.beginPath(); g.moveTo(52, y);
    for (let x = 52; x < 140; x += 16) g.lineTo(x + 8, y + (((x / 16) | 0) % 2 ? -12 : 12));
    g.stroke();
  } };
  runes(90, 5);                                                       // tail rune strokes
  g.font = `bold 140px ${HANZI}`; g.fillText(glyph, w / 2, 380);     // the sealing character, near the middle
  runes(480, 3);
  g.font = `66px ${HANZI}`;
  [...'急急如律令'].forEach((ch, i) => g.fillText(ch, w / 2, 640 + i * 66));
  g.fillStyle = red; g.beginPath(); g.roundRect(w / 2 - 42, 1000, 84, 84, 10); g.fill();
  g.fillStyle = '#f0d58f'; g.font = `56px ${HANZI}`; g.fillText('敕', w / 2, 1044);
  runes(1120, 4);
  void SANS;
  const t = new THREE.CanvasTexture(g.canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

const CRACK_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CRACK_FRAG = /* glsl */`
  uniform sampler2D uMask; uniform vec3 uColor; uniform float uProg, uTime, uFade; varying vec2 vUv;
  float reveal(vec2 uv){ float b = texture2D(uMask, uv).r; return step(b, 0.985) * step(b, uProg * 1.05); }
  void main(){
    float b = texture2D(uMask, vUv).r;
    float isCrack = step(b, 0.985);
    float front = smoothstep(0.07, 0.0, abs(b - uProg * 1.05)) * isCrack * step(0.001, uProg);
    float core = reveal(vUv);
    // soft halo: average of revealed cracks nearby
    float halo = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      halo += reveal(vUv + vec2(cos(a), sin(a)) * 0.012) + reveal(vUv + vec2(cos(a), sin(a)) * 0.026) * 0.6;
    }
    halo /= 12.8;
    float pulse = 0.8 + 0.2 * sin(uTime * 7.0 + b * 25.0);
    vec3 hot = vec3(1.0, 0.93, 0.78);
    vec3 col = uColor * (core * 1.0 * pulse + halo * 0.45) + hot * (front * 1.3 + core * 0.25);
    float a = clamp(core * 0.9 + halo * 0.6 + front, 0.0, 1.0) * uFade;
    gl_FragColor = vec4(col * uFade, a);
  }`;

export function makeCrackMaterial(mask: THREE.Texture, color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: { uMask: { value: mask }, uColor: { value: color }, uProg: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 } },
    vertexShader: CRACK_VERT, fragmentShader: CRACK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

/** Height of the foil-bag "pillow" at pack-space (x, y). Shared by pack panels, talismans and shards. */
export function pillowZ(x: number, y: number): number {
  const nx = Math.min(1, Math.abs(x) / 1.1), ny = Math.min(1, Math.abs(y) / 1.6);
  let z = 0.16 * (1 - nx * nx) * (1 - ny * ny);
  if (ny > 0.9) z *= 0.3 + 0.1 * Math.sin(x * 70);   // crimped seams
  return z;
}
