import 'server-only';
import { createGitHub } from '@/lib/github/client';
import type { GitHub } from '@/lib/github/types';

let instance: GitHub | undefined;

/** Server-only GitHub client, built lazily from GITHUB_TOKEN. */
export function getGitHub(): GitHub {
  if (instance) return instance;
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  instance = createGitHub({ token });
  return instance;
}
