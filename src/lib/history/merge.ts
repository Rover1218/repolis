import { createHash } from 'node:crypto';
import { CityError } from '@/lib/errors';
import type { GitHub } from '@/lib/github/types';
import type { TreeSnapshot } from './diff';
import type { MergePlan } from './types';

export const MAX_BUILDINGS = 20000;
export const KEEP_PER_FOLDER = 8;
export const GITHUB_RESERVE = 300;
const SMALL_NAME = '+small';

function parentFolder(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

const smallPath = (folder: string): string => (folder === '' ? SMALL_NAME : `${folder}/${SMALL_NAME}`);

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Plans which small files to fold into one "+small" block per folder. Folders are taken by file
 * count (largest first); each keeps its `keep` largest files. Stops once buildings <= `max`.
 */
export function planMerge(files: Array<[string, number]>, max: number = MAX_BUILDINGS, keep: number = KEEP_PER_FOLDER): MergePlan {
  let buildings = files.length;
  if (buildings <= max) return [];
  const byFolder = new Map<string, Array<[string, number]>>();
  for (const f of files) {
    const folder = parentFolder(f[0]);
    const list = byFolder.get(folder);
    if (list) list.push(f);
    else byFolder.set(folder, [f]);
  }
  const folders = [...byFolder].sort((a, b) => b[1].length - a[1].length || compareStrings(a[0], b[0]));
  const plan: MergePlan = [];
  for (const [folder, list] of folders) {
    if (buildings <= max) break;
    const merged = list.length - keep;
    if (merged <= 1) continue;
    const kept = list
      .slice()
      .sort((a, b) => b[1] - a[1] || compareStrings(a[0], b[0]))
      .slice(0, keep)
      .map(([p]) => p);
    plan.push({ folder, keep: kept, count: merged });
    buildings -= merged - 1;
  }
  return plan;
}

const lookupCache = new WeakMap<MergePlan, Map<string, Set<string>>>();

function lookup(plan: MergePlan): Map<string, Set<string>> {
  let m = lookupCache.get(plan);
  if (m === undefined) {
    m = new Map(plan.map((p) => [p.folder, new Set(p.keep)]));
    lookupCache.set(plan, m);
  }
  return m;
}

/** The path itself, or its folder's "+small" block when the folder is planned and the file is not kept. */
export function mergedPath(path: string, plan: MergePlan): string {
  if (plan.length === 0) return path;
  const folder = parentFolder(path);
  const keep = lookup(plan).get(folder);
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
