import { describe, expect, it } from 'vitest';
import { createCityHistory } from '@/lib/city/history';
import type { CityManifest, SnapshotBatch, SnapshotMeta } from '@/lib/history/types';

type Changes = Array<[string, number | null]>;

function manifest(n: number): CityManifest {
  const snapshots: SnapshotMeta[] = Array.from({ length: n }, (_, i) => ({
    index: i, commitIndex: i, sha: `s${i}`, treeSha: `t${i}`, date: '2024-01-01T00:00:00Z', author: null, message: `m${i}`,
  }));
  return { fullName: 'o/r', headSha: 'h', totalCommits: n, exact: true, mode: 'full', batchSize: 2, snapshots, mergePlan: [], treeRequests: 0 };
}

function batches(changes: Changes[], batchSize = 2): SnapshotBatch[] {
  const out: SnapshotBatch[] = [];
  changes.forEach((c, index) => {
    const b = Math.floor(index / batchSize);
    if (!out[b]) out[b] = { batch: b, deltas: [] };
    out[b].deltas.push({ index, changes: c });
  });
  return out;
}

const FIXTURE: Changes[] = [
  [['a.ts', 100], ['b.ts', 50]],
  [['a.ts', 120]],
  [['b.ts', null], ['c.ts', 10]],
];

function fixture() {
  return createCityHistory(manifest(3), batches(FIXTURE));
}

describe('createCityHistory', () => {
  it('sorts paths and reports sizes per snapshot', () => {
    const h = fixture();
    expect(h.paths).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect([...h.sizesAt(2)]).toEqual([120, 0, 10]);
    expect([...h.sizesAt(0)]).toEqual([100, 50, 0]);
    expect([...h.sizesAt(1)]).toEqual([120, 50, 0]);
  });

  it('computes heat', () => {
    const h = fixture();
    expect(h.heatAt(1)[0]).toBe(1);
    expect(h.heatAt(2)[0]).toBeCloseTo(Math.exp(-1 / 2.5), 6);
    expect(h.heatAt(2)[1]).toBe(0);
    expect(h.heatAt(2)[2]).toBe(1);
    expect(h.heatAt(0)[2]).toBe(0);
  });

  it('counts changes and finds the last one', () => {
    const h = fixture();
    expect(h.changeCountUntil(0, 2)).toBe(2);
    expect(h.lastChangeUntil(0, 2)).toBe(1);
    expect(h.changeCountUntil(1, 2)).toBe(2);
    expect(h.lastChangeUntil(1, 2)).toBe(2);
    expect(h.changeCountUntil(2, 1)).toBe(0);
    expect(h.lastChangeUntil(2, 1)).toBeNull();
  });

  it('counts files alive', () => {
    const h = fixture();
    expect(h.filesAliveAt(0)).toBe(2);
    expect(h.filesAliveAt(2)).toBe(2);
  });

  it('computes activity', () => {
    expect([...fixture().activity]).toEqual([150, 20, 60]);
  });

  it('uses full size for a same-size content change', () => {
    const h = createCityHistory(manifest(2), batches([[['a.ts', 40]], [['a.ts', 40]]]));
    expect([...h.activity]).toEqual([40, 40]);
  });

  it('flags only snapshot 0 as construction in the fixture', () => {
    expect([...fixture().constructionSnapshots]).toEqual([0]);
  });

  it('flags only snapshot 0 for a single commit', () => {
    const h = createCityHistory(manifest(1), batches([[['a.ts', 10]]]));
    expect([...h.constructionSnapshots]).toEqual([0]);
  });

  it('stores empty present files as 1 byte', () => {
    const h = createCityHistory(manifest(2), batches([[['e.txt', 0]], [['f.txt', 5]]]));
    expect([...h.sizesAt(0)]).toEqual([1, 0]);
    expect(h.filesAliveAt(0)).toBe(1);
    expect(h.heatAt(0)[0]).toBe(1);
  });

  it('flags a later large addition as construction', () => {
    const h = createCityHistory(manifest(3), batches([[['a.ts', 10]], [['a.ts', 11]], [['b.ts', 1000]]]));
    expect([...h.constructionSnapshots]).toEqual([2]);
  });

  it('throws on incomplete or out-of-order batches', () => {
    const ok = batches(FIXTURE);
    expect(() => createCityHistory(manifest(3), [ok[0]])).toThrow('history batches incomplete');
    expect(() => createCityHistory(manifest(3), [])).toThrow('history batches incomplete');
    const bad: SnapshotBatch[] = [{ batch: 0, deltas: [{ index: 1, changes: [] }, { index: 0, changes: [] }] }, ok[1]];
    expect(() => createCityHistory(manifest(3), bad)).toThrow('history batches incomplete');
  });

  it('accepts batches given out of order and does not mutate them', () => {
    const ok = batches(FIXTURE);
    const before = JSON.stringify(ok);
    const h = createCityHistory(manifest(3), [ok[1], ok[0]]);
    expect([...h.sizesAt(2)]).toEqual([120, 0, 10]);
    expect(JSON.stringify(ok)).toBe(before);
  });
});
