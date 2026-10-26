import { describe, expect, it } from 'vitest';
import { CONSTRUCTION_SECONDS, RISE_SECONDS, constructionDelays } from '@/lib/city/construction';
import { layoutCity } from '@/lib/city/layout';

function setup() {
  const paths: string[] = [];
  for (let i = 0; i < 30; i += 1) paths.push(`src/big/f${i}.ts`);
  for (let i = 0; i < 20; i += 1) paths.push(`src/mid/f${i}.ts`);
  for (let i = 0; i < 10; i += 1) paths.push(`docs/guide/f${i}.md`);
  const layout = layoutCity(paths);
  const sizes = new Float32Array(layout.paths.length);
  layout.paths.forEach((p, i) => {
    sizes[i] = p.includes('/big/') ? 5000 : p.includes('/mid/') ? 2000 : 100;
  });
  return { layout, sizes };
}

describe('constructionDelays', () => {
  it('stays within the construction window and is deterministic', () => {
    const { layout, sizes } = setup();
    const a = constructionDelays(layout, sizes);
    const b = constructionDelays(layout, sizes);
    expect(Math.max(...a)).toBeLessThanOrEqual(CONSTRUCTION_SECONDS - RISE_SECONDS);
    expect([...a]).toEqual([...b]);
  });

  it('starts every building of the biggest district before the second', () => {
    const { layout, sizes } = setup();
    const delays = constructionDelays(layout, sizes);
    const totals = new Map<number, number>();
    const members = new Map<number, number[]>();
    layout.paths.forEach((_, i) => {
      const d = layout.districtIndex[i];
      totals.set(d, (totals.get(d) ?? 0) + sizes[i]);
      members.set(d, [...(members.get(d) ?? []), delays[i]]);
    });
    const ranked = [...totals.entries()].sort((x, y) => y[1] - x[1]);
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    const first = members.get(ranked[0][0]) as number[];
    const second = members.get(ranked[1][0]) as number[];
    expect(Math.max(...first)).toBeLessThan(Math.min(...second));
  });

  it('gives absent buildings delay 0', () => {
    const { layout, sizes } = setup();
    sizes[3] = 0;
    expect(constructionDelays(layout, sizes)[3]).toBe(0);
  });

  it('handles an empty layout', () => {
    expect(constructionDelays(layoutCity([]), new Float32Array(0)).length).toBe(0);
  });
});
