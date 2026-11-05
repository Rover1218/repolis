/** First argument of a GLSL call starting at `open` (the index of its "("), up to the top-level comma. */
function firstArgument(source: string, open: number): string {
  let depth = 0;
  for (let i = open + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      if (depth === 0) return source.slice(open + 1, i).trim();
      depth -= 1;
    } else if (ch === ',' && depth === 0) return source.slice(open + 1, i).trim();
  }
  return source.slice(open + 1).trim();
}

/** True when the whole expression is one max(...) or clamp(...) call, not a call with more maths after it. */
function isWholeGuardCall(base: string): boolean {
  const lead = /^(max|clamp)\s*\(/.exec(base);
  if (!lead) return false;
  let depth = 0;
  for (let i = lead[0].length - 1; i < base.length; i += 1) {
    if (base[i] === '(') depth += 1;
    else if (base[i] === ')') {
      depth -= 1;
      if (depth === 0) return i === base.length - 1;
    }
  }
  return false;
}

/**
 * Bases of `pow()` calls not clamped to be non-negative. Direct3D (ANGLE on Windows) computes
 * pow as exp2(y * log2(x)), so a base that rounds a hair below zero gives NaN.
 */
export function unguardedPowBases(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const bad: string[] = [];
  for (const match of code.matchAll(/\bpow\s*\(/g)) {
    const base = firstArgument(code, match.index + match[0].length - 1);
    if (!isWholeGuardCall(base)) bad.push(base);
  }
  return bad;
}
