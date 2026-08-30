// Four pure, independently testable similarity signals, each 0 to 1
// (or null for refSim when a reference is absent on either side). These
// are the entire deterministic vocabulary the matching engine reasons
// with; nothing here calls a model.

export function amountSim(a: number, b: number): number {
  if (a === b) return 1;
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return 1;
  return Math.max(0, 1 - Math.abs(a - b) / denom);
}

export function dateSim(daysApart: number): number {
  return Math.max(0, 1 - Math.abs(daysApart) / 7);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prevDiag + cost);
      prevDiag = temp;
    }
  }
  return dp[n];
}

function tokenRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Token-set similarity: for each token in the shorter name, take the
 *  best ratio against any token in the longer name, then average. */
export function nameSim(a: string, b: string): number {
  const ta = a.split(/\s+/).filter(Boolean);
  const tb = b.split(/\s+/).filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  let total = 0;
  for (const tok of shorter) {
    let best = 0;
    for (const other of longer) {
      const r = tokenRatio(tok, other);
      if (r > best) best = r;
    }
    total += best;
  }
  return total / shorter.length;
}

/** Longest common substring length over the longer reference's length.
 *  Returns null when either reference is absent, so callers can drop
 *  the term rather than treating "no reference" as a mismatch. */
export function refSim(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  let best = 0;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > best) best = dp[i][j];
      }
    }
  }
  return best / Math.max(m, n);
}
