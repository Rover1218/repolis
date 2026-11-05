import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBuildingMaterial, createHoloUniforms } from './holo-material';
import { SOLID_LIGHT } from './style';
import { unguardedPowBases } from './test-glsl';

const { vertexShader, fragmentShader } = THREE.ShaderLib.standard;

function compile(material: THREE.Material) {
  const shader = { uniforms: {}, vertexShader, fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe('three standard shader injection points', () => {
  it('still has the vertex chunks the hologram hooks into', () => {
    expect(vertexShader).toContain('#include <project_vertex>');
    expect(vertexShader).toContain('#include <common>');
  });

  it('still has the fragment chunks the hologram hooks into', () => {
    expect(fragmentShader).toContain('#include <color_fragment>');
    expect(fragmentShader).toContain('#include <emissivemap_fragment>');
  });
});

describe('createBuildingMaterial', () => {
  it('patches the vertex shader with the instance attributes and varyings', () => {
    const shader = compile(createBuildingMaterial(createHoloUniforms()));
    expect(shader.vertexShader).toContain('attribute float aHeat');
    expect(shader.vertexShader).toContain('attribute float aSeed');
    expect(shader.vertexShader).toContain('vHeat = aHeat;');
  });

  it('patches the fragment shader with the contact shadow and the emissive glow', () => {
    const shader = compile(createBuildingMaterial(createHoloUniforms()));
    expect(shader.fragmentShader).toContain('diffuseColor.rgb *= mix(0.35, 1.0');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance +=');
    expect(shader.fragmentShader).toContain('uniform float uTop;');
  });

  it('keeps every pow() base non-negative, so Direct3D never renders a NaN that bloom smears into a black frame', () => {
    const shader = compile(createBuildingMaterial(createHoloUniforms()));
    expect(shader.fragmentShader).toContain('pow(');
    expect(unguardedPowBases(shader.fragmentShader)).toEqual([]);
  });

  it('keeps the change heat glow at 0.7 so small repos do not wash out (R36)', () => {
    const shader = compile(createBuildingMaterial(createHoloUniforms()));
    expect(shader.fragmentShader).toContain('uHot * vHeat * 0.7');
  });

  it('shares the uniform objects so per-frame updates reach the shader', () => {
    const u = createHoloUniforms();
    const shader = compile(createBuildingMaterial(u));
    expect(shader.uniforms.uTime).toBe(u.uTime);
    expect(shader.uniforms.uTop).toBe(u.uTop);
    expect(shader.uniforms.uColA).toBe(u.uColA);
  });

  it('uses the look B body surface', () => {
    const m = createBuildingMaterial(createHoloUniforms());
    expect(m.color.equals(new THREE.Color(SOLID_LIGHT.body))).toBe(true);
    expect(m.roughness).toBe(0.18);
    expect(m.metalness).toBe(0.55);
    expect(m.envMapIntensity).toBe(1);
  });
});

describe('createHoloUniforms', () => {
  it('starts on look B colours with style 1', () => {
    const u = createHoloUniforms();
    expect(u.uStyle.value).toBe(1);
    expect(u.uTime.value).toBe(0);
    expect(u.uTop.value).toBe(1);
    expect(u.uColA.value.equals(new THREE.Color('#5b6cff'))).toBe(true);
    expect(u.uColB.value.equals(new THREE.Color('#ff5ad6'))).toBe(true);
    expect(u.uHot.value.equals(new THREE.Color('#ffd84d'))).toBe(true);
  });

  it('returns independent uniform objects on each call', () => {
    const a = createHoloUniforms();
    const b = createHoloUniforms();
    a.uTime.value = 5;
    expect(b.uTime.value).toBe(0);
    expect(a.uColA.value).not.toBe(b.uColA.value);
  });
});
