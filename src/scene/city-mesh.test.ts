import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FOOTPRINT, type CityLayout } from '@/lib/city/layout';
import { MAX_TOWER } from '@/lib/city/height';
import { CityMesh } from './city-mesh';

/** Two buildings in two districts: #0 at x = -1, #1 at x = +1 (block "b/sub"). */
function twoBuildings(): CityLayout {
  return {
    paths: ['a/x.ts', 'b/sub/y.ts'],
    positions: new Float32Array([-1, 0, 1, 0]),
    districtIndex: new Uint16Array([0, 1]),
    districts: [
      { name: 'a', x0: -1.5, z0: -0.5, w: 1, d: 1 },
      { name: 'b', x0: 0.5, z0: -0.5, w: 1, d: 1 },
    ],
    blocks: [{ name: 'b/sub', x0: 0.5, z0: -0.5, w: 1, d: 1 }],
    radius: 2,
    halfWidth: 1.5,
    streetZ: 0,
  };
}

const f32 = (...values: number[]) => Float32Array.from(values);

function scaleOf(city: CityMesh, id: number): THREE.Vector3 {
  const m = new THREE.Matrix4();
  city.mesh.getMatrixAt(id, m);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  return scale;
}

function positionOf(city: CityMesh, id: number): THREE.Vector3 {
  const m = new THREE.Matrix4();
  city.mesh.getMatrixAt(id, m);
  return new THREE.Vector3().setFromMatrixPosition(m);
}

