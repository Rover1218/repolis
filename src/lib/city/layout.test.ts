import { describe, expect, it } from 'vitest';
import { ROOT_DISTRICT } from '@/lib/city/districts';
import { CELL, layoutCity, packBlocks } from '@/lib/city/layout';

function buildFixture(): string[] {
  const paths: string[] = ['README.md', 'package.json', 'tsconfig.json', 'LICENSE'];
  const srcFolders: Array<[string, number]> = [
    ['components', 40],
    ['lib/city', 30],
    ['lib/data', 25],
    ['app/api', 12],
    ['hooks', 9],
  ];
  for (const [folder, count] of srcFolders) {
    for (let i = 0; i < count; i += 1) paths.push(`src/${folder}/file${i}.ts`);
  }
  for (let i = 0; i < 20; i += 1) paths.push(`src/index${i}.ts`);
  for (let i = 0; i < 60; i += 1) paths.push(`docs/guide/page${i}.md`);
  for (let i = 0; i < 15; i += 1) paths.push(`docs/intro${i}.md`);
  for (let i = 0; i < 6; i += 1) paths.push(`scripts/s${i}.sh`);
  for (let i = 0; i < 80; i += 1) paths.push(`tests/unit/t${i}.test.ts`);
  return paths;
}

const FIXTURE = buildFixture();

function shuffled(values: string[]): string[] {
  const out = [...values];
  let seed = 12345;
  for (let i = out.length - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('layoutCity', () => {
  const layout = layoutCity(FIXTURE);
  const n = layout.paths.length;

  it('sorts paths and sizes arrays to match', () => {
    expect(layout.paths).toEqual([...FIXTURE].sort());
    expect(layout.positions.length).toBe(n * 2);
    expect(layout.districtIndex.length).toBe(n);
    expect(n).toBeGreaterThan(290);
    expect(layout.districts.some((d) => d.name === ROOT_DISTRICT)).toBe(true);
  });

  it('keeps every pair of buildings at least 0.5 apart', () => {
    const items = Array.from({ length: n }, (_, i) => [layout.positions[i * 2], layout.positions[i * 2 + 1]]);
    for (let a = 0; a < n; a += 1) {
      for (let b = a + 1; b < n; b += 1) {
        const dist = Math.hypot(items[a][0] - items[b][0], items[a][1] - items[b][1]);
        expect(dist).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('is deterministic and independent of input order and duplicates', () => {
    const again = layoutCity(FIXTURE);
    expect(Array.from(again.positions)).toEqual(Array.from(layout.positions));
    const other = layoutCity([...shuffled(FIXTURE), FIXTURE[0], FIXTURE[5]]);
    expect(other.paths).toEqual(layout.paths);
    expect(Array.from(other.positions)).toEqual(Array.from(layout.positions));
  });

  it('places every building inside its district box', () => {
    for (let i = 0; i < n; i += 1) {
      const box = layout.districts[layout.districtIndex[i]];
      const x = layout.positions[i * 2];
      const z = layout.positions[i * 2 + 1];
      expect(x).toBeGreaterThanOrEqual(box.x0);
      expect(x).toBeLessThanOrEqual(box.x0 + box.w);
      expect(z).toBeGreaterThanOrEqual(box.z0);
      expect(z).toBeLessThanOrEqual(box.z0 + box.d);
    }
  });

  it('centres the city on the origin', () => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const d of layout.districts) {
      minX = Math.min(minX, d.x0);
      maxX = Math.max(maxX, d.x0 + d.w);
      minZ = Math.min(minZ, d.z0);
      maxZ = Math.max(maxZ, d.z0 + d.d);
    }
    expect(Math.abs(minX + maxX)).toBeLessThan(1e-6);
    expect(Math.abs(minZ + maxZ)).toBeLessThan(1e-6);
    expect(layout.halfWidth).toBeCloseTo(maxX, 6);
  });

  it('radius encloses every building', () => {
    for (let i = 0; i < n; i += 1) {
      expect(Math.hypot(layout.positions[i * 2], layout.positions[i * 2 + 1])).toBeLessThanOrEqual(layout.radius);
    }
  });

  it('reports sub-blocks inside their district with folder-prefix names', () => {
    expect(layout.blocks.length).toBeGreaterThan(0);
    for (const block of layout.blocks) {
      const contained = layout.paths
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.startsWith(`${block.name}/`));
      expect(contained.length).toBeGreaterThan(0);
      const inside = contained.filter(({ i }) => {
        const x = layout.positions[i * 2];
        const z = layout.positions[i * 2 + 1];
        return x >= block.x0 && x <= block.x0 + block.w && z >= block.z0 && z <= block.z0 + block.d;
      });
      expect(inside.length).toBeGreaterThan(0);
      const district = layout.districts[layout.districtIndex[inside[0].i]];
      expect(block.x0).toBeGreaterThanOrEqual(district.x0 - 1e-6);
      expect(block.z0).toBeGreaterThanOrEqual(district.z0 - 1e-6);
      expect(block.x0 + block.w).toBeLessThanOrEqual(district.x0 + district.w + 1e-6);
      expect(block.z0 + block.d).toBeLessThanOrEqual(district.z0 + district.d + 1e-6);
    }
  });

  it('exposes a street z between district rows', () => {
    expect(Number.isFinite(layout.streetZ)).toBe(true);
    expect(CELL).toBe(1);
  });

  it('handles empty input', () => {
    expect(layoutCity([])).toEqual({
      paths: [],
      positions: new Float32Array(0),
      districtIndex: new Uint16Array(0),
      districts: [],
      blocks: [],
      radius: 0,
      halfWidth: 0,
      streetZ: 0,
    });
  });
});

describe('packBlocks', () => {
  it('places no two blocks overlapping and records row gaps', () => {
    const blocks = Array.from({ length: 30 }, (_, i) => ({ key: `b${i}`, w: 1 + (i % 7), d: 1 + ((i * 3) % 5) }));
    const { placements, width, depth, rowGaps } = packBlocks(blocks, 0.5);
    expect(placements.size).toBe(blocks.length);
    expect(rowGaps.length).toBeGreaterThan(0);
    for (let a = 0; a < blocks.length; a += 1) {
      const pa = placements.get(blocks[a].key)!;
      expect(pa.x + blocks[a].w).toBeLessThanOrEqual(width + 1e-9);
      expect(pa.z + blocks[a].d).toBeLessThanOrEqual(depth + 1e-9);
      for (let b = a + 1; b < blocks.length; b += 1) {
        const pb = placements.get(blocks[b].key)!;
        const overlapX = pa.x < pb.x + blocks[b].w && pb.x < pa.x + blocks[a].w;
        const overlapZ = pa.z < pb.z + blocks[b].d && pb.z < pa.z + blocks[a].d;
        expect(overlapX && overlapZ).toBe(false);
      }
    }
  });

  it('handles no blocks', () => {
    expect(packBlocks([], 1)).toEqual({ placements: new Map(), width: 0, depth: 0, rowGaps: [] });
  });
});
