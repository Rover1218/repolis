import { SMALL_HEAD, smallLatest } from './small';

const files: Array<[string, number]> = smallLatest.files.slice(0, 6);

export const oneCommitLatest = {
  ...smallLatest,
  totalCommits: 1,
  date: '2024-03-12T10:00:00Z',
  files,
};

export const oneCommitManifest = {
  fullName: smallLatest.fullName,
  headSha: SMALL_HEAD,
  totalCommits: 1,
  exact: true,
  mode: 'full',
  batchSize: 20,
  snapshots: [
    {
      index: 0,
      commitIndex: 0,
      sha: '1'.repeat(40),
      treeSha: '4'.repeat(40),
      date: '2024-03-12T10:00:00Z',
      author: 'Ada',
      message: 'Initial commit',
    },
  ],
  mergePlan: [],
  treeRequests: 1,
};

export const oneCommitBatch = { batch: 0, deltas: [{ index: 0, changes: files }] };
