import { describe, expect, it } from 'vitest';
import { chooseDistricts, DISTRICT_SPLIT_SHARE, ROOT_DISTRICT } from './districts';

// Deterministic permutation: reversing the order exercises input-order independence.
const shuffle = (paths: readonly string[]): string[] => [...paths].reverse();

const repeatPaths = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}/${index + 1}`);

describe('chooseDistricts', () => {
  it('exposes the documented constants', () => {
    expect(DISTRICT_SPLIT_SHARE).toBe(0.35);
    expect(ROOT_DISTRICT).toBe('/');
  });

  it('splits an oversized folder by its next segment and keeps root files in "/"', () => {
    const paths = ['src/a/x.ts', 'src/a/y.ts', 'src/b/z.ts', 'README.md', 'docs/d.md'];

    expect(chooseDistricts(paths).districts).toEqual(['/', 'docs', 'src/a', 'src/b']);
  });

  it('keeps small top-level folders whole and omits "/" when there are no root files', () => {
    expect(chooseDistricts(['a/1', 'b/1', 'c/1']).districts).toEqual(['a', 'b', 'c']);
  });

  it('keeps splitting while a regrouped folder is still over the share', () => {
    const paths = ['src/vs/a/1', 'src/vs/a/2', 'src/vs/b/1', 'src/vs/b/2', 'x/1'];

    expect(chooseDistricts(paths).districts).toEqual(['src/vs/a', 'src/vs/b', 'x']);
  });

  it('keeps direct files under the group key and resolves them to it', () => {
    const paths = ['src/index.ts', 'src/a/1', 'src/a/2', 'src/b/1', 'x'];
    const districts = chooseDistricts(paths);

    expect(districts.districts).toEqual(['/', 'src', 'src/a', 'src/b']);
    expect(districts.districtOf('src/index.ts')).toBe('src');
    expect(districts.districtOf('src/a/1')).toBe('src/a');
    expect(districts.districtOf('x')).toBe('/');
  });

  it('does not split a folder holding exactly the share of paths', () => {
    // src holds 7 of 20 paths (exactly 35%), so it must stay whole.
    const paths = [...repeatPaths('src/a', 7), ...repeatPaths('b', 13)];

    expect(chooseDistricts(paths).districts).toEqual(['b', 'src']);
  });

  it('splits a folder holding just over the share of paths', () => {
    // src holds 8 of 20 paths (40%), so it splits to src/a.
    const paths = [...repeatPaths('src/a', 8), ...repeatPaths('b', 12)];

    expect(chooseDistricts(paths).districts).toEqual(['b', 'src/a']);
  });

  it('never creates districts deeper than 8 segments', () => {
    const paths = [
      'a/b/c/d/e/f/g/h/x/1',
      'a/b/c/d/e/f/g/h/x/2',
      'a/b/c/d/e/f/g/h/y/1',
    ];
    const districts = chooseDistricts(paths);

    expect(districts.districts).toEqual(['a/b/c/d/e/f/g/h']);
    expect(districts.districtOf('a/b/c/d/e/f/g/h/y/1')).toBe('a/b/c/d/e/f/g/h');
  });

  it('returns "/" for paths that match no district', () => {
    const districts = chooseDistricts(['src/a/1', 'src/a/2']);

    expect(districts.districtOf('unknown/file.ts')).toBe('/');
    expect(districts.districtOf('loose.ts')).toBe('/');
  });

  it('handles empty input', () => {
    const districts = chooseDistricts([]);

    expect(districts.districts).toEqual([]);
    expect(districts.districtOf('any/path.ts')).toBe('/');
  });

  it('produces the same districts regardless of input order', () => {
    const paths = [
      'src/index.ts',
      'src/a/1',
      'src/a/2',
      'src/b/1',
      'x',
      'docs/d.md',
      'README.md',
    ];

    expect(chooseDistricts(shuffle(paths)).districts).toEqual(chooseDistricts(paths).districts);
  });
});
