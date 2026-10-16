// Sky dome, sun, ambient light and fog per stage / time of day.
import * as THREE from 'three';

const PRESETS = {
  dusk: { top: 0x2b3a6b, horizon: 0xf2a86a, ground: 0x3a2e2a, sun: 0xffb070, sunI: 2.0, hemiI: 0.75, elev: 7, azim: 245, fog: [500, 3800], exposure: 1.0 },
  day: { top: 0x3f7fd0, horizon: 0xcfe2f2, ground: 0x4a5a3a, sun: 0xfff3e0, sunI: 2.6, hemiI: 0.9, elev: 38, azim: 160, fog: [600, 4500], exposure: 1.0 },
  winter: { top: 0x8fb0d6, horizon: 0xe9eef4, ground: 0xdfe6ee, sun: 0xfff6ea, sunI: 1.7, hemiI: 1.35, elev: 12, azim: 170, fog: [350, 2600], exposure: 0.95 },
};

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const skyFrag = /* glsl */ `
  uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSun;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uGround, clamp(-h * 6.0, 0.0, 1.0));
    float s = max(dot(d, uSunDir), 0.0);
    col += uSun * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export class Environment {
  constructor(scene, renderer, stage, quality) {
    const key = stage.surface === 'snow' ? 'winter' : stage.timeOfDay === 'dusk' ? 'dusk' : 'day';
    const p = (this.preset = PRESETS[key]);
    this.scene = scene;
    renderer.toneMappingExposure = p.exposure;
    const el = THREE.MathUtils.degToRad(p.elev), az = THREE.MathUtils.degToRad(p.azim);
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();

    const lin = (hex) => new THREE.Color(hex);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        uTop: { value: lin(p.top) }, uHorizon: { value: lin(p.horizon) }, uGround: { value: lin(p.ground) },
        uSunDir: { value: this.sunDir }, uSun: { value: lin(p.sun) },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.skyMat);
    this.sky.scale.setScalar(9000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    scene.fog = new THREE.Fog(p.horizon, p.fog[0] * quality.fogScale, p.fog[1] * quality.fogScale);
    scene.background = new THREE.Color(p.horizon);

    this.hemi = new THREE.HemisphereLight(lin(p.top).lerp(new THREE.Color(0xffffff), 0.5), lin(p.ground), p.hemiI);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(p.sun, p.sunI);
    this.sun.castShadow = quality.shadows;
    if (quality.shadows) {
      this.sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
      const c = this.sun.shadow.camera;
      c.left = -55; c.right = 55; c.top = 55; c.bottom = -55; c.near = 1; c.far = 400;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.6;
    }
    scene.add(this.sun);
    scene.add(this.sun.target);
  }

  /** Keep the sky centred and the shadow box on the car. */
  update(camera, focus) {
    this.sky.position.copy(camera.position);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 200);
    this.sun.target.position.copy(focus);
  }

  dispose() {
    this.scene.remove(this.sky, this.hemi, this.sun, this.sun.target);
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    this.sun.dispose();
  }
}
