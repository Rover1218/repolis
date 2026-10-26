import { estimateLines, formatSize } from '@/lib/city/height';
import type { MergePlan, SnapshotMeta } from '@/lib/history/types';

// A fixed table instead of Intl en-GB: browsers disagree on "Sep" vs "Sept".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const COUNT = new Intl.NumberFormat('en-US');

export interface TooltipInfo {
  title: string;
  lines: string[];
}

export interface TooltipArgs {
  path: string;
  bytes: number;
  /** Snapshots the file changed in so far; null before history has loaded. */
  changes: number | null;
  lastChange: SnapshotMeta | null;
  /** Snapshots are exact commits, so the author of a change is known. */
  exact: boolean;
  /** Used for merged "+N small files" blocks from Task 16 on. */
  mergePlan: MergePlan;
}

function parseDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "1 file", "1,204 files". */
export function formatCount(n: number, word: string): string {
  return `${COUNT.format(n)} ${word}${n === 1 ? '' : 's'}`;
}

/** "Mar 2019" in UTC, or "" for an invalid date. */
export function formatMonthYear(iso: string): string {
  const d = parseDate(iso);
  return d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '';
}

/** "Mar 2019 · commit 1,204 · 224 files"; the commit number is 1-based. */
export function formatReadout(meta: SnapshotMeta, filesAlive: number): string {
  return `${formatMonthYear(meta.date)} · commit ${COUNT.format(meta.commitIndex + 1)} · ${formatCount(filesAlive, 'file')}`;
}

/** "Pushed all at once · 1 commit · 12 Mar 2024". */
export function formatOneCommit(dateIso: string): string {
  const d = parseDate(dateIso);
  const base = 'Pushed all at once · 1 commit';
  return d ? `${base} · ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : base;
}

export function buildTooltipInfo(args: TooltipArgs): TooltipInfo {
  const lines = [`${formatSize(args.bytes)} · ≈${formatCount(estimateLines(args.bytes), 'line')}`];
  if (args.changes !== null) {
    const when = args.lastChange ? ` · last ${formatMonthYear(args.lastChange.date)}` : '';
    lines.push(`changed in ${formatCount(args.changes, 'snapshot')}${when}`);
  }
  if (args.exact && args.lastChange?.author) lines.push(`last touched by ${args.lastChange.author}`);
  return { title: args.path, lines };
}
