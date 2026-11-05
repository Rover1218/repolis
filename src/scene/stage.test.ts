import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createHoloUniforms } from './holo-material';
import type { Quality } from './quality';
import { createStage } from './stage';
import { unguardedPowBases } from './test-glsl';

const QUALITY: Quality = { pixelRatio: 1, shadowMapSize: 1024, bloom: true, motes: 16 };

function stageShaderSource(): string {
  const stage = createStage(10, QUALITY, createHoloUniforms());
  const sources: string[] = [];
  stage.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Points)) return;
    if (o.material instanceof THREE.ShaderMaterial) sources.push(o.material.vertexShader, o.material.fragmentShader);
  });
  stage.dispose();
  return sources.join('\n');
}

describe('unguardedPowBases', () => {
  it('flags a pow whose base can round below zero', () => {
    expect(unguardedPowBases('float a = pow(1.0 - vUv.y, 1.8);')).toEqual(['1.0 - vUv.y']);
  });

  it('accepts bases clamped with max or clamp, including nested calls', () => {
    const src = 'pow(max(1.0 - abs(dot(a, b)), 0.0), 3.0) + pow(clamp(x, 0.0, 1.0), 2.0)';
    expect(unguardedPowBases(src)).toEqual([]);
  });

  it('flags a guarded call that is then pushed back below zero', () => {
    expect(unguardedPowBases('pow(max(a, 0.0) - b, 2.0)')).toEqual(['max(a, 0.0) - b']);
  });

  it('ignores pow mentioned in comments', () => {
    expect(unguardedPowBases('// pow() of a negative\n/* pow(x, 2.0) */ float a = 1.0;')).toEqual([]);
  });
});

describe('createStage shaders', () => {
  it('keeps every pow() base non-negative, so Direct3D never renders a NaN that bloom smears into a black frame', () => {
    const source = stageShaderSource();
    expect(source).toContain('pow(');
    expect(unguardedPowBases(source)).toEqual([]);
  });
});
