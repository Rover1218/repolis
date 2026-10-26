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

  it('intro starts farther out than the overview and ends at it', () => {
    const { camera, controls, rig } = setup();
    rig.intro();
    const overview = rig.overview();
    const startDistance = camera.position.distanceTo(overview.target);
    expect(startDistance).toBeGreaterThan(overview.pos.distanceTo(overview.target) * 1.5);
    expect(controls.target.distanceTo(overview.target)).toBeLessThan(1e-9);
    rig.update(3);
    expect(camera.position.distanceTo(overview.pos)).toBeLessThan(1e-6);
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

describe('CameraRig overview framing (R29)', () => {
  const distance = (rig: CameraRig): number => {
    const { pos, target } = rig.overview();
    return pos.distanceTo(target);
  };
  const horizontalHalfFov = (camera: THREE.PerspectiveCamera, aspect: number): number =>
    Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * aspect);

  it('pulls back for a portrait aspect', () => {
    const { rig } = setup();
    rig.setAspect(1.6);
    const wide = distance(rig);
    rig.setAspect(0.46);
    expect(distance(rig)).toBeGreaterThan(wide);
  });

  it('fits the bounding circle inside the horizontal FOV at aspect 0.46', () => {
    const { camera, rig } = setup();
    camera.fov = 50;
    rig.setAspect(0.46);
    const half = horizontalHalfFov(camera, 0.46);
    expect(distance(rig) * Math.sin(half)).toBeGreaterThanOrEqual(BOUNDS.radius + 2 - 1e-6);
  });

  it('fits the bounding circle inside the vertical FOV on a wide screen', () => {
    const { camera, rig } = setup();
    camera.fov = 50;
    rig.setAspect(1.6);
    const half = THREE.MathUtils.degToRad(camera.fov) / 2;
    expect(distance(rig) * Math.sin(half)).toBeGreaterThanOrEqual(BOUNDS.radius + 2 - 1e-6);
  });

  it('keeps the prototype direction and target', () => {
    const { rig } = setup();
    rig.setAspect(0.46);
    const { pos, target } = rig.overview();
    expect(target.toArray()).toEqual([0, -BOUNDS.radius * 0.12, 0]);
    const dir = pos.clone().sub(target).normalize();
    const proto = new THREE.Vector3(1.25, 0.95, 1.45).normalize();
    expect(dir.distanceTo(proto)).toBeLessThan(1e-9);
  });

  it('exposes the fit distance for the controls limit', () => {
    const { rig } = setup();
    rig.setAspect(0.46);
    expect(rig.fitDistance()).toBeCloseTo(distance(rig), 9);
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
