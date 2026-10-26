import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe.each(['city-data.ts', 'github-instance.ts'])('%s', (file) => {
  it("starts with import 'server-only', so a client import fails the build (R37)", () => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    expect(source.split(/\r?\n/)[0]).toBe("import 'server-only';");
  });
});
