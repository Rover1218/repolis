import { describe, expect, it } from 'vitest';
import type { SnapshotMeta } from '@/lib/history/types';
import { buildTooltipInfo, formatMonthYear, formatOneCommit, formatReadout } from './format';

function meta(overrides: Partial<SnapshotMeta> = {}): SnapshotMeta {
  return {
    index: 0,
    commitIndex: 1203,
    sha: 'abc',
    treeSha: 'tree',
    date: '2019-03-14T09:30:00Z',
    author: 'gaearon',
    message: 'm',
    ...overrides,
  };
}

describe('formatReadout', () => {
  it('shows month, 1-based commit number with thousands and files alive', () => {
    expect(formatReadout(meta(), 224)).toBe('Mar 2019 · commit 1,204 · 224 files');
  });

  it('uses the singular for one file', () => {
    expect(formatReadout(meta({ commitIndex: 0 }), 1)).toBe('Mar 2019 · commit 1 · 1 file');
  });

  it('reads dates in UTC', () => {
    expect(formatReadout(meta({ date: '2020-12-31T23:30:00Z' }), 2)).toBe('Dec 2020 · commit 1,204 · 2 files');
  });
});

describe('formatMonthYear', () => {
  it('uses three-letter English months', () => {
    expect(formatMonthYear('2019-09-01T00:00:00Z')).toBe('Sep 2019');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatMonthYear('not a date')).toBe('');
  });
});

describe('formatOneCommit', () => {
  it('formats the single commit date as D Mon YYYY', () => {
    expect(formatOneCommit('2024-03-12T10:00:00Z')).toBe('Pushed all at once · 1 commit · 12 Mar 2024');
  });

  it('omits an invalid date', () => {
    expect(formatOneCommit('nope')).toBe('Pushed all at once · 1 commit');
  });
});

describe('buildTooltipInfo', () => {
  const base = {
    path: 'src/index.ts',
    bytes: 4300,
    changes: 3 as number | null,
    lastChange: meta({ date: '2024-03-02T00:00:00Z' }) as SnapshotMeta | null,
    exact: true,
    mergePlan: [],
  };

  it('uses the path as the title and lists size, changes and author', () => {
    expect(buildTooltipInfo(base)).toEqual({
      title: 'src/index.ts',
      lines: ['4.2 KB · ≈123 lines', 'changed in 3 snapshots · last Mar 2024', 'last touched by gaearon'],
    });
  });

  it('omits the author when snapshots are sampled', () => {
    expect(buildTooltipInfo({ ...base, exact: false }).lines).toHaveLength(2);
  });

  it('omits the author when it is unknown', () => {
    const lastChange = meta({ date: '2024-03-02T00:00:00Z', author: null });
    expect(buildTooltipInfo({ ...base, lastChange }).lines).toHaveLength(2);
  });

  it('omits the change line when changes are unknown', () => {
    expect(buildTooltipInfo({ ...base, changes: null, lastChange: null }).lines).toEqual(['4.2 KB · ≈123 lines']);
  });

  it('uses singulars and drops the date without a last change', () => {
    const info = buildTooltipInfo({ ...base, bytes: 10, changes: 1, lastChange: null });
    expect(info.lines).toEqual(['10 B · ≈1 line', 'changed in 1 snapshot']);
  });
});
