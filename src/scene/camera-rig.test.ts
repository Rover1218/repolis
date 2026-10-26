import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig, isDoubleTap, type Pose, type RigControls } from './camera-rig';

const BOUNDS = { radius: 10, halfWidth: 5, streetZ: 2 };

function setup(reducedMotion = false) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 0);
  const controls: RigControls = { target: new THREE.Vector3(0, 0, -5), update() {}, enabled: true };
  const rig = new CameraRig(camera, controls, { reducedMotion });
  rig.setBounds(BOUNDS);
  return { camera, controls, rig };
}

const pose: Pose = { pos: new THREE.Vector3(10, 4, -6), target: new THREE.Vector3(1, 2, 3) };

describe('CameraRig flights', () => {
  it('arrives at the pose after the full duration', () => {
    const { camera, controls, rig } = setup();
    rig.flyTo(pose, 2);
    for (let i = 0; i < 200; i++) rig.update(0.01);
    expect(camera.position.distanceTo(pose.pos)).toBeLessThan(1e-6);
    expect(controls.target.distanceTo(pose.target)).toBeLessThan(1e-6);
    expect(controls.enabled).toBe(true);
  });

  it('lifts above the straight line midpoint at 1 s', () => {
    const { camera, rig } = setup();
    rig.flyTo(pose, 2);
    for (let i = 0; i < 100; i++) rig.update(0.01);
    expect(camera.position.y).toBeGreaterThan(pose.pos.y / 2);
  });

  it('disables controls during a flight', () => {
    const { controls, rig } = setup();
    rig.flyTo(pose, 2);
    rig.update(0.1);
    expect(controls.enabled).toBe(false);
  });

  it('arrives on the first update with reduced motion', () => {
    const { camera, rig } = setup(true);
    rig.flyTo(pose, 2);
    rig.update(0.016);
    expect(camera.position.distanceTo(pose.pos)).toBeLessThan(1e-6);
  });

  it('does not mutate the passed-in pose', () => {
    const { rig } = setup();
    const p: Pose = { pos: new THREE.Vector3(1, 2, 3), target: new THREE.Vector3() };
    rig.flyTo(p, 1);
    rig.update(0.5);
    expect(p.pos.toArray()).toEqual([1, 2, 3]);
  });

  it('dives in to street level and steps out again', () => {
    const { rig } = setup();
    rig.diveIn();
    rig.update(3);
    expect(rig.isInside()).toBe(true);
    rig.stepOut();
    rig.update(2);
    expect(rig.isInside()).toBe(false);
  });

  it('intro starts far out and ends at the overview', () => {
    const { camera, rig } = setup();
    rig.intro();
    expect(camera.position.toArray()).toEqual([30, 24, 34]);
    rig.update(3);
    expect(camera.position.distanceTo(rig.overview().pos)).toBeLessThan(1e-6);
  });

  it('flies to a building at street height', () => {
    const { camera, controls, rig } = setup();
    rig.flyToBuilding(4, 4, 20);
    rig.update(2);
    expect(camera.position.y).toBeCloseTo(2.2, 6);
    expect(controls.target.toArray()).toEqual([4, 11, 4]);
    expect(Math.hypot(camera.position.x - 4, camera.position.z - 4)).toBeCloseTo(2.6, 6);
  });

  it('cancel stops a flight and re-enables controls', () => {
    const { camera, controls, rig } = setup();
    rig.flyTo(pose, 2);
    rig.update(0.5);
    const frozen = camera.position.clone();
    rig.cancel();
    rig.update(1);
    expect(camera.position.distanceTo(frozen)).toBe(0);
    expect(controls.enabled).toBe(true);
  });
});

describe('CameraRig walk', () => {
  it('moves camera and target by the same horizontal vector', () => {
    const { camera, controls, rig } = setup();
    const c0 = camera.position.clone();
    const t0 = controls.target.clone();
    rig.walk(new Set(['w']), 1);
    const dc = camera.position.clone().sub(c0);
    const dt = controls.target.clone().sub(t0);
    expect(dc.length()).toBeGreaterThan(0);
    expect(dc.distanceTo(dt)).toBeLessThan(1e-9);
    expect(dc.y).toBe(0);
  });

  it('is ignored during a flight', () => {
    const { camera, rig } = setup();
    rig.flyTo(pose, 2);
    const before = camera.position.clone();
    rig.walk(new Set(['w']), 1);
    expect(camera.position.equals(before)).toBe(true);
  });

  it('q and e move vertically', () => {
    const { camera, rig } = setup();
    rig.walk(new Set(['e']), 1);
    expect(camera.position.y).toBeGreaterThan(0);
  });
});

describe('isDoubleTap', () => {
  const a = { t: 0, x: 0, y: 0 };
  it('is true for quick nearby taps', () => expect(isDoubleTap(a, { t: 250, x: 5, y: 5 })).toBe(true));
  it('is false when too slow', () => expect(isDoubleTap(a, { t: 400, x: 0, y: 0 })).toBe(false));
  it('is false when too far apart', () => expect(isDoubleTap(a, { t: 100, x: 40, y: 0 })).toBe(false));
  it('is false with no previous tap', () => expect(isDoubleTap(null, a)).toBe(false));
});
