import { chooseDistricts, ROOT_DISTRICT } from '@/lib/city/districts';

export const CELL = 1;
export const FOOTPRINT = 0.74;
export const STREET = 1.8;
export const ALLEY = 0.5;

const ROW_SLACK = 1.1;
const DIRECT_KEY = '.';

export interface DistrictBox {
  name: string;
  x0: number;
  z0: number;
  w: number;
  d: number;
}

export interface CityLayout {
  paths: string[];
  /** x, z per building, indexed by `paths`. */
  positions: Float32Array;
  districtIndex: Uint16Array;
  districts: DistrictBox[];
  /** Sub-folder blocks; name is the full folder path. */
  blocks: DistrictBox[];
  radius: number;
  halfWidth: number;
  streetZ: number;
}

export interface PackInput {
  key: string;
  w: number;
  d: number;
}

export interface PackResult {
  placements: Map<string, { x: number; z: number }>;
  width: number;
  depth: number;
  rowGaps: number[];
}

/** Shelf packing: biggest first, rows wrap at a width derived from total area. */
export function packBlocks(blocks: readonly PackInput[], gap: number): PackResult {
  const sorted = [...blocks].sort(
    (a, b) => Math.max(b.w, b.d) - Math.max(a.w, a.d) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  let area = 0;
  for (const b of sorted) area += (b.w + gap) * (b.d + gap);
  const rowMax = Math.sqrt(area) * ROW_SLACK;

  const placements = new Map<string, { x: number; z: number }>();
  const rowGaps: number[] = [];
  let x = 0;
  let z = 0;
  let rowDepth = 0;
  let width = 0;
  for (const b of sorted) {
    if (x > 0 && x + b.w > rowMax) {
      rowGaps.push(z + rowDepth + gap / 2);
      z += rowDepth + gap;
      x = 0;
      rowDepth = 0;
    }
    placements.set(b.key, { x, z });
    width = Math.max(width, x + b.w);
    x += b.w + gap;
    rowDepth = Math.max(rowDepth, b.d);
  }
  return { placements, width, depth: sorted.length > 0 ? z + rowDepth : 0, rowGaps };
}

interface Group {
  key: string;
  files: number[];
  side: number;
  w: number;
  d: number;
}

function blockKeyOf(district: string, path: string): string {
  const rest = district === ROOT_DISTRICT ? path : path.slice(district.length + 1);
  const slash = rest.indexOf('/');
  return slash === -1 ? DIRECT_KEY : rest.slice(0, slash);
}

function makeGroup(key: string, files: number[]): Group {
  const side = Math.ceil(Math.sqrt(files.length));
  return { key, files, side, w: side * CELL, d: Math.ceil(files.length / side) * CELL };
}

function groupInto<T>(map: Map<string, T[]>, key: string, item: T): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

interface DistrictPlan {
  name: string;
  groups: Group[];
  pack: PackResult;
}

function planDistrict(name: string, fileIds: number[], paths: string[]): DistrictPlan {
  const byBlock = new Map<string, number[]>();
  for (const id of fileIds) groupInto(byBlock, blockKeyOf(name, paths[id]), id);
  const groups = [...byBlock].map(([key, files]) => makeGroup(key, files));
  return { name, groups, pack: packBlocks(groups, ALLEY) };
}

const EMPTY_LAYOUT = (): CityLayout => ({
  paths: [],
  positions: new Float32Array(0),
  districtIndex: new Uint16Array(0),
  districts: [],
  blocks: [],
  radius: 0,
  halfWidth: 0,
  streetZ: 0,
});

export function layoutCity(input: readonly string[]): CityLayout {
  const paths = [...new Set(input)].sort();
  if (paths.length === 0) return EMPTY_LAYOUT();

  const { districtOf } = chooseDistricts(paths);
  const byDistrict = new Map<string, number[]>();
  paths.forEach((p, i) => groupInto(byDistrict, districtOf(p), i));
  const plans = [...byDistrict.keys()].sort().map((k) => planDistrict(k, byDistrict.get(k)!, paths));

  const city = packBlocks(
    plans.map((p) => ({ key: p.name, w: p.pack.width, d: p.pack.depth })),
    STREET,
  );
  const cx = city.width / 2;
  const cz = city.depth / 2;

  const positions = new Float32Array(paths.length * 2);
  const districtIndex = new Uint16Array(paths.length);
  const districts: DistrictBox[] = [];
  const blocks: DistrictBox[] = [];
  let radius = 0;
  let halfWidth = 0;

  plans.forEach((plan, di) => {
    const at = city.placements.get(plan.name)!;
    const x0 = at.x - cx;
    const z0 = at.z - cz;
    districts.push({ name: plan.name, x0, z0, w: plan.pack.width, d: plan.pack.depth });
    halfWidth = Math.max(halfWidth, Math.abs(x0), Math.abs(x0 + plan.pack.width));

    for (const g of plan.groups) {
      const gp = plan.pack.placements.get(g.key)!;
      const gx = x0 + gp.x;
      const gz = z0 + gp.z;
      if (g.key !== DIRECT_KEY) {
        const name = plan.name === ROOT_DISTRICT ? g.key : `${plan.name}/${g.key}`;
        blocks.push({ name, x0: gx, z0: gz, w: g.w, d: g.d });
      }
      g.files.forEach((id, k) => {
        const x = gx + ((k % g.side) + 0.5) * CELL;
        const z = gz + (Math.floor(k / g.side) + 0.5) * CELL;
        positions[id * 2] = x;
        positions[id * 2 + 1] = z;
        districtIndex[id] = di;
        radius = Math.max(radius, Math.hypot(x, z));
      });
    }
  });

  return {
    paths,
    positions,
    districtIndex,
    districts,
    blocks,
    radius: radius + CELL,
    halfWidth,
    streetZ: city.rowGaps.length > 0 ? city.rowGaps[0] - cz : 0,
  };
}
