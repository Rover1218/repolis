import type { CityErrorCode } from '@/lib/errors';

export type FileChange = [path: string, size: number | null];        // null = deleted
export type MergePlan = Array<{ folder: string; keep: string[]; count: number; subtree?: boolean }>;
export interface SnapshotMeta { index: number; commitIndex: number; sha: string; treeSha: string; date: string; author: string | null; message: string }
export interface LatestCity { fullName: string; defaultBranch: string; headSha: string; date: string; totalCommits: number; files: Array<[path: string, size: number]>; mode: 'full' | 'coarse'; mergePlan: MergePlan }
export interface CityManifest { fullName: string; headSha: string; totalCommits: number; exact: boolean; mode: 'full' | 'coarse'; batchSize: number; snapshots: SnapshotMeta[]; mergePlan: MergePlan; treeRequests: number }
export interface SnapshotDelta { index: number; changes: FileChange[] }
export interface SnapshotBatch { batch: number; deltas: SnapshotDelta[] }
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: { code: CityErrorCode; message: string; retryAfterMinutes?: number } };
