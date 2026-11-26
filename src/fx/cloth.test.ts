import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SealCloth } from './cloth';
import { pillowZ } from './seals';

/** Headless run of the talisman cloth against a shaking, tilting, scaling pack. */
function run(ang: number, cx: number, length: number, thr: number) {
  const tex = new THREE.Texture();
  const cloth = new SealCloth({ cx, ang, length, width: 0.5, thr, layer: 0, map: tex, env: tex });
  const pack = new THREE.Group();
  const pts = () => (cloth as unknown as { pos: Float32Array }).pos;
  const count = pts().length / 3;
  const inv = new THREE.Matrix4(), v = new THREE.Vector3();
  const lastSign = new Int8Array(count);
  let worstPenetration = 0, tunnels = 0, t = 0;

  const dt = 1 / 60;
  for (let frame = 0; frame < 720; frame++) {
    const c = Math.min(1, frame / 600);                              // hold ramps to full charge
    const shake = c * c * 0.07;
    pack.position.set((Math.random() - 0.5) * shake, Math.sin(t * 1.6) * 0.06 + (Math.random() - 0.5) * shake, 0);
    pack.rotation.set(Math.sin(t) * 0.25, Math.cos(t * 0.7) * 0.45, (Math.random() - 0.5) * shake * 0.6);
    pack.scale.setScalar(1 + c * 0.12);
    t += dt;
    cloth.update(dt, pack, c, t);
    if (!cloth.broken && c >= thr) cloth.rip();                      // tear when the threshold is reached, then keep simulating

    pack.updateMatrixWorld(true); inv.copy(pack.matrixWorld).invert();
    for (let k = 0; k < count; k++) {
      v.set(pts()[k * 3], pts()[k * 3 + 1], pts()[k * 3 + 2]).applyMatrix4(inv);
      if (Math.abs(v.x) >= 1.1 || Math.abs(v.y) >= 1.6) { lastSign[k] = 0; continue; }   // outside the outline: free to swing round
      const h = pillowZ(v.x, v.y);
      worstPenetration = Math.max(worstPenetration, h - Math.abs(v.z));   // how far inside the sheet it is
      const sg = v.z >= 0 ? 1 : -1;
      if (h > 0.02 && lastSign[k] !== 0 && lastSign[k] !== sg) tunnels++;   // a face switch through the sheet body (the foil is paper-thin at the very edge, where swinging round is intended)
      lastSign[k] = sg;
    }
  }
  return { worstPenetration, tunnels };
}

describe('talisman cloth collision', () => {
  const cases: [string, number, number, number, number][] = [
    ['left diagonal', 0.62, -0.05, 4.6, 0.3],
    ['right diagonal', -0.62, 0.05, 4.6, 0.55],
    ['vertical', 0, 0, 4.2, 0.8],
  ];
  for (const [name, ang, cx, len, thr] of cases) {
    it(`${name} never phases into or through the pack (before, during and after the tear)`, () => {
      const { worstPenetration, tunnels } = run(ang, cx, len, thr);
      expect(tunnels).toBe(0);
      expect(worstPenetration).toBeLessThan(0.0001);                  // stays outside the sheet surface
    });
  }
});
