import { describe, expect, it } from "vitest";
import { assignGreedy } from "./assign";
import type { CandidatePair } from "@/lib/recon/match";

function pair(internalTxnId: string, externalRecordId: string, confidence: number): CandidatePair {
  return {
    internalTxnId,
    externalRecordId,
    confidence,
    signals: { amountSim: 1, dateSim: 1, nameSim: 1, refSim: 1, daysApart: 0, deltaPaise: 0 },
    decision: "MATCHED",
    method: "fuzzy",
    reason: "test",
  };
}

describe("assignGreedy", () => {
  it("never claims the same external record twice", () => {
    const candidates = [pair("t1", "x1", 0.95), pair("t2", "x1", 0.93)];
    const assigned = assignGreedy(candidates);
    const externalIds = assigned.map((a) => a.externalRecordId);
    expect(new Set(externalIds).size).toBe(externalIds.length);
  });

  it("never claims the same internal transaction twice", () => {
    const candidates = [pair("t1", "x1", 0.95), pair("t1", "x2", 0.93)];
    const assigned = assignGreedy(candidates);
    const internalIds = assigned.map((a) => a.internalTxnId);
    expect(new Set(internalIds).size).toBe(internalIds.length);
  });

  it("prefers the higher-confidence pair when two compete for the same external record", () => {
    const candidates = [pair("t1", "x1", 0.80), pair("t2", "x1", 0.95)];
    const assigned = assignGreedy(candidates);
    expect(assigned).toHaveLength(1);
    expect(assigned[0].internalTxnId).toBe("t2");
  });

  it("assigns every non-conflicting pair", () => {
    const candidates = [pair("t1", "x1", 0.9), pair("t2", "x2", 0.9), pair("t3", "x3", 0.9)];
    const assigned = assignGreedy(candidates);
    expect(assigned).toHaveLength(3);
  });
});
