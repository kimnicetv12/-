// Dust / snow spray / tyre smoke as soft camera-facing points.
import * as THREE from 'three';
import { softDotTexture } from './textures.js';

const MAX = 2400;

const vert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  #include <fog_pars_vertex>
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.5, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uLight;
  varying float vAlpha;
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor * uLight, t.a * vAlpha);
    #include <fog_fragment>
  }
`;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.color = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.tex = softDotTexture();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uScale: { value: 400 }, uLight: { value: new THREE.Color(1, 1, 1) } }]),
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.mat.uniforms.uMap.value = this.tex;
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Tint for the scene's light (e.g. warm and dimmer at dusk). */
  setLight(r, g, b) {
    this.mat.uniforms.uLight.value.setRGB(r, g, b);
  }

  setViewport(height) {
    this.mat.uniforms.uScale.value = height * 0.9;
  }

  emit(x, y, z, vx, vy, vz, size, life, r, g, b, grow = 1.5, drag = 1.2) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.color[i * 3] = r; this.color[i * 3 + 1] = g; this.color[i * 3 + 2] = b;
    this.grow[i] = grow;
    this.drag[i] = drag;
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - 0.6 * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, t * 1.6) * 0.38;
    }
    for (const name of ['position', 'aSize', 'aAlpha', 'aColor']) this.geo.attributes[name].needsUpdate = true;
  }

  dispose() {
    this.points.parent?.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

const DUST = {
  gravel: [0.72, 0.64, 0.52], gravelLoose: [0.74, 0.66, 0.54], dirt: [0.55, 0.46, 0.36], grass: [0.45, 0.42, 0.33],
  snow: [0.96, 0.97, 1.0], snowDeep: [0.97, 0.98, 1.0], tarmac: [0.85, 0.85, 0.85], tarmacDirty: [0.7, 0.66, 0.58], ice: [0.95, 0.97, 1.0],
};

/** Emit particles from each wheel based on slip and surface. */
export function emitFromCar(particles, car, dt, budget = 1) {
  const speed = car.velocity.length();
  for (const w of car.wheels) {
    if (!w.contact) continue;
    const surf = w.surface.id;
    const c = DUST[surf] || DUST.gravel;
    const loose = surf !== 'tarmac' && surf !== 'ice';
    let rate;
    if (loose) rate = (speed * 0.35 + Math.min(w.slipSpeed, 12) * 1.6) * (surf.startsWith('snow') ? 0.9 : 1);
    else rate = Math.max(0, w.slipSpeed - 4) * 2.2; // tarmac: smoke only when really sliding
    rate *= budget;
    let n = rate * dt;
    while (n > 0) {
      if (Math.random() > n) break;
      n -= 1;
      const j = () => (Math.random() - 0.5);
      const life = loose ? 0.9 + Math.random() * 1.3 : 0.9 + Math.random() * 0.8;
      particles.emit(
        w.cp.x + j() * 0.3, w.cp.y + 0.15, w.cp.z + j() * 0.3,
        car.velocity.x * 0.35 + j() * 2.5, 0.8 + Math.random() * 1.6, car.velocity.z * 0.35 + j() * 2.5,
        loose ? 0.7 : 0.6, life, c[0], c[1], c[2], loose ? 1.7 : 1.4, 1.3,
      );
    }
  }
}
