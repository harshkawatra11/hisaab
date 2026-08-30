// Computes the honest per-run summary. Precision/recall/F1 are only
// computed when ground truth is supplied (the synthetic dataset's
// generator produces it; a real production run would not have it,
// which is stated plainly wherever this shape is displayed).

import { makeId } from "@/lib/ids";
import type { CandidatePair } from "@/lib/recon/match";
import type { ReconciliationRun } from "@/lib/types";

export interface GroundTruthPair {
  internalTxnId: string;
  externalRecordId: string;
}

export interface BuildReportInput {
  ownerUid: string;
  totalInternal: number;
  totalExternal: number;
  exact: CandidatePair[];
  fuzzyAutoMatched: CandidatePair[];
  reviewCandidates: CandidatePair[];
  exceptionCount: number;
  runtimeMs: number;
  groundTruth?: GroundTruthPair[];
}

export interface PrecisionRecall {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

export function computePrecisionRecall(
  assignedMatched: CandidatePair[],
  groundTruth: GroundTruthPair[]
): PrecisionRecall {
  const truthSet = new Set(groundTruth.map((g) => `${g.internalTxnId}|${g.externalRecordId}`));
  let truePositives = 0;
  let falsePositives = 0;
  for (const c of assignedMatched) {
    const key = `${c.internalTxnId}|${c.externalRecordId}`;
    if (truthSet.has(key)) truePositives++;
    else falsePositives++;
  }
  const falseNegatives = groundTruth.length - truePositives;
  const precision = assignedMatched.length > 0 ? truePositives / assignedMatched.length : 0;
  const recall = groundTruth.length > 0 ? truePositives / groundTruth.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, truePositives, falsePositives, falseNegatives: Math.max(0, falseNegatives) };
}

export function buildReport(input: BuildReportInput): ReconciliationRun {
  const matched = [...input.exact, ...input.fuzzyAutoMatched];
  const matchedCount = matched.length;
  const reviewCount = input.reviewCandidates.length;
  const totalVariancePaise = matched.reduce((s, c) => s + Math.abs(c.signals.deltaPaise), 0);

  let precision: number | null = null;
  let recall: number | null = null;
  let f1: number | null = null;
  if (input.groundTruth) {
    const pr = computePrecisionRecall(matched, input.groundTruth);
    precision = pr.precision;
    recall = pr.recall;
    f1 = pr.f1;
  }

  return {
    id: makeId("run"),
    ownerUid: input.ownerUid,
    createdAt: new Date().toISOString(),
    totalInternal: input.totalInternal,
    totalExternal: input.totalExternal,
    matchedCount,
    reviewCount,
    exceptionCount: input.exceptionCount,
    matchRatePct: input.totalInternal > 0 ? (matchedCount / input.totalInternal) * 100 : 0,
    precision,
    recall,
    f1,
    totalVariancePaise,
    runtimeMs: input.runtimeMs,
  };
}
