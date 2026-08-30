// Turns everything the match engine could not confidently resolve into
// a typed, explained Exception. Never silently forces a match: an
// amount delta that survives assignment still gets flagged if it is
// large enough to be worth a human's attention, even when it auto-
// posted as MATCHED.

import { makeId } from "@/lib/ids";
import type { CandidatePair } from "@/lib/recon/match";
import type { ExternalRecord, HisaabException, Transaction } from "@/lib/types";

const MISMATCH_FLAG_PAISE = 100; // ₹1, mirrors the tax-discrepancy threshold

export interface BuildExceptionsInput {
  ownerUid: string;
  runId: string;
  internalTxns: Transaction[];
  externalRecords: ExternalRecord[];
  assigned: CandidatePair[];
  reviewCandidates: CandidatePair[];
  unmatchedInternalIds: string[];
}

export function buildExceptions(input: BuildExceptionsInput): HisaabException[] {
  const { ownerUid, runId } = input;
  const exceptions: HisaabException[] = [];
  const now = new Date().toISOString();

  const assignedInternalIds = new Set(input.assigned.map((c) => c.internalTxnId));
  const assignedExternalIds = new Set(input.assigned.map((c) => c.externalRecordId));

  // Amount deltas on assigned pairs, e.g. a settlement fee.
  for (const c of input.assigned) {
    if (Math.abs(c.signals.deltaPaise) >= MISMATCH_FLAG_PAISE) {
      exceptions.push({
        id: makeId("exc"),
        ownerUid,
        runId,
        kind: "AMOUNT_MISMATCH",
        severity: Math.abs(c.signals.deltaPaise) > 5000 ? "high" : "medium",
        subjectIds: [c.internalTxnId, c.externalRecordId],
        amountPaise: c.signals.deltaPaise,
        explanation: `Matched at ${(c.confidence * 100).toFixed(0)}% confidence, but the amounts differ by ${(Math.abs(c.signals.deltaPaise) / 100).toFixed(2)} rupees. Likely a settlement or processing fee.`,
        recommendedAction: "Review the settlement fee before posting an adjustment.",
        status: "open",
        createdAt: now,
      });
    }
  }

  // Review-band candidates that never got a Layer 3 decision or were
  // still below threshold after one: surfaced honestly, not hidden.
  for (const c of input.reviewCandidates) {
    if (assignedInternalIds.has(c.internalTxnId)) continue;
    exceptions.push({
      id: makeId("exc"),
      ownerUid,
      runId,
      kind: "UNKNOWN_COUNTERPARTY",
      severity: "medium",
      subjectIds: [c.internalTxnId, c.externalRecordId],
      explanation: `Best candidate scored ${(c.confidence * 100).toFixed(0)}%, below the ${90}% auto-post threshold. ${c.reason}`,
      recommendedAction: "Manual review: confirm the counterparty and post if correct.",
      status: "open",
      createdAt: now,
    });
  }

  // Fully unmatched internal transactions.
  for (const id of input.unmatchedInternalIds) {
    if (assignedInternalIds.has(id)) continue;
    const t = input.internalTxns.find((x) => x.id === id);
    exceptions.push({
      id: makeId("exc"),
      ownerUid,
      runId,
      kind: "UNMATCHED_LEDGER_ENTRY",
      severity: "high",
      subjectIds: [id],
      amountPaise: t?.amountPaise,
      explanation: "No external record scored above the review floor for this internal transaction.",
      recommendedAction: "Check whether the settlement has not yet arrived, or whether this was recorded in error.",
      status: "open",
      createdAt: now,
    });
  }

  // External records nothing claimed at all.
  for (const e of input.externalRecords) {
    if (assignedExternalIds.has(e.id)) continue;
    const alreadyFlagged = input.reviewCandidates.some((c) => c.externalRecordId === e.id);
    if (alreadyFlagged) continue;
    exceptions.push({
      id: makeId("exc"),
      ownerUid,
      runId,
      kind: e.direction === "credit" ? "UNMATCHED_BANK_CREDIT" : "UNMATCHED_BANK_DEBIT",
      severity: "high",
      subjectIds: [e.id],
      amountPaise: e.amountPaise,
      explanation: `No internal transaction matched this ${e.source} record. It may not have been captured yet, or may be a split payment against more than one internal event.`,
      recommendedAction: "Check for a missing voice capture, or a split payment across multiple sales.",
      status: "open",
      createdAt: now,
    });
  }

  return exceptions;
}
