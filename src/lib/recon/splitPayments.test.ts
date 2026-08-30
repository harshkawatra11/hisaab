import { describe, expect, it } from "vitest";
import { detectSplitPayments } from "./splitPayments";
import { paise } from "@/lib/money";
import type { ExternalRecord, Transaction } from "@/lib/types";

const OWNER = "owner1";

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: "t1",
    ownerUid: OWNER,
    eventId: "e",
    date: "2026-08-10",
    type: "payment_in",
    source: "voice",
    partyNameRaw: "Sharma Traders",
    amountPaise: paise(1500),
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
    counterpartyRaw: "Sharma Traders",
    amountPaise: paise(750),
    direction: "credit",
    ...over,
  };
}

describe("detectSplitPayments", () => {
  it("finds two external records that sum to one unmatched internal settlement", () => {
    const internal = txn({ amountPaise: paise(1500) });
    const half1 = ext({ amountPaise: paise(750), date: "2026-08-10" });
    const half2 = ext({ amountPaise: paise(750), date: "2026-08-11" });
    const result = detectSplitPayments(OWNER, "run1", [internal], [half1, half2]);
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0].kind).toBe("SPLIT_PAYMENT_SUSPECTED");
    expect(result.exceptions[0].subjectIds).toEqual([internal.id, half1.id, half2.id]);
    expect(result.consumedInternalIds.has(internal.id)).toBe(true);
    expect(result.consumedExternalIds.has(half1.id)).toBe(true);
    expect(result.consumedExternalIds.has(half2.id)).toBe(true);
  });

  it("does not flag unrelated externals with a different counterparty name", () => {
    const internal = txn({ amountPaise: paise(1500) });
    const half1 = ext({ amountPaise: paise(750), counterpartyRaw: "Zepto Marketplace" });
    const half2 = ext({ amountPaise: paise(750), counterpartyRaw: "Amazon Pay" });
    const result = detectSplitPayments(OWNER, "run1", [internal], [half1, half2]);
    expect(result.exceptions).toHaveLength(0);
  });

  it("does not flag externals outside the date window", () => {
    const internal = txn({ amountPaise: paise(1500), date: "2026-08-10" });
    const half1 = ext({ amountPaise: paise(750), date: "2026-08-10" });
    const half2 = ext({ amountPaise: paise(750), date: "2026-08-25" });
    const result = detectSplitPayments(OWNER, "run1", [internal], [half1, half2]);
    expect(result.exceptions).toHaveLength(0);
  });

  it("does not double-consume an external record across two internal candidates", () => {
    const internalA = txn({ id: "ta", amountPaise: paise(1500) });
    const internalB = txn({ id: "tb", amountPaise: paise(1500) });
    const half1 = ext({ amountPaise: paise(750) });
    const half2 = ext({ amountPaise: paise(750) });
    const half3 = ext({ amountPaise: paise(750) });
    const result = detectSplitPayments(OWNER, "run1", [internalA, internalB], [half1, half2, half3]);
    // Only one internal can be resolved since only 3 externals exist (one pair consumes 2, leaving 1 unusable)
    expect(result.exceptions.length).toBeLessThanOrEqual(1);
    const allConsumedExternal = result.exceptions.flatMap((e) => e.subjectIds.slice(1));
    expect(new Set(allConsumedExternal).size).toBe(allConsumedExternal.length);
  });
});
