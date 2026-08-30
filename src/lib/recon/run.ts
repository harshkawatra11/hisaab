// Orchestrates one full reconciliation pass: match, assign, build
// exceptions, build the report. This is the function both the API
// route and the eval script call, so the two can never silently
// diverge in how a "run" is defined.

import { assignGreedy } from "@/lib/recon/assign";
import { buildExceptions } from "@/lib/recon/exceptions";
import { runMatchEngine } from "@/lib/recon/match";
import { buildReport, type GroundTruthPair } from "@/lib/recon/report";
import { detectSplitPayments } from "@/lib/recon/splitPayments";
import { makeId } from "@/lib/ids";
import type { ExternalRecord, HisaabException, Match, ReconciliationRun, Transaction } from "@/lib/types";

export interface ReconciliationOutput {
  run: ReconciliationRun;
  matches: Match[];
  exceptions: HisaabException[];
}

export function executeReconciliation(
  ownerUid: string,
  internalTxns: Transaction[],
  externalRecords: ExternalRecord[],
  groundTruth?: GroundTruthPair[]
): ReconciliationOutput {
  const startedAt = Date.now();
  const runId = makeId("run");

  const engineResult = runMatchEngine(internalTxns, externalRecords);
  const allCandidates = [
    ...engineResult.exact,
    ...engineResult.fuzzyAutoMatched,
    ...engineResult.reviewCandidates,
  ];
  const assigned = assignGreedy(allCandidates);
  const assignedMatched = assigned.filter((c) => c.decision === "MATCHED");
  const assignedReview = assigned.filter((c) => c.decision === "REVIEW");
  const assignedExternalIds = new Set(assigned.map((c) => c.externalRecordId));

  // Split-payment detection runs before generic exception building: it
  // needs first claim on the truly unmatched pool so a settlement paid
  // in two pieces is reported as one honest SPLIT_PAYMENT_SUSPECTED
  // exception, not two misleading UNMATCHED_BANK_* rows.
  const trulyUnmatchedInternalIds = new Set(engineResult.unmatched.map((u) => u.internalTxnId));
  const trulyUnmatchedInternalTxns = internalTxns.filter((t) => trulyUnmatchedInternalIds.has(t.id));
  const unclaimedExternalRecords = externalRecords.filter((e) => !assignedExternalIds.has(e.id));

  const splitPayments = detectSplitPayments(
    ownerUid,
    runId,
    trulyUnmatchedInternalTxns,
    unclaimedExternalRecords
  );

  const remainingUnmatchedInternalIds = engineResult.unmatched
    .map((u) => u.internalTxnId)
    .filter((id) => !splitPayments.consumedInternalIds.has(id));
  const remainingExternalRecords = externalRecords.filter(
    (e) => !splitPayments.consumedExternalIds.has(e.id)
  );

  const genericExceptions = buildExceptions({
    ownerUid,
    runId,
    internalTxns,
    externalRecords: remainingExternalRecords,
    assigned: assignedMatched,
    reviewCandidates: assignedReview,
    unmatchedInternalIds: remainingUnmatchedInternalIds,
  });

  const exceptions = [...splitPayments.exceptions, ...genericExceptions];

  const runtimeMs = Date.now() - startedAt;

  const run = buildReport({
    ownerUid,
    totalInternal: internalTxns.length,
    totalExternal: externalRecords.length,
    exact: engineResult.exact.filter((c) => assignedMatched.includes(c)),
    fuzzyAutoMatched: engineResult.fuzzyAutoMatched.filter((c) => assignedMatched.includes(c)),
    reviewCandidates: assignedReview,
    exceptionCount: exceptions.length,
    runtimeMs,
    groundTruth,
  });
  run.id = runId;

  const matches: Match[] = assigned.map((c) => ({
    id: makeId("mch"),
    ownerUid,
    internalTxnId: c.internalTxnId,
    externalRecordId: c.externalRecordId,
    confidence: c.confidence,
    signals: c.signals,
    decision: c.decision,
    method: c.method,
    reason: c.reason,
    runId,
    createdAt: new Date().toISOString(),
  }));

  return { run, matches, exceptions };
}
