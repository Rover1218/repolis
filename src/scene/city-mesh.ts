import * as THREE from 'three';
import { MAX_TOWER } from '@/lib/city/height';
import { FOOTPRINT, type CityLayout, type DistrictBox } from '@/lib/city/layout';
import { mulberry32 } from './random';

/** Easing rate: each step moves `k = 1 - exp(-dt * EASE_RATE)` of the way to the target. */
export const EASE_RATE = 9;
/** Buildings at or below this height are hidden (and never picked). */
export const HIDDEN_HEIGHT = 0.02;

const HIDDEN_SCALE = 1e-4;
const SETTLE_EPS = 1e-4;
const SEED = 7;
/** Tallest building (heightFor caps the tower at MAX_TOWER above a 0.2 base) plus slack. */
const TOP_SLACK = 1;
const MATRIX_STRIDE = 16;

const approach = (current: number, target: number, k: number): number => {
  const next = current + (target - current) * k;
  return Math.abs(target - next) < SETTLE_EPS ? target : next;
};

const contains = (box: DistrictBox, x: number, z: number): boolean =>
  x >= box.x0 && x <= box.x0 + box.w && z >= box.z0 && z <= box.z0 + box.d;

/** Index into `layout.blocks` for each building, or -1 when it sits directly in its district. */
function assignBlocks(layout: CityLayout): Int32Array {
  const blockOf = new Int32Array(layout.paths.length).fill(-1);
  if (layout.blocks.length === 0) return blockOf;
  const byDistrict: number[][] = layout.districts.map(() => []);
  layout.blocks.forEach((b, bi) => {
    const d = layout.districts.findIndex((box) => contains(box, b.x0 + b.w / 2, b.z0 + b.d / 2));
    if (d >= 0) byDistrict[d].push(bi);
  });
  for (let i = 0; i < blockOf.length; i += 1) {
    const x = layout.positions[2 * i];
    const z = layout.positions[2 * i + 1];
    const candidates = byDistrict[layout.districtIndex[i]] ?? [];
    const hit = candidates.find((bi) => contains(layout.blocks[bi], x, z));
    if (hit !== undefined) blockOf[i] = hit;
  }
  return blockOf;
}

function sanitizeInto(target: Float32Array, source: Float32Array): void {
  for (let i = 0; i < target.length; i += 1) {
    const v = source[i];
    target[i] = Number.isFinite(v) && v > 0 ? v : 0;
  }
}

/** One instanced box per file; heights and heat ease toward their targets each frame. */
export class CityMesh {
  readonly mesh: THREE.InstancedMesh;

  private readonly count: number;
  private readonly districtIndex: Uint16Array;
  private readonly blockOf: Int32Array;
  private readonly heights: Float32Array;
  private readonly targets: Float32Array;
  private readonly heat: Float32Array;
  private readonly heatTargets: Float32Array;
  private readonly heatAttr: THREE.InstancedBufferAttribute;
  private readonly districtTop: Float32Array;
  private readonly blockTop: Float32Array;
  private readonly ownsMaterial: boolean;
  private readonly hits: THREE.Intersection[] = [];
  private delays: Float32Array | null = null;
  private maxDelay = 0;
  private clock = 0;
  private top = 0;
  private settled = false;

