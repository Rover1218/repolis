export const DISTRICT_SPLIT_SHARE = 0.35;
export const ROOT_DISTRICT = '/';

const MAX_DISTRICT_DEPTH = 8;

export interface DistrictChoice {
  readonly districts: string[];
  readonly districtOf: (path: string) => string;
}

type Group = readonly [key: string, members: readonly string[]];

function firstFolderKey(path: string): string {
  const slash = path.indexOf('/');
  return slash === -1 ? ROOT_DISTRICT : path.slice(0, slash);
}

function appendTo(groups: Map<string, string[]>, key: string, path: string): void {
  const members = groups.get(key);
  if (members) {
    members.push(path);
  } else {
    groups.set(key, [path]);
  }
}

function groupByFirstFolder(paths: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    appendTo(groups, firstFolderKey(path), path);
  }
  return groups;
}

function depthOf(key: string): number {
  return key.split('/').length;
}

function relativeTo(key: string, path: string): string {
  return path.slice(key.length + 1);
}

function shouldSplit(key: string, members: readonly string[], total: number): boolean {
  if (key === ROOT_DISTRICT || depthOf(key) >= MAX_DISTRICT_DEPTH) {
    return false;
  }
  if (members.length / total <= DISTRICT_SPLIT_SHARE) {
    return false;
  }
  return members.some((path) => relativeTo(key, path).includes('/'));
}

/** Files directly in the group keep its key; the rest regroup by the next segment. */
function splitGroup(key: string, members: readonly string[]): Group[] {
  const direct: string[] = [];
  const children = new Map<string, string[]>();
  for (const path of members) {
    const rest = relativeTo(key, path);
    const slash = rest.indexOf('/');
    if (slash === -1) {
      direct.push(path);
      continue;
    }
    const childKey = `${key}/${rest.slice(0, slash)}`;
    appendTo(children, childKey, path);
  }
  const childGroups: Group[] = [...children.entries()];
  return direct.length > 0 ? [[key, direct], ...childGroups] : childGroups;
}

function settle(key: string, members: readonly string[], total: number): Group[] {
  if (!shouldSplit(key, members, total)) {
    return [[key, members]];
  }
  return splitGroup(key, members).flatMap(([childKey, childMembers]) =>
    settle(childKey, childMembers, total),
  );
}

function longestDistrictPrefix(path: string, keys: ReadonlySet<string>): string {
  for (let end = path.lastIndexOf('/'); end > 0; end = path.lastIndexOf('/', end - 1)) {
    const candidate = path.slice(0, end);
    if (keys.has(candidate)) {
      return candidate;
    }
  }
  return ROOT_DISTRICT;
}

/**
 * Chooses which folders become the city's districts. Folders holding more than
 * DISTRICT_SPLIT_SHARE of all paths split by their next segment, up to depth 8.
 */
export function chooseDistricts(paths: readonly string[]): DistrictChoice {
  const total = paths.length;
  const settled = [...groupByFirstFolder(paths)].flatMap(([key, members]) =>
    settle(key, members, total),
  );
  const districts = settled.map(([key]) => key).sort();
  const keys: ReadonlySet<string> = new Set(districts);

  return {
    districts,
    districtOf: (path: string) => longestDistrictPrefix(path, keys),
  };
}
