// Shader patches for three.js built-in PBR materials:
//  * atmospheric fog with sun in-scattering and valley haze (all world materials)
//  * terrain: world-space detail albedo + normal maps, triplanar rock on slopes
//  * foliage: wind sway for instanced trees / grass
import * as THREE from 'three';

export const SHARED = {
  uSunView: { value: new THREE.Vector3(0, 1, 0) },
  uSunFog: { value: new THREE.Color(1, 0.85, 0.7) },
  uHazeBase: { value: 0 },
  uTime: { value: 0 },
  uWind: { value: 1 },
};

const FOG_PARS_V = /* glsl */ `#include <fog_pars_vertex>
varying vec3 vViewPosF;`;
const FOG_V = /* glsl */ `#include <fog_vertex>
vViewPosF = mvPosition.xyz;`;
const FOG_PARS_F = /* glsl */ `#include <fog_pars_fragment>
varying vec3 vViewPosF;
uniform vec3 uSunView;
uniform vec3 uSunFog;
uniform float uHazeBase;`;
const FOG_F = /* glsl */ `#ifdef USE_FOG
  float fogD = max(0.0, vFogDepth - fogNear);
  float fogK = 2.2 / max(1.0, fogFar - fogNear);
  // denser haze low in the valleys
  float worldY = cameraPosition.y + (vec4(vViewPosF, 0.0) * viewMatrix).y;
  float hz = mix(1.35, 0.75, smoothstep(uHazeBase, uHazeBase + 450.0, worldY));
  float fogFactor = 1.0 - exp(-pow(fogD * fogK * hz, 1.6));
  float sunAmt = pow(max(dot(normalize(vViewPosF), uSunView), 0.0), 7.0);
  vec3 fogCol = mix(fogColor, uSunFog, sunAmt * 0.9);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, clamp(fogFactor, 0.0, 1.0));
#endif`;

function applyFog(shader) {
  shader.uniforms.uSunView = SHARED.uSunView;
  shader.uniforms.uSunFog = SHARED.uSunFog;
  shader.uniforms.uHazeBase = SHARED.uHazeBase;
  shader.vertexShader = shader.vertexShader.replace('#include <fog_pars_vertex>', FOG_PARS_V).replace('#include <fog_vertex>', FOG_V);
  shader.fragmentShader = shader.fragmentShader.replace('#include <fog_pars_fragment>', FOG_PARS_F).replace('#include <fog_fragment>', FOG_F);
}

/** Atmospheric fog only. */
export function atmosphere(material, key = 'atm') {
  material.onBeforeCompile = (shader) => applyFog(shader);
  material.customProgramCacheKey = () => key;
  return material;
}

/** Wind sway for instanced foliage (amount grows with height above base). */
export function foliage(material, { sway = 0.05, from = 1.5, key = 'foliage' } = {}) {
  material.onBeforeCompile = (shader) => {
    applyFog(shader);
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uWind = SHARED.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = ip.x * 0.11 + ip.z * 0.07;
        float h = max(0.0, position.y - ${from.toFixed(2)});
        float w = (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25) * uWind;
        transformed.x += w * h * ${sway.toFixed(3)};
        transformed.z += w * h * ${(sway * 0.6).toFixed(3)};`);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

/** Terrain: detail textures, world-space normal perturbation, rock on slopes. */
export function terrainMaterial(textures, { snow = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: snow ? 0.78 : 0.96, metalness: 0 });
  mat.userData.envScale = snow ? 0.3 : 0.15;
  mat.onBeforeCompile = (shader) => {
    applyFog(shader);
    shader.uniforms.uGround = { value: textures.ground };
    shader.uniforms.uGroundN = { value: textures.groundN };
    shader.uniforms.uRock = { value: textures.rock };
    shader.uniforms.uRockN = { value: textures.rockN };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNrm;
        uniform sampler2D uGround;
        uniform sampler2D uGroundN;
        uniform sampler2D uRock;
        uniform sampler2D uRockN;
        vec3 triW(vec3 n) { vec3 b = pow(abs(n), vec3(4.0)); return b / (b.x + b.y + b.z); }`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec3 tn = normalize(vWNrm);
        float rockAmt = smoothstep(0.84, 0.62, tn.y);
        vec2 uvA = vWPos.xz / 4.5;
        vec2 uvB = vWPos.xz / 29.0 + vec2(0.37, 0.71);
        float gd = texture2D(uGround, uvA).r * 1.25 + texture2D(uGround, uvB).r * 0.75;
        vec3 tw = triW(tn);
        float rd = texture2D(uRock, vWPos.zy / 6.0).r * tw.x + texture2D(uRock, vWPos.xz / 6.0).r * tw.y + texture2D(uRock, vWPos.xy / 6.0).r * tw.z;
        float detail = mix(gd, rd * 2.1, rockAmt);
        // break up large-scale tiling with a low-frequency tone shift
        float macro = texture2D(uGround, vWPos.xz / 410.0).r;
        diffuseColor.rgb *= detail * (0.82 + macro * 0.36);`)
      .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
        {
          vec3 g = texture2D(uGroundN, uvA).xyz * 2.0 - 1.0;
          vec3 r1 = texture2D(uRockN, vWPos.zy / 6.0).xyz * 2.0 - 1.0;
          vec3 r2 = texture2D(uRockN, vWPos.xz / 6.0).xyz * 2.0 - 1.0;
          vec3 r3 = texture2D(uRockN, vWPos.xy / 6.0).xyz * 2.0 - 1.0;
          vec3 pg = vec3(g.x, 0.0, g.y) * 0.55;
          vec3 pr = vec3(0.0, r1.y, r1.x) * tw.x + vec3(r2.x, 0.0, r2.y) * tw.y + vec3(r3.x, r3.y, 0.0) * tw.z;
          vec3 nW = normalize(tn + mix(pg, pr * 1.1, rockAmt));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.82, rockAmt);`);
  };
  mat.customProgramCacheKey = () => 'terrain' + (snow ? 's' : '');
  return mat;
}
