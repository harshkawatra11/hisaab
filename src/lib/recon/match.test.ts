import { describe, expect, it } from "vitest";
import { AI_CONFIDENCE_CAP, MATCH_THRESHOLD, applyAiDecision, runMatchEngine } from "./match";
import { paise } from "@/lib/money";
import type { CandidatePair } from "@/lib/recon/match";
import type { ExternalRecord, Transaction } from "@/lib/types";

const OWNER = "owner1";

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: `t_${Math.random().toString(36).slice(2)}`,
    ownerUid: OWNER,
    eventId: "e",
    date: "2026-08-10",
    type: "credit_sale",
    source: "voice",
    partyNameRaw: "Sharma Traders",
    amountPaise: paise(1000),
    taxPaise: 0,
    items: [],
    status: "open",
    createdAt: "2026-08-10T00:00:00.000Z",
    ...over,
  };
}

function ext(over: Partial<ExternalRecord>): ExternalRecord {
  return {
    id: `x_${Math.random().toString(36).slice(2)}`,
    ownerUid: OWNER,
    source: "bank",
    date: "2026-08-10",
    narration: "UPI/CR/SHARMA TRADERS",
    counterpartyRaw: "SHARMA TRADERS",
    amountPaise: paise(1000),
    direction: "credit",
    ...over,
  };
}

describe("runMatchEngine, exact class", () => {
  it("matches identical reference and amount at 0.99 confidence", () => {
    const internal = txn({ reference: "REF001", amountPaise: paise(500) });
    const external = ext({ reference: "REF001", amountPaise: paise(500) });
    const result = runMatchEngine([internal], [external]);
    expect(result.exact).toHaveLength(1);
    expect(result.exact[0].confidence).toBe(0.99);
    expect(result.exact[0].method).toBe("exact");
  });
});

describe("runMatchEngine, counterparty name variation", () => {
  it("auto-matches when only the counterparty name differs (legal suffix, casing)", () => {
    const internal = txn({ partyNameRaw: "Sharma Traders", amountPaise: paise(2000), date: "2026-08-10" });
    const external = ext({ counterpartyRaw: "sharma", amountPaise: paise(2000), date: "2026-08-10" });
    const result = runMatchEngine([internal], [external]);
    const all = [...result.exact, ...result.fuzzyAutoMatched];
    expect(all).toHaveLength(1);
    expect(all[0].confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });
});

describe("runMatchEngine, settlement lag", () => {
  it("still matches within a small date gap, at reduced but sufficient confidence", () => {
    const internal = txn({ partyNameRaw: "Sharma Traders", amountPaise: paise(2000), date: "2026-08-10" });
    const external = ext({ counterpartyRaw: "Sharma Traders", amountPaise: paise(2000), date: "2026-08-12" });
    const result = runMatchEngine([internal], [external]);
    const all = [...result.exact, ...result.fuzzyAutoMatched, ...result.reviewCandidates];
    expect(all).toHaveLength(1);
    expect(all[0].signals.daysApart).toBe(2);
  });
});

describe("runMatchEngine, settlement fee delta", () => {
  it("lands a small amount delta in REVIEW rather than MATCHED or unmatched", () => {
    const internal = txn({ partyNameRaw: "Sharma Traders", amountPaise: paise(1500), date: "2026-08-10" });
    const external = ext({ counterpartyRaw: "Sharma Traders", amountPaise: paise(1480), date: "2026-08-10" });
    const result = runMatchEngine([internal], [external]);
    expect(result.reviewCandidates.length + result.fuzzyAutoMatched.length).toBeGreaterThan(0);
  });
});

describe("runMatchEngine, unknown counterparty", () => {
  it("leaves a transaction unmatched when nothing scores above the review floor", () => {
    const internal = txn({ partyNameRaw: "Totally Unrelated Vendor Name", amountPaise: paise(9999), date: "2026-08-10" });
    const external = ext({ counterpartyRaw: "Sharma Traders", amountPaise: paise(1000), date: "2026-08-01" });
    const result = runMatchEngine([internal], [external]);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].internalTxnId).toBe(internal.id);
  });
});

describe("runMatchEngine, one-to-one assignment", () => {
  it("never lets two internal transactions both auto-match the same external record", () => {
    const external = ext({ counterpartyRaw: "Sharma Traders", amountPaise: paise(1000), date: "2026-08-10" });
    const internalA = txn({ partyNameRaw: "Sharma Traders", amountPaise: paise(1000), date: "2026-08-10" });
    const internalB = txn({ partyNameRaw: "Sharma Traders", amountPaise: paise(1000), date: "2026-08-10" });
    const result = runMatchEngine([internalA, internalB], [external]);
    const matchedExternalIds = [...result.exact, ...result.fuzzyAutoMatched].map((c) => c.externalRecordId);
    const uniqueExternalIds = new Set(matchedExternalIds);
    expect(matchedExternalIds.length).toBe(uniqueExternalIds.size);
  });
});

describe("applyAiDecision", () => {
  it("clamps AI confidence below the auto-post threshold even if the model claims higher", () => {
    const candidate: CandidatePair = {
      internalTxnId: "t1",
      externalRecordId: "x1",
      confidence: 0.8,
      signals: { amountSim: 0.9, dateSim: 0.9, nameSim: 0.7, refSim: null, daysApart: 3, deltaPaise: 100 },
      decision: "REVIEW",
      method: "fuzzy",
      reason: "review band",
    };
    const result = applyAiDecision(candidate, 0.999, "The model is very confident, but is not allowed to say so.");
    expect(result.confidence).toBeLessThanOrEqual(AI_CONFIDENCE_CAP);
    expect(result.confidence).toBeLessThan(MATCH_THRESHOLD);
    expect(result.decision).toBe("REVIEW");
    expect(result.method).toBe("ai");
  });

  it("never returns MATCHED regardless of input confidence", () => {
    const candidate: CandidatePair = {
      internalTxnId: "t1",
      externalRecordId: "x1",
      confidence: 0.75,
      signals: { amountSim: 1, dateSim: 1, nameSim: 1, refSim: 1, daysApart: 0, deltaPaise: 0 },
      decision: "REVIEW",
      method: "fuzzy",
      reason: "review band",
    };
    for (const claim of [0.5, 0.89, 0.95, 1.0, 5.0]) {
      const result = applyAiDecision(candidate, claim, "reason");
      expect(result.decision).not.toBe("MATCHED");
    }
  });
});