  constructor(layout: CityLayout, material?: THREE.Material) {
    const count = layout.paths.length;
    this.count = count;
    this.districtIndex = layout.districtIndex;
    this.blockOf = assignBlocks(layout);
    this.heights = new Float32Array(count);
    this.targets = new Float32Array(count);
    this.heat = new Float32Array(count);
    this.heatTargets = new Float32Array(count);
    this.districtTop = new Float32Array(layout.districts.length);
    this.blockTop = new Float32Array(layout.blocks.length);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    this.heatAttr = new THREE.InstancedBufferAttribute(this.heat, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aHeat', this.heatAttr);
    const rand = mulberry32(SEED);
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, rand), 1));

    this.ownsMaterial = material === undefined;
    this.mesh = new THREE.InstancedMesh(geometry, material ?? new THREE.MeshStandardMaterial(), count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    const half = (MAX_TOWER + TOP_SLACK) / 2;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, half, 0), Math.hypot(layout.radius, half) + TOP_SLACK);
    this.placeAll(layout.positions);
  }

  setTargets(heights: Float32Array, heat: Float32Array): void {
    this.checkLength(heights, 'heights');
    this.checkLength(heat, 'heat');
    sanitizeInto(this.targets, heights);
    sanitizeInto(this.heatTargets, heat);
    this.settled = false;
  }

  /** Building i keeps height 0 until `delays[i]` seconds have passed since this call. */
  startConstruction(delays: Float32Array): void {
    this.checkLength(delays, 'delays');
    this.delays = Float32Array.from(delays);
    this.maxDelay = this.delays.reduce((m, d) => Math.max(m, d), 0);
    this.clock = 0;
    this.settled = false;
  }

  collapse(): void {
    this.targets.fill(0);
    this.heatTargets.fill(0);
    this.delays = null;
    this.settled = false;
  }

  update(dt: number): void {
    if (this.settled) return;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.clock += step;
    if (this.delays !== null && this.clock >= this.maxDelay) this.delays = null;
    const k = 1 - Math.exp(-step * EASE_RATE);
    this.districtTop.fill(0);
    this.blockTop.fill(0);
    this.top = 0;
    let moving = false;
    for (let i = 0; i < this.count; i += 1) {
      if (this.easeBuilding(i, k)) moving = true;
      this.recordTop(i);
    }
    this.settled = !moving && this.delays === null;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.heatAttr.needsUpdate = true;
  }

  heightOf(id: number): number {
    return this.heights[id] ?? 0;
  }

  /** Tallest current height. */
  maxHeight(): number {
    return this.top;
  }

  /** Current max height per `layout.districts` index. Live buffer: read, don't keep or mutate. */
  maxHeightPerDistrict(): Float32Array {
    return this.districtTop;
  }

  /** Current max height per `layout.blocks` index. Live buffer: read, don't keep or mutate. */
  maxHeightPerBlock(): Float32Array {
    return this.blockTop;
  }

  /** True when every building has reached its target and no wave is pending. */
  isSettled(): boolean {
    return this.settled;
  }

  /** Nearest visible building hit by the ray, ignoring hidden ones. */
  pick(raycaster: THREE.Raycaster): number | null {
    const hits = this.hits;
    hits.length = 0;
    raycaster.intersectObject(this.mesh, false, hits);
    let found: number | null = null;
    for (const hit of hits) {
      const id = hit.instanceId;
      if (id !== undefined && this.heights[id] > HIDDEN_HEIGHT) {
        found = id;
        break;
      }
    }
    hits.length = 0;
    return found;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    if (this.ownsMaterial) (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }

  private checkLength(values: Float32Array, name: string): void {
    if (values.length !== this.count) {
      throw new RangeError(`CityMesh: ${name} has ${values.length} entries, expected ${this.count}`);
    }
  }

  private placeAll(positions: Float32Array): void {
    const m = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.count; i += 1) {
      const o = i * MATRIX_STRIDE;
      m[o + 12] = positions[2 * i];
      m[o + 14] = positions[2 * i + 1];
      this.writeScale(i, 0);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Returns true while the building is still moving toward its target. */
  private easeBuilding(i: number, k: number): boolean {
    const held = this.delays !== null && this.clock < this.delays[i];
    const target = held ? 0 : this.targets[i];
    const h = approach(this.heights[i], target, k);
    const heat = approach(this.heat[i], this.heatTargets[i], k);
    this.heights[i] = h;
    this.heat[i] = heat;
    this.writeScale(i, h);
    return h !== target || heat !== this.heatTargets[i];
  }

  /** Instances never rotate, so scale lives on the matrix diagonal. */
  private writeScale(i: number, h: number): void {
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const foot = h > HIDDEN_HEIGHT ? FOOTPRINT : HIDDEN_SCALE;
    const o = i * MATRIX_STRIDE;
    m[o] = foot;
    m[o + 5] = Math.max(h, HIDDEN_SCALE);
    m[o + 10] = foot;
  }

  private recordTop(i: number): void {
    const h = this.heights[i];
    if (h > this.top) this.top = h;
    const d = this.districtIndex[i];
    if (h > this.districtTop[d]) this.districtTop[d] = h;
    const b = this.blockOf[i];
    if (b >= 0 && h > this.blockTop[b]) this.blockTop[b] = h;
  }
}
