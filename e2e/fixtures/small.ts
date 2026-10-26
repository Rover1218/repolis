// Self-contained fixtures (no imports from src/) shaped like the /api/city responses.
export type Json = Record<string, unknown>;

export const SMALL_FULL_NAME = 'facebook/react';
export const SMALL_HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

const FILES: Array<[string, number]> = [
  ['README.md', 2400],
  ['package.json', 1800],
  ['src/index.ts', 5200],
  ['src/city.ts', 9100],
  ['src/render.ts', 7300],
  ['src/util.ts', 1500],
  ['docs/intro.md', 3100],
  ['docs/guide.md', 6400],
  ['docs/api.md', 8800],
  ['test/city.test.ts', 4200],
  ['test/render.test.ts', 3900],
  ['test/util.test.ts', 1200],
];

export const smallLatest = {
  fullName: SMALL_FULL_NAME,
  defaultBranch: 'main',
  headSha: SMALL_HEAD,
  date: '2024-03-12T10:00:00Z',
  totalCommits: 3,
  files: FILES,
  mode: 'full',
  mergePlan: [],
};

const snapshot = (index: number, date: string, message: string) => ({
  index,
  commitIndex: index,
  sha: String(index + 1).repeat(40),
  treeSha: String(index + 4).repeat(40),
  date,
  author: 'Ada',
  message,
});

export const smallManifest = {
  fullName: SMALL_FULL_NAME,
  headSha: SMALL_HEAD,
  totalCommits: 3,
  exact: true,
  mode: 'full',
  batchSize: 20,
  snapshots: [
    snapshot(0, '2024-01-05T09:00:00Z', 'Initial commit'),
    snapshot(1, '2024-02-10T09:00:00Z', 'Add docs and tests'),
    snapshot(2, '2024-03-12T10:00:00Z', 'Polish'),
  ],
  mergePlan: [],
  treeRequests: 3,
};

export const smallBatch = {
  batch: 0,
  deltas: [
    { index: 0, changes: FILES.slice(0, 5) },
    { index: 1, changes: FILES.slice(5, 9) },
    { index: 2, changes: FILES.slice(9) },
  ],
};
