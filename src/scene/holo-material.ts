import * as THREE from 'three';
import { SOLID_LIGHT } from './style';

// Hologram effects are injected into MeshStandardMaterial so buildings keep real lighting + shadows.
// Shader strings are ported from the look prototype (L250–297); the heat term is halved to 0.7 (R36).
const HOLO_DECLS = /* glsl */ `
  uniform float uTime;
  uniform int uStyle;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uHot;
  uniform float uTop;
  varying vec2 vBoxUv;
  varying vec3 vWPos;
  varying vec3 vWNormal;
  varying float vHeat;
  varying float vSeed;`;

const HOLO_VERTEX = /* glsl */ `
  mat4 instWorld = modelMatrix * instanceMatrix;
  vWPos = (instWorld * vec4(transformed, 1.0)).xyz;
  vWNormal = normalize(mat3(instWorld) * objectNormal);
  vBoxUv = uv;
  vHeat = aHeat;
  vSeed = aSeed;`;

const HOLO_CONTACT_SHADOW = /* glsl */ `
  diffuseColor.rgb *= mix(0.35, 1.0, smoothstep(0.0, 1.4, vWPos.y));`;

const HOLO_EMISSIVE = /* glsl */ `
  {
    float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
    vec2 edgeDist = min(vBoxUv, 1.0 - vBoxUv) / max(fwidth(vBoxUv), vec2(1e-5));
    float edge = 1.0 - smoothstep(0.5, 1.6, min(edgeDist.x, edgeDist.y));
    float rise = clamp(vWPos.y / max(uTop, 0.1), 0.0, 1.0);
    vec3 tint = mix(uColA, uColB, rise);
    float isRoof = step(0.9, vWNormal.y);
    float scan = smoothstep(0.6, 1.0, sin(vWPos.y * 24.0 - uTime * 3.0)) * (1.0 - isRoof);
    float sweep = smoothstep(0.965, 1.0, fract(vWPos.y * 0.07 - uTime * 0.12));
    float glitch = step(0.985, fract(sin(floor(uTime * 9.0) * 12.9898 + vSeed * 78.233) * 43758.5453));
    float glow;
    if (uStyle == 0) {
      glow = edge * 1.8 + scan * 0.08 + fres * 0.3 + sweep * 0.5;
    } else if (uStyle == 1) {
      glow = edge * 1.0 + fres * 0.8 + isRoof * 0.18 + sweep * 0.3;
    } else {
      float slice = smoothstep(0.88, 1.0, fract(vWPos.y * 2.5)) * (1.0 - isRoof);
      glow = slice * 1.5 + edge * 1.0 + fres * 0.2 + sweep * 0.4;
    }
    totalEmissiveRadiance += (tint * glow + uHot * vHeat * 0.7) * (1.0 - 0.5 * glitch);
  }`;

export type HoloUniforms = {
  uTime: { value: number };
  uStyle: { value: number };
  uColA: { value: THREE.Color };
  uColB: { value: THREE.Color };
  uHot: { value: THREE.Color };
  uTop: { value: number };
};

export function createHoloUniforms(): HoloUniforms {
  return {
    uTime: { value: 0 },
    uStyle: { value: SOLID_LIGHT.id },
    uColA: { value: new THREE.Color(SOLID_LIGHT.a) },
    uColB: { value: new THREE.Color(SOLID_LIGHT.b) },
    uHot: { value: new THREE.Color(SOLID_LIGHT.hot) },
    uTop: { value: 1 },
  };
}

/** The building surface: look B standard material with the hologram glow injected. */
export function createBuildingMaterial(u: HoloUniforms): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: SOLID_LIGHT.body,
    roughness: SOLID_LIGHT.rough,
    metalness: SOLID_LIGHT.metal,
    envMapIntensity: SOLID_LIGHT.env,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aHeat;\nattribute float aSeed;\n${HOLO_DECLS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${HOLO_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HOLO_DECLS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${HOLO_CONTACT_SHADOW}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${HOLO_EMISSIVE}`);
  };
  return material;
}
