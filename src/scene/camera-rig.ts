import * as THREE from 'three';

export interface Pose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

/** Minimal structural subset of OrbitControls. */
export interface RigControls {
  target: THREE.Vector3;
  update(): void;
  enabled: boolean;
}

export interface RigBounds {
  radius: number;
  halfWidth: number;
  streetZ: number;
}

export interface TapSample {
  t: number;
  x: number;
  y: number;
}

interface Flight {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  t: number;
  duration: number;
}

const INTRO_SECONDS = 2.6;
const DIVE_SECONDS = 2.2;
const STEP_OUT_SECONDS = 1.8;
const BUILDING_SECONDS = 1.4;
const ARC_LIFT = 0.12;
const BUILDING_STANDOFF = 2.6;
const BUILDING_EYE_MAX = 2.2;
const INSIDE_MAX_Y = 3.2;
const INSIDE_MARGIN = 3;
const WALK_SPEED_FACTOR = 0.9;
const WALK_SPEED_MIN = 2.5;
const WALK_SPEED_MAX = 20;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 20;
/** The prototype's overview direction, normalised on first use. */
const OVERVIEW_DIRECTION = new THREE.Vector3(1.25, 0.95, 1.45).normalize();
/** The framed circle is the stage disc plus a little breathing room. */
const FIT_MARGIN = 2;
/** The intro starts this many times farther out than the overview. */
const INTRO_DISTANCE_FACTOR = 2.4;
const WALK_KEYS = ['w', 'a', 's', 'd', 'q', 'e'];

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function isDoubleTap(prev: TapSample | null, next: TapSample): boolean {
  if (!prev) return false;
  return next.t - prev.t <= DOUBLE_TAP_MS && Math.hypot(next.x - prev.x, next.y - prev.y) <= DOUBLE_TAP_PX;
}

export class CameraRig {
  private bounds: RigBounds = { radius: 10, halfWidth: 5, streetZ: 0 };
  private aspect = 1;
  private flight: Flight | null = null;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly move = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly controls: RigControls,
    private readonly opts: { reducedMotion: boolean },
  ) {}

  setBounds(b: RigBounds): void {
    this.bounds = { ...b };
  }

  /** The viewport's width / height; the overview distance fits the city to both FOVs. */
  setAspect(aspect: number): void {
    if (Number.isFinite(aspect) && aspect > 0) this.aspect = aspect;
  }

  /** Distance from the overview target at which the stage disc fits both FOVs. */
  fitDistance(): number {
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.aspect);
    return (this.bounds.radius + FIT_MARGIN) / Math.sin(Math.min(vFov, hFov) / 2);
  }

  overview(): Pose {
    const target = new THREE.Vector3(0, -this.bounds.radius * 0.12, 0);
    const pos = OVERVIEW_DIRECTION.clone().multiplyScalar(this.fitDistance()).add(target);
    return { pos, target };
  }

  street(): Pose {
    const { halfWidth, streetZ } = this.bounds;
    return {
      pos: new THREE.Vector3(-halfWidth - 1.2, 0.7, streetZ),
      target: new THREE.Vector3(-halfWidth + 8, 1.8, streetZ),
    };
  }

  intro(): void {
    const end = this.overview();
    this.camera.position.copy(end.pos).sub(end.target).multiplyScalar(INTRO_DISTANCE_FACTOR).add(end.target);
    this.controls.target.copy(end.target);
    this.flyTo(end, INTRO_SECONDS);
  }

  flyTo(pose: Pose, seconds: number): void {
    this.flight = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      pos: pose.pos.clone(),
      target: pose.target.clone(),
      t: 0,
      duration: Math.max(seconds, 1e-6),
    };
    this.controls.enabled = false;
  }

  diveIn(): void {
    this.flyTo(this.street(), DIVE_SECONDS);
  }

  stepOut(): void {
    this.flyTo(this.overview(), STEP_OUT_SECONDS);
  }

  flyToBuilding(x: number, z: number, height: number): void {
    const away = new THREE.Vector3(this.camera.position.x - x, 0, this.camera.position.z - z);
    if (away.lengthSq() < 1e-4) away.set(1, 0, 1);
    away.normalize().multiplyScalar(BUILDING_STANDOFF);
    this.flyTo(
      {
        pos: new THREE.Vector3(x + away.x, Math.min(height * 0.4 + 0.5, BUILDING_EYE_MAX), z + away.z),
        target: new THREE.Vector3(x, height * 0.55, z),
      },
      BUILDING_SECONDS,
    );
  }

  isInside(): boolean {
    const { x, y, z } = this.camera.position;
    return y < INSIDE_MAX_Y && Math.hypot(x, z) < this.bounds.radius + INSIDE_MARGIN;
  }

  walk(keys: ReadonlySet<string>, dt: number): void {
    if (this.flight || !WALK_KEYS.some((k) => keys.has(k))) return;
    const { forward, right, move } = this;
    forward.subVectors(this.controls.target, this.camera.position).setY(0);
    if (forward.lengthSq() < 1e-6) return;
    forward.normalize();
    right.crossVectors(forward, this.camera.up).normalize();
    move.set(0, 0, 0);
    if (keys.has('w')) move.add(forward);
    if (keys.has('s')) move.sub(forward);
    if (keys.has('d')) move.add(right);
    if (keys.has('a')) move.sub(right);
    if (keys.has('e')) move.y += 1;
    if (keys.has('q')) move.y -= 1;
    if (move.lengthSq() === 0) return;
    const speed = THREE.MathUtils.clamp(
      this.camera.position.distanceTo(this.controls.target) * WALK_SPEED_FACTOR,
      WALK_SPEED_MIN,
      WALK_SPEED_MAX,
    );
    move.normalize().multiplyScalar(speed * dt);
    this.camera.position.add(move);
    this.controls.target.add(move);
  }

  cancel(): void {
    this.flight = null;
    this.controls.enabled = true;
  }

  update(dt: number): void {
    const f = this.flight;
    if (f) {
      f.t = this.opts.reducedMotion ? 1 : Math.min(1, f.t + dt / f.duration);
      const e = easeInOutCubic(f.t);
      this.camera.position.lerpVectors(f.fromPos, f.pos, e);
      this.camera.position.y += Math.sin(e * Math.PI) * ARC_LIFT * f.fromPos.distanceTo(f.pos);
      this.controls.target.lerpVectors(f.fromTarget, f.target, e);
      if (f.t >= 1) this.cancel();
    }
    this.controls.update();
  }
}
