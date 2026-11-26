import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Card } from '../game/types';
import { cardBackTexture, cardFrontTexture } from './textures';
import { FOIL_FRAG, FX, RAYS_FRAG, VERT } from './stage';

/**
 * A single card shown large in 3D: foil that shifts with the angle, light rays by rarity, drag to turn it, tap to flip.
 * Cards you have not found yet show only their back, glowing in the colour of their rarity.
 */
export class CardViewer {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  private clock = new THREE.Clock();
  private raf = 0;
  private group = new THREE.Group();
  private foil!: THREE.ShaderMaterial;
  private rays!: THREE.ShaderMaterial;
  private tilt = new THREE.Vector2(); private tiltTarget = new THREE.Vector2();
  private rotY = 0; private targetY = 0; private dragging = false; private moved = 0; private lastX = 0;
  private time = 0; private ro: ResizeObserver; private cleanup: (() => void)[] = [];

  constructor(private host: HTMLElement, private card: Card, private owned: boolean) {
    const fx = FX[card.rarity], color = new THREE.Color(fx.color);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    const el = this.renderer.domElement;
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block;cursor:grab';
    host.appendChild(el);

    this.scene.background = new THREE.Color(0x0b0807);
    const pm = new THREE.PMREMGenerator(this.renderer), env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 0.6); key.position.set(2, 3, 5);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2), key);

    // rays behind the card
    this.rays = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: owned ? fx.rays * 0.8 : 0.18 }, uColor: { value: color } },
      vertexShader: VERT, fragmentShader: RAYS_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const rays = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), this.rays); rays.position.z = -2.5; this.scene.add(rays);

    const w = 1.8, h = 2.7;
    const backTex = cardBackTexture(card.rarity);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map: backTex, emissive: 0xffffff, emissiveMap: backTex, emissiveIntensity: 0.4, roughness: 0.55, metalness: 0.1,
      transparent: true, alphaTest: 0.5, envMap: env, envMapIntensity: 0.1 }));
    back.rotation.y = Math.PI; back.position.z = -0.004;
    this.group.add(back);
    this.foil = new THREE.ShaderMaterial({
      uniforms: { uTilt: { value: new THREE.Vector2() }, uTime: { value: 0 }, uStrength: { value: owned ? fx.foil : 0 } },
      vertexShader: VERT, fragmentShader: FOIL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    if (owned) {
      const frontTex = cardFrontTexture(card);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
        map: frontTex, emissive: 0xffffff, emissiveMap: frontTex, emissiveIntensity: 0.55, roughness: 0.55, metalness: 0,
        transparent: true, alphaTest: 0.5, envMap: env, envMapIntensity: 0.08 }));
      front.position.z = 0.004;
      const foil = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.93, h * 0.93), this.foil); foil.position.z = 0.008;
      this.group.add(front, foil);
    } else { this.rotY = this.targetY = Math.PI; }     // not found yet: only the back is ever visible
    this.scene.add(this.group);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), owned ? 0.25 + fx.foil * 0.12 : 0.3, 0.35, 1.0);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());

    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize();

    const on = (t: string, f: (e: PointerEvent) => void) => { el.addEventListener(t, f as EventListener); this.cleanup.push(() => el.removeEventListener(t, f as EventListener)); };
    on('pointerdown', e => { this.dragging = true; this.moved = 0; this.lastX = e.clientX; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; });
    on('pointermove', e => {
      const b = el.getBoundingClientRect();
      this.tiltTarget.set(((e.clientX - b.left) / b.width - 0.5) * 2, ((e.clientY - b.top) / b.height - 0.5) * 2);
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX; this.lastX = e.clientX; this.moved += Math.abs(dx);
      if (this.owned) { this.rotY += dx * 0.013; this.targetY = this.rotY; }
    });
    const up = () => {
      if (!this.dragging) return; this.dragging = false; el.style.cursor = 'grab';
      if (!this.owned) return;
      this.targetY = this.moved < 6 ? Math.round(this.rotY / Math.PI) * Math.PI + Math.PI   // a tap flips the card over
                                    : Math.round(this.rotY / Math.PI) * Math.PI;           // a drag settles on the nearest face
    };
    on('pointerup', up); on('pointercancel', up);
    on('pointerleave', () => { if (!this.dragging) this.tiltTarget.set(0, 0); });

    this.clock.start(); this.loop();
  }

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h); this.bloom.resolution.set(w, h);
    this.camera.aspect = w / h;
    this.camera.position.z = Math.max(6.4, 6.4 * (0.62 / this.camera.aspect));
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05); this.time += dt;
    this.tilt.lerp(this.tiltTarget, 1 - Math.pow(0.001, dt));
    if (!this.dragging) this.rotY += (this.targetY - this.rotY) * (1 - Math.exp(-dt * 9));
    this.group.rotation.y = this.rotY + this.tilt.x * 0.3;
    this.group.rotation.x = this.tilt.y * 0.3;
    this.group.position.y = Math.sin(this.time * 1.6) * 0.05;
    this.foil.uniforms.uTilt.value.copy(this.tilt); this.foil.uniforms.uTime.value = this.time;
    this.rays.uniforms.uTime.value = this.time;
    this.composer.render();
  };

  dispose() {
    cancelAnimationFrame(this.raf); this.ro.disconnect(); this.cleanup.forEach(f => f());
    this.scene.traverse(o => { (o as THREE.Mesh).geometry?.dispose?.(); });
    this.composer.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
