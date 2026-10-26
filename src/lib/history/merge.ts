import { createHash } from 'node:crypto';
import { CityError } from '@/lib/errors';
import type { GitHub } from '@/lib/github/types';
import type { TreeSnapshot } from './diff';
import { smallPath } from './merge-plan';
import type { MergePlan } from './types';

export const MAX_BUILDINGS = 20000;
export const KEEP_PER_FOLDER = 8;
export const GITHUB_RESERVE = 300;
/** Deepest ancestor depth the subtree fallback groups by; bounds work on hostile deep paths. */
export const MAX_FALLBACK_DEPTH = 16;

function parentFolder(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Number of folder segments in a folder path ('' = 0). */
const depthOf = (folder: string): number => (folder === '' ? 0 : folder.split('/').length);

/** The first d folder segments of a path, or null when the file sits shallower than that. */
function ancestorPrefix(path: string, d: number): string | null {
  let end = -1;
  for (let i = 0; i < d; i++) {
    end = path.indexOf('/', end + 1);
    if (end < 0) return null;
  }
  return d === 0 ? '' : path.slice(0, end);
}

function keepLargest(list: Array<[string, number]>, keep: number): string[] {
  return list
    .slice()
    .sort((a, b) => b[1] - a[1] || compareStrings(a[0], b[0]))
    .slice(0, keep)
    .map(([p]) => p);
}

function groupBy(files: Array<[string, number]>, keyOf: (path: string) => string | null): Array<[string, Array<[string, number]>]> {
  const groups = new Map<string, Array<[string, number]>>();
  for (const f of files) {
    const key = keyOf(f[0]);
    if (key === null) continue;
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length || compareStrings(a[0], b[0]));
}

/** Merges within groups (largest first) until buildings <= max; returns the plan and the new count. */
function planGroups(
  groups: Array<[string, Array<[string, number]>]>,
  start: number,
  max: number,
  keep: number,
  subtree: boolean,
): { plan: MergePlan; buildings: number } {
  let buildings = start;
  const plan: MergePlan = [];
  for (const [folder, list] of groups) {
    if (buildings <= max) break;
    const merged = list.length - keep;
    if (merged <= 1) continue;
    plan.push(subtree ? { folder, keep: keepLargest(list, keep), count: merged, subtree } : { folder, keep: keepLargest(list, keep), count: merged });
    buildings -= merged - 1;
  }
  return { plan, buildings };
}

/**
 * Plans which small files to fold into one "+small" block. First pass: per parent folder (largest
 * first), each keeping its largest files. If that cannot reach the max (many tiny folders),
 * falls back to merging whole subtrees at the deepest ancestor depth that converges, down to the root.
 */
export function planMerge(files: Array<[string, number]>, max: number = MAX_BUILDINGS, keep: number = KEEP_PER_FOLDER): MergePlan {
  if (files.length <= max) return [];
  const perFolder = planGroups(groupBy(files, parentFolder), files.length, max, keep, false);
  if (perFolder.buildings <= max) return perFolder.plan;

  let deepest = 0;
  for (const [path] of files) deepest = Math.max(deepest, depthOf(parentFolder(path)));
  for (let d = Math.min(Math.max(deepest - 1, 0), MAX_FALLBACK_DEPTH); d >= 0; d--) {
    const result = planGroups(groupBy(files, (p) => ancestorPrefix(p, d)), files.length, max, keep, true);
    if (result.buildings <= max || d === 0) return result.plan;
  }
  return [];
}

interface PlanLookup {
  subtreeDepth: number | null;
  keeps: Map<string, Set<string>>;
}

const lookupCache = new WeakMap<MergePlan, PlanLookup>();

function lookup(plan: MergePlan): PlanLookup {
  let m = lookupCache.get(plan);
  if (m === undefined) {
    const first = plan[0];
    m = {
      subtreeDepth: first?.subtree === true ? depthOf(first.folder) : null,
      keeps: new Map(plan.map((p) => [p.folder, new Set(p.keep)])),
    };
    lookupCache.set(plan, m);
  }
  return m;
}

/** The path itself, or its block's "+small" path when it is merged by the plan. */
export function mergedPath(path: string, plan: MergePlan): string {
  if (plan.length === 0) return path;
  const { subtreeDepth, keeps } = lookup(plan);
  const folder = subtreeDepth === null ? parentFolder(path) : ancestorPrefix(path, subtreeDepth);
  if (folder === null) return path;
  const keep = keeps.get(folder);
  return keep === undefined || keep.has(path) ? path : smallPath(folder);
}

/** Returns a new tree with every planned small file folded into its block (sizes summed). */
export function applyMerge(tree: TreeSnapshot, plan: MergePlan): TreeSnapshot {
  if (plan.length === 0) return new Map(tree);
  const out: TreeSnapshot = new Map();
  const members = new Map<string, { shas: string[]; size: number }>();
  for (const [path, file] of tree) {
    const target = mergedPath(path, plan);
    if (target === path) {
      out.set(path, file);
      continue;
    }
    const block = members.get(target);
    if (block) {
      block.shas.push(file.sha);
      block.size += file.size;
    } else {
      members.set(target, { shas: [file.sha], size: file.size });
    }
  }
  for (const [path, { shas, size }] of members) {
    out.set(path, { sha: createHash('sha1').update([...shas].sort().join(',')).digest('hex'), size });
  }
  return out;
}

/** Throws a rate-limited error when running `cost` more requests would dip into the reserve. */
export function ensureBudget(gh: GitHub, cost: number): void {
  const r = gh.remaining('core');
  if (r === null || r.remaining - cost >= GITHUB_RESERVE) return;
  const minutes = Math.ceil((r.resetAt * 1000 - Date.now()) / 60000);
  throw new CityError('rate-limited', { retryAfterMinutes: Math.max(1, minutes) });
}
