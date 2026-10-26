import type { MergePlan } from './types';

/** Pure merge-plan helpers, safe to import on the client (merge.ts needs node:crypto). */

export const SMALL_NAME = '+small';

/** The path of a folder's merged "+small" block ('' = the repo root). */
export function smallPath(folder: string): string {
  return folder === '' ? SMALL_NAME : `${folder}/${SMALL_NAME}`;
}

/**
 * Files the plan folds away: a block of `count` files stands as one building, so it hides
 * `count - 1`. Only blocks for which `isStanding(blockPath)` holds are counted.
 */
export function foldedFiles(plan: MergePlan, isStanding: (blockPath: string) => boolean = () => true): number {
  let folded = 0;
  for (const { folder, count } of plan) {
    if (isStanding(smallPath(folder))) folded += count - 1;
  }
  return folded;
}
