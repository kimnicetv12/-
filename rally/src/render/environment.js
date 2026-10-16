// Sky (gradient + sun + procedural clouds), image-based lighting generated
// from that sky, sun with shadows, atmospheric fog and optional lens flare.
import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { SHARED } from './materials.js';

const PRESETS = {
  dusk: {
    top: 0x23335f, horizon: 0xf0a46e, ground: 0x2c2523, sun: 0xffa060, sunI: 2.4, hemiI: 0.4, envI: 0.8,
    elev: 6, azim: 245, fog: [350, 4200], cloud: 0.48, cloudLit: 0xffb27a, cloudDark: 0x4a4a62, exposure: 1.05, sunFog: 0xffa868,
  },
  day: {
    top: 0x2f6fc6, horizon: 0xc9dff2, ground: 0x46553a, sun: 0xfff1df, sunI: 2.7, hemiI: 0.45, envI: 0.8,
    elev: 40, azim: 160, fog: [450, 5200], cloud: 0.52, cloudLit: 0xffffff, cloudDark: 0x9aa7b8, exposure: 1.0, sunFog: 0xfff0d8,
  },
  winter: {
    top: 0x8eb1d8, horizon: 0xe4ebf3, ground: 0xdfe6ee, sun: 0xfff3e2, sunI: 1.9, hemiI: 0.55, envI: 0.8,
    elev: 11, azim: 170, fog: [260, 3000], cloud: 0.62, cloudLit: 0xffffff, cloudDark: 0xb7c2d0, exposure: 0.95, sunFog: 0xfff4e6,
  },
};

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skyFrag = /* glsl */ `
  uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSun;
  uniform vec3 uCloudLit; uniform vec3 uCloudDark; uniform float uCover; uniform float uTime; uniform float uEnvPass;
  varying vec3 vDir;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float s = max(dot(d, uSunDir), 0.0);
    vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5)) : mix(uHorizon, uGround, clamp(-h * 5.0, 0.0, 1.0));
    // Mie-like glow around the sun, stronger near the horizon
    col += uSun * (pow(s, 12.0) * 0.35 + pow(s, 64.0) * 0.6) * (1.0 - 0.5 * clamp(h, 0.0, 1.0)) * (1.0 - uEnvPass * 0.8);
    if (h > 0.0) {
      vec2 p = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
      float c = fbm(p);
      float cov = smoothstep(1.0 - uCover, 1.0 - uCover + 0.35, c);
      float thick = smoothstep(1.0 - uCover + 0.1, 1.0, c);
      vec3 cc = mix(uCloudLit, uCloudDark, thick * 0.85);
      cc += uSun * pow(s, 6.0) * 0.6 * (1.0 - thick);
      float fade = smoothstep(0.0, 0.18, h);
      col = mix(col, cc, cov * fade * 0.92);
    }
    // sun disc
    col += uSun * smoothstep(0.99955, 0.9998, s) * 12.0 * (1.0 - uEnvPass);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function flareTexture(size, inner, outer, ring = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (ring) {
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0)');
    grd.addColorStop(0.85, outer);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    grd.addColorStop(0, inner);
    grd.addColorStop(0.3, outer);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export class Environment {
  constructor(scene, renderer, stage, quality) {
    const key = stage.surface === 'snow' ? 'winter' : stage.timeOfDay === 'dusk' ? 'dusk' : 'day';
    const p = (this.preset = PRESETS[key]);
    this.key = key;
    this.scene = scene;
    this.quality = quality;
    this.disposables = [];
    renderer.toneMappingExposure = p.exposure;
    const el = THREE.MathUtils.degToRad(p.elev), az = THREE.MathUtils.degToRad(p.azim);
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();

    const C = (hex) => new THREE.Color(hex);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        uTop: { value: C(p.top) }, uHorizon: { value: C(p.horizon) }, uGround: { value: C(p.ground) },
        uSunDir: { value: this.sunDir }, uSun: { value: C(p.sun) },
        uCloudLit: { value: C(p.cloudLit) }, uCloudDark: { value: C(p.cloudDark) }, uCover: { value: p.cloud }, uTime: { value: 0 }, uEnvPass: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    const skyGeo = new THREE.SphereGeometry(1, 48, 24);
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.scale.setScalar(4000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.disposables.push(skyGeo, this.skyMat);

    // image-based lighting from the same sky
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(skyGeo, this.skyMat);
    envSky.scale.setScalar(50);
    envScene.add(envSky);
    // a dim ground disc so reflections below the horizon aren't sky-bright
    const groundDisc = new THREE.Mesh(new THREE.CircleGeometry(60, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: C(p.ground).multiplyScalar(0.6) }));
    groundDisc.position.y = -2;
    envScene.add(groundDisc);
    this.skyMat.uniforms.uEnvPass.value = 1; // no sun disc in the reflections/ambient
    this.envRT = pmrem.fromScene(envScene, 0.02, 0.1, 200);
    this.skyMat.uniforms.uEnvPass.value = 0;
    pmrem.dispose();
    groundDisc.geometry.dispose();
    groundDisc.material.dispose();
    scene.environment = this.envRT.texture;
    this.envIntensity = p.envI;

    const fogFar = p.fog[1] * quality.fogScale;
    scene.fog = new THREE.Fog(p.horizon, p.fog[0] * quality.fogScale, fogFar);
    scene.background = null;
    this.fogFar = fogFar;
    SHARED.uSunFog.value.set(p.sunFog);

    this.hemi = new THREE.HemisphereLight(C(p.top).lerp(new THREE.Color(0xffffff), 0.5), C(p.ground), p.hemiI);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(p.sun, p.sunI);
    this.sun.castShadow = quality.shadows;
    if (quality.shadows) {
      this.sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
      const c = this.sun.shadow.camera;
      const r = quality.shadowRange;
      c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 500;
      this.sun.shadow.bias = -0.0003;
      this.sun.shadow.normalBias = 0.5;
      this.sun.shadow.radius = 3;
    }
    scene.add(this.sun);
    scene.add(this.sun.target);

    if (quality.lensFlare && key !== 'winter') {
      const t0 = flareTexture(256, 'rgba(255,250,235,1)', 'rgba(255,200,140,0.35)');
      const t1 = flareTexture(128, 'rgba(255,210,170,0.6)', 'rgba(255,170,120,0.15)');
      const t2 = flareTexture(256, '', 'rgba(170,200,255,0.18)', true);
      this.disposables.push(t0, t1, t2);
      const lf = new Lensflare();
      lf.addElement(new LensflareElement(t0, 380, 0, new THREE.Color(p.sun)));
      lf.addElement(new LensflareElement(t1, 70, 0.55));
      lf.addElement(new LensflareElement(t2, 160, 0.75));
      lf.addElement(new LensflareElement(t1, 110, 0.95));
      this.flare = new THREE.PointLight(0xffffff, 0, 1);
      this.flare.add(lf);
      this.lensflare = lf;
      scene.add(this.flare);
    }
  }

  /** Keep the sky centred, the shadow box on the car, fog uniforms fresh. */
  update(camera, focus, dt) {
    this.sky.position.copy(camera.position);
    this.skyMat.uniforms.uTime.value += dt;
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 250);
    this.sun.target.position.copy(focus);
    if (this.flare) this.flare.position.copy(camera.position).addScaledVector(this.sunDir, 3500);
    SHARED.uSunView.value.copy(this.sunDir).transformDirection(camera.matrixWorldInverse);
  }

  dispose() {
    this.scene.remove(this.sky, this.hemi, this.sun, this.sun.target);
    if (this.flare) { this.scene.remove(this.flare); this.lensflare.dispose(); }
    this.scene.environment = null;
    this.envRT.dispose();
    for (const d of this.disposables) d.dispose();
    this.sun.dispose();
  }
}
