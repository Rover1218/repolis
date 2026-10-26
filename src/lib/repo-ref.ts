export interface RepoRef {
  owner: string;
  repo: string;
}

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const GITHUB_HTTP_PREFIX = /^(?:https?:\/\/)?(?:www\.)?github\.com\//i;
const GITHUB_SSH_PREFIX = /^git@github\.com:/i;
const ANY_URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const GIT_SUFFIX = /\.git$/;

export function isValidOwner(s: string): boolean {
  return OWNER_PATTERN.test(s);
}

export function isValidRepoName(s: string): boolean {
  return REPO_PATTERN.test(s) && s !== '.' && s !== '..';
}

function stripHostPrefix(path: string): string | null {
  if (GITHUB_SSH_PREFIX.test(path)) return path.replace(GITHUB_SSH_PREFIX, '');
  if (GITHUB_HTTP_PREFIX.test(path)) return path.replace(GITHUB_HTTP_PREFIX, '');
  if (ANY_URL_SCHEME.test(path) || path.includes('@')) return null;
  return path;
}

export function parseRepoInput(input: string): RepoRef | null {
  const trimmed = input.trim();
  const path = stripHostPrefix(trimmed);
  if (path === null) return null;

  const [owner, rawRepo] = path.replace(/\/+$/, '').split('/');
  if (owner === undefined || rawRepo === undefined) return null;

  const repo = rawRepo.replace(GIT_SUFFIX, '');
  if (!isValidOwner(owner) || !isValidRepoName(repo)) return null;
  return { owner, repo };
}
