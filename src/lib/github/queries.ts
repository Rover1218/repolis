import { CityError } from '@/lib/errors';

export const MAX_ALIASES_PER_REQUEST = 50;

const COMMIT_FIELDS = 'oid committedDate messageHeadline tree { oid } author { name user { login } }';

export const REPO_HEAD_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    defaultBranchRef {
      name
      target {
        ... on Commit {
          ${COMMIT_FIELDS}
          history(first: 0) { totalCount }
        }
      }
    }
  }
}`;

export const COMMIT_COUNT_QUERY = `query($owner: String!, $name: String!, $sha: GitObjectID!) {
  repository(owner: $owner, name: $name) {
    object(oid: $sha) { ... on Commit { history(first: 0) { totalCount } } }
  }
}`;

// Only [0-9a-zA-Z] is allowed because headSha is interpolated into the cursor string.
const SAFE_SHA = /^[0-9a-zA-Z]+$/;

export function assertSafeSha(sha: string): void {
  if (!SAFE_SHA.test(sha)) throw new CityError('invalid-link');
}

/** Alias `r<rank>`; rank 0 is the head, rank r >= 1 pages after cursor "<head> <r-1>". */
export function buildRanksQuery(ranks: readonly number[], headSha: string): string {
  assertSafeSha(headSha);
  const aliases = ranks.map((r) => {
    if (!Number.isInteger(r) || r < 0) throw new RangeError(`invalid commit rank ${r}`);
    const after = r === 0 ? '' : `, after: "${headSha} ${r - 1}"`;
    return `    r${r}: history(first: 1${after}) { nodes { ...C } }`;
  });
  return `query($owner: String!, $name: String!, $sha: GitObjectID!) {
  repository(owner: $owner, name: $name) {
    object(oid: $sha) {
      ... on Commit {
${aliases.join('\n')}
      }
    }
  }
}
fragment C on Commit { ${COMMIT_FIELDS} }`;
}
