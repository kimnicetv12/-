// HDR post-processing: bloom, colour grade with vignette and speed blur,
// filmic tone mapping (OutputPass) and FXAA / SMAA anti-aliasing.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSpeed: { value: 0 },
    uVignette: { value: 0.32 },
    uSaturation: { value: 1.08 },
    uContrast: { value: 1.06 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uCenter: { value: new THREE.Vector2(0.5, 0.45) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSpeed, uVignette, uSaturation, uContrast;
    uniform vec3 uTint;
    uniform vec2 uCenter;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - uCenter;
      float amt = uSpeed * 0.028 * smoothstep(0.12, 0.65, length(dir));
      vec3 col = vec3(0.0);
      for (int i = 0; i < 8; i++) col += texture2D(tDiffuse, vUv - dir * amt * (float(i) / 7.0)).rgb;
      col /= 8.0;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation) * uTint;
      col = 0.18 * pow(max(col, vec3(0.0)) / 0.18, vec3(uContrast));
      float v = smoothstep(1.0, 0.3, length((vUv - 0.5) * vec2(1.15, 1.0)));
      col *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const GRADE = {
  dusk: { sat: 1.12, con: 1.07, tint: [1.04, 0.99, 0.94], bloom: [0.4, 0.55, 1.0] },
  day: { sat: 1.1, con: 1.06, tint: [1.0, 1.0, 1.0], bloom: [0.25, 0.5, 1.6] },
  winter: { sat: 1.0, con: 1.05, tint: [0.97, 0.99, 1.04], bloom: [0.2, 0.45, 1.9] },
};

export class PostFX {
  constructor(renderer, scene, camera, quality, look = 'day') {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    const g = GRADE[look] || GRADE.day;
    if (quality.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), g.bloom[0], g.bloom[1], g.bloom[2]);
      this.composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uSaturation.value = g.sat;
    this.grade.uniforms.uContrast.value = g.con;
    this.grade.uniforms.uTint.value.setRGB(...g.tint);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    if (quality.aa === 'smaa') {
      this.smaa = new SMAAPass(size.x, size.y);
      this.composer.addPass(this.smaa);
    } else if (quality.aa === 'fxaa') {
      this.fxaa = new ShaderPass(FXAAShader);
      this.composer.addPass(this.fxaa);
    }
    this.setSize();
  }

  setSize() {
    const r = this.renderer;
    const css = r.getSize(new THREE.Vector2());
    this.composer.setPixelRatio(r.getPixelRatio());
    this.composer.setSize(css.x, css.y);
    if (this.fxaa) {
      const pr = r.getPixelRatio();
      this.fxaa.material.uniforms.resolution.value.set(1 / (css.x * pr), 1 / (css.y * pr));
    }
  }

  render(dt, speedBlur = 0) {
    this.grade.uniforms.uSpeed.value = speedBlur;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    for (const p of this.composer.passes) p.dispose?.();
  }
}
