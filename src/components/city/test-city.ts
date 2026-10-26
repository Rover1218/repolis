import { vi } from 'vitest';
import { type CityHistory, createCityHistory } from '@/lib/city/history';
import type { CityManifest, FileChange, LatestCity, SnapshotBatch } from '@/lib/history/types';
import type { HoverCallback, LabelPosition } from '@/scene/city-scene';

export function makeLatest(overrides: Partial<LatestCity> = {}): LatestCity {
  return {
    fullName: 'o/r',
    defaultBranch: 'main',
    headSha: 'head',
    date: '2024-03-12T10:00:00Z',
    totalCommits: 3,
    files: [
      ['src/a.ts', 4300],
      ['src/b.ts', 2000],
      ['lib/c.ts', 1000],
      ['README.md', 500],
    ],
    mode: 'full',
    mergePlan: [],
    ...overrides,
  };
}

/** Per snapshot, the file changes it makes. */
export type Script = FileChange[][];

export const THREE_SNAPSHOTS: Script = [
  [['src/a.ts', 1000], ['README.md', 500]],
  [['src/b.ts', 2000], ['lib/c.ts', 1000]],
  [['src/a.ts', 4300], ['lib/c.ts', null]],
];

export function makeHistory(script: Script = THREE_SNAPSHOTS, exact = true): { manifest: CityManifest; history: CityHistory } {
  const manifest: CityManifest = {
    fullName: 'o/r',
    headSha: 'head',
    totalCommits: script.length,
    exact,
    mode: 'full',
    batchSize: script.length,
    snapshots: script.map((_, i) => ({
      index: i,
      commitIndex: i,
      sha: `sha${i}`,
      treeSha: `tree${i}`,
      date: `2024-0${(i % 9) + 1}-12T10:00:00Z`,
      author: `dev${i}`,
      message: `m${i}`,
    })),
    mergePlan: [],
    treeRequests: script.length,
  };
  const batches: SnapshotBatch[] = [{ batch: 0, deltas: script.map((changes, index) => ({ index, changes })) }];
  return { manifest, history: createCityHistory(manifest, batches) };
}

/** Records every CityScene call the view and director make. */
export class FakeScene {
  static instances: FakeScene[] = [];
  static failWith: Error | null = null;

  inside = false;
  labels: LabelPosition[] = [];
  hover: HoverCallback | null = null;
  setLayout = vi.fn();
  setFrame = vi.fn();
  startConstruction = vi.fn();
  collapse = vi.fn();
  frame = vi.fn();
  toggleDive = vi.fn();
  dispose = vi.fn();
  labelPositions = vi.fn(() => this.labels);
  isInside = vi.fn(() => this.inside);
  onHover = vi.fn((cb: HoverCallback) => {
    this.hover = cb;
  });

  constructor() {
    if (FakeScene.failWith) throw FakeScene.failWith;
    FakeScene.instances.push(this);
  }

  static reset(): void {
    FakeScene.instances = [];
    FakeScene.failWith = null;
  }
}