function rayDown(x: number, z: number): THREE.Raycaster {
  return new THREE.Raycaster(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
}

describe('CityMesh heights', () => {
  it('eases a building to its target height and hides a near-zero one', () => {
    const city = new CityMesh(twoBuildings());
    city.setTargets(f32(3, 0.01), f32(0, 0));
    city.update(5);
    expect(scaleOf(city, 0).y).toBeCloseTo(3, 6);
    expect(scaleOf(city, 0).x).toBeCloseTo(FOOTPRINT, 6);
    expect(scaleOf(city, 1).x).toBeCloseTo(1e-4, 9);
    expect(scaleOf(city, 1).z).toBeCloseTo(1e-4, 9);
  });

  it('uses k = 1 - exp(-dt * 9) for one step', () => {
    const city = new CityMesh(twoBuildings());
    city.setTargets(f32(3, 0), f32(0, 0));
    city.update(0.1);
    expect(city.heightOf(0)).toBeCloseTo(3 * (1 - Math.exp(-0.9)), 5);
  });

  it('starts every building hidden at its layout position', () => {
    const city = new CityMesh(twoBuildings());
    expect(city.heightOf(0)).toBe(0);
    expect(scaleOf(city, 0).x).toBeCloseTo(1e-4, 9);
    expect(positionOf(city, 1)).toEqual(new THREE.Vector3(1, 0, 0));
  });

  it('eases heat into the aHeat attribute', () => {
    const city = new CityMesh(twoBuildings());
    city.setTargets(f32(3, 3), f32(1, 0));
    city.update(5);
    const heat = city.mesh.geometry.getAttribute('aHeat');
    expect(heat.getX(0)).toBeCloseTo(1, 6);
    expect(heat.getX(1)).toBe(0);
  });

  it('collapses every target to 0', () => {
    const city = new CityMesh(twoBuildings());
    city.setTargets(f32(3, 2), f32(1, 1));
    city.update(5);
    city.collapse();
    city.update(5);
    expect(city.heightOf(0)).toBeCloseTo(0, 6);
    expect(city.heightOf(1)).toBeCloseTo(0, 6);
    expect(scaleOf(city, 0).x).toBeCloseTo(1e-4, 9);
  });

  it('rejects arrays of the wrong length', () => {
    const city = new CityMesh(twoBuildings());
    expect(() => city.setTargets(f32(1), f32(0, 0))).toThrow(RangeError);
    expect(() => city.setTargets(f32(1, 1), f32(0))).toThrow(RangeError);
    expect(() => city.startConstruction(f32(0))).toThrow(RangeError);
  });

  it('returns 0 for an unknown building id', () => {
    expect(new CityMesh(twoBuildings()).heightOf(7)).toBe(0);
  });

  it('ignores a negative or non-finite dt', () => {
    const city = new CityMesh(twoBuildings());
    city.setTargets(f32(3, 3), f32(0, 0));
    city.update(-1);
    city.update(Number.NaN);
    expect(city.heightOf(0)).toBe(0);
  });
});

describe('CityMesh construction wave', () => {
  it('holds a building at 0 until its delay has passed', () => {
    const city = new CityMesh(twoBuildings());
    city.startConstruction(f32(0, 2));
    city.setTargets(f32(3, 3), f32(0, 0));
    city.update(1);
    expect(city.heightOf(1)).toBe(0);
    expect(city.heightOf(0)).toBeGreaterThan(2.9);
    city.update(2);
    city.update(5);
    expect(city.heightOf(1)).toBeCloseTo(3, 6);
  });

  it('a new wave restarts the clock', () => {
    const city = new CityMesh(twoBuildings());
    city.setTargets(f32(3, 3), f32(0, 0));
    city.update(5);
    city.collapse();
    city.update(5);
    city.startConstruction(f32(1, 1));
    city.setTargets(f32(3, 3), f32(0, 0));
    city.update(0.5);
    expect(city.heightOf(0)).toBe(0);
    city.update(5);
    expect(city.heightOf(0)).toBeCloseTo(3, 6);
  });
});

describe('CityMesh tops', () => {
  it('reports the current max height per district and overall', () => {
    const city = new CityMesh(twoBuildings());
    city.setTargets(f32(3, 1.5), f32(0, 0));
    city.update(5);
    expect(Array.from(city.maxHeightPerDistrict())).toEqual([3, 1.5]);
    expect(city.maxHeight()).toBeCloseTo(3, 6);
  });

  it('reports the current max height per sub-folder block', () => {
    const city = new CityMesh(twoBuildings());
    city.setTargets(f32(3, 1.5), f32(0, 0));
    city.update(5);
    expect(Array.from(city.maxHeightPerBlock())).toEqual([1.5]);
  });
});

describe('CityMesh picking', () => {
  it('picks a visible building under the ray', () => {
    const city = new CityMesh(twoBuildings());
    city.setTargets(f32(3, 0.01), f32(0, 0));
    city.update(5);
    expect(city.pick(rayDown(-1, 0))).toBe(0);
  });

  it('returns null for a ray through a hidden building', () => {
    const city = new CityMesh(twoBuildings());
    city.setTargets(f32(3, 0.01), f32(0, 0));
    city.update(5);
    expect(city.pick(rayDown(1, 0))).toBeNull();
  });

  it('looks past a hidden building to a visible one behind it', () => {
    const city = new CityMesh(twoBuildings());
    city.setTargets(f32(3, 0.01), f32(0, 0));
    city.update(5);
    const ray = new THREE.Raycaster(new THREE.Vector3(5, 0.005, 0), new THREE.Vector3(-1, 0, 0));
    expect(city.pick(ray)).toBe(0);
  });
});

describe('CityMesh mesh setup and lifecycle', () => {
  it('keeps a fixed bounding sphere covering the tallest possible tower', () => {
    const city = new CityMesh(twoBuildings());
    expect(city.mesh.frustumCulled).toBe(false);
    expect(city.mesh.castShadow).toBe(true);
    expect(city.mesh.receiveShadow).toBe(true);
    const sphere = city.mesh.boundingSphere;
    expect(sphere).not.toBeNull();
    expect(sphere!.containsPoint(new THREE.Vector3(2, MAX_TOWER + 0.2, 0))).toBe(true);
    expect(sphere!.containsPoint(new THREE.Vector3(-2, 0, 0))).toBe(true);
  });

  it('stops uploading matrices once every building has settled', () => {
    const city = new CityMesh(twoBuildings());
    city.setTargets(f32(3, 1), f32(0, 0));
    city.update(5);
    const version = city.mesh.instanceMatrix.version;
    city.update(0.016);
    city.update(0.016);
    expect(city.mesh.instanceMatrix.version).toBe(version);
    expect(city.isSettled()).toBe(true);
    city.setTargets(f32(1, 1), f32(0, 0));
    expect(city.isSettled()).toBe(false);
    city.update(0.016);
    expect(city.mesh.instanceMatrix.version).toBeGreaterThan(version);
  });

  it('uses a given shared material and leaves it alive on dispose', () => {
    const shared = new THREE.MeshStandardMaterial();
    const onDispose = vi.fn();
    shared.addEventListener('dispose', onDispose);
    const city = new CityMesh(twoBuildings(), shared);
    expect(city.mesh.material).toBe(shared);
    city.dispose();
    expect(onDispose).not.toHaveBeenCalled();
  });

  it('disposes its geometry, own material and leaves its parent', () => {
    const parent = new THREE.Group();
    const city = new CityMesh(twoBuildings());
    parent.add(city.mesh);
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    city.mesh.geometry.addEventListener('dispose', geometryDisposed);
    (city.mesh.material as THREE.Material).addEventListener('dispose', materialDisposed);
    city.dispose();
    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    expect(parent.children).toHaveLength(0);
  });

  it('handles an empty layout', () => {
    const empty: CityLayout = {
      ...twoBuildings(),
      paths: [],
      positions: new Float32Array(0),
      districtIndex: new Uint16Array(0),
      districts: [],
      blocks: [],
    };
    const city = new CityMesh(empty);
    city.setTargets(f32(), f32());
    city.update(1);
    expect(city.maxHeight()).toBe(0);
    expect(city.pick(rayDown(0, 0))).toBeNull();
  });
});
