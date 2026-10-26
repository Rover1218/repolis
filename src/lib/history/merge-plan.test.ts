import { describe, expect, it } from 'vitest';
import { foldedFiles, smallPath } from './merge-plan';
import type { MergePlan } from './types';

const PLAN: MergePlan = [
  { folder: 'src', keep: ['src/a.ts'], count: 40 },
  { folder: '', keep: [], count: 3 },
];

describe('smallPath', () => {
  it('names the merged block of a folder, and of the root', () => {
    expect(smallPath('src/x')).toBe('src/x/+small');
    expect(smallPath('')).toBe('+small');
  });
});

describe('foldedFiles', () => {
  it('is 0 for an empty plan', () => {
    expect(foldedFiles([])).toBe(0);
  });

  it('counts every block as count - 1 extra files', () => {
    expect(foldedFiles(PLAN)).toBe(39 + 2);
  });

  it('counts only the blocks the predicate says are standing', () => {
    expect(foldedFiles(PLAN, (path) => path === 'src/+small')).toBe(39);
    expect(foldedFiles(PLAN, () => false)).toBe(0);
  });
});
