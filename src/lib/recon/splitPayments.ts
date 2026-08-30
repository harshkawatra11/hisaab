// Detects the one defect class the three-layer matcher is not designed
// to solve: one internal settlement paid in two pieces across two
// external records. A 1:1 matcher cannot resolve this by construction,
// and it should not silently pretend to. This runs on the unmatched
// pools left over after assignment, looking for a same-counterparty,
// close-in-date pair of external records whose sum equals one
// unmatched internal transaction, and raises exactly one honest
// SPLIT_PAYMENT_SUSPECTED exception for it rather than two generic
// unmatched exceptions that would obscure what actually happened.

import { makeId } from "@/lib/ids";
import { normalizeDate, normalizeName } from "@/lib/recon/normalize";
import { nameSim } from "@/lib/recon/signals";
import { daysBetween } from "@/lib/ids";
import type { ExternalRecord, HisaabException, Transaction } from "@/lib/types";

const DATE_WINDOW_DAYS = 3;
const NAME_SIM_FLOOR = 0.55;
const SUM_TOLERANCE_PAISE = 500; // ₹5, absorbs rounding across the split

export interface SplitPaymentDetectionResult {
  exceptions: HisaabException[];
  consumedInternalIds: Set<string>;
  consumedExternalIds: Set<string>;
}

export function detectSplitPayments(
  ownerUid: string,
  runId: string,
  unmatchedInternal: Transaction[],
  unmatchedExternal: ExternalRecord[]
): SplitPaymentDetectionResult {
  const exceptions: HisaabException[] = [];
  const consumedInternalIds = new Set<string>();
  const consumedExternalIds = new Set<string>();
  const now = new Date().toISOString();

  const externalPool = unmatchedExternal.map((e) => ({
    record: e,
    date: normalizeDate(e.date),
    name: normalizeName(e.counterpartyRaw ?? e.narration ?? ""),
  }));

  for (const internal of unmatchedInternal) {
    const internalName = normalizeName(internal.partyNameRaw ?? "");
    if (!internalName) continue;

    const candidates = externalPool.filter(
      (x) =>
        !consumedExternalIds.has(x.record.id) &&
        Math.abs(daysBetween(internal.date, x.date)) <= DATE_WINDOW_DAYS &&
        nameSim(internalName, x.name) >= NAME_SIM_FLOOR
    );

    let found: [typeof candidates[number], typeof candidates[number]] | null = null;
    outer: for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const sum = candidates[i].record.amountPaise + candidates[j].record.amountPaise;
        if (Math.abs(sum - internal.amountPaise) <= SUM_TOLERANCE_PAISE) {
          found = [candidates[i], candidates[j]];
          break outer;
        }
      }
    }

    if (found) {
      const [a, b] = found;
      consumedInternalIds.add(internal.id);
      consumedExternalIds.add(a.record.id);
      consumedExternalIds.add(b.record.id);
      exceptions.push({
        id: makeId("exc"),
        ownerUid,
        runId,
        kind: "SPLIT_PAYMENT_SUSPECTED",
        severity: "medium",
        subjectIds: [internal.id, a.record.id, b.record.id],
        amountPaise: internal.amountPaise,
        explanation: `One settlement of ${(internal.amountPaise / 100).toFixed(2)} rupees was not found as a single external record, but two records from a similarly named counterparty, dated within ${DATE_WINDOW_DAYS} days of each other, sum to within a few rupees of the total. Likely the same settlement paid in two parts.`,
        recommendedAction: "Confirm both records belong to this settlement, then mark resolved manually. The matcher does not auto-resolve split payments by design.",
        status: "open",
        createdAt: now,
      });
    }
  }

  return { exceptions, consumedInternalIds, consumedExternalIds };
}
