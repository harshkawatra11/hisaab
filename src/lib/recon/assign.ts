// Greedy one-to-one assignment over already-scored candidate pairs.
// Greedy, not the Hungarian algorithm: explainable per pair matters
// more here than the last fraction of a percent of optimality, and
// greedy-by-descending-confidence is easy to reason about when a
// merchant asks "why did you pick that one".

import type { CandidatePair } from "@/lib/recon/match";

export function assignGreedy(candidates: CandidatePair[]): CandidatePair[] {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const claimedExternal = new Set<string>();
  const claimedInternal = new Set<string>();
  const assigned: CandidatePair[] = [];

  for (const c of sorted) {
    if (claimedExternal.has(c.externalRecordId) || claimedInternal.has(c.internalTxnId)) continue;
    claimedExternal.add(c.externalRecordId);
    claimedInternal.add(c.internalTxnId);
    assigned.push(c);
  }

  return assigned;
}
