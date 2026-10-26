import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');

describe('ci.yml', () => {
  it('builds right after the typecheck (R37)', () => {
    const steps = [...read('ci.yml').matchAll(/- run: (.+)/g)].map((m) => m[1].trim());
    expect(steps).toContain('npm run build');
    expect(steps.indexOf('npm run build')).toBe(steps.indexOf('npm run typecheck') + 1);
  });
});

describe('warm.yml', () => {
  const yml = read('warm.yml');
  const lines = yml.split(/\r?\n/);

  it('also runs hourly at minute 17 (R33)', () => {
    expect(yml).toMatch(/schedule:\s*\n(\s*#.*\n)*\s*- cron: '17 \* \* \* \*'/);
  });

  it('hands REPOLIS_URL to the step through env, never inline in run', () => {
    expect(yml).toContain('REPOLIS_URL: ${{ vars.REPOLIS_URL }}');
    expect(yml).toContain('node scripts/warm.mjs "$REPOLIS_URL"');
    const runs = lines.filter((l) => /^\s*run:/.test(l));
    expect(runs.length).toBeGreaterThanOrEqual(2);
    for (const run of runs) expect(run).not.toContain('${{');
  });

  it('skips the scheduled warm when REPOLIS_URL is empty', () => {
    const guards = lines.filter((l) => /^\s*if:.*schedule/.test(l));
    expect(guards.length).toBeGreaterThanOrEqual(1);
    for (const guard of guards) expect(guard).toContain("vars.REPOLIS_URL != ''");
  });

  it('keeps warming after a successful Production deployment', () => {
    expect(yml).toMatch(/^\s*deployment_status:/m);
    expect(yml).toContain("github.event.deployment_status.state == 'success'");
    expect(yml).toContain("github.event.deployment_status.environment == 'Production'");
    expect(yml).toContain('node scripts/warm.mjs "$BASE_URL"');
  });
});
