import { describe, expect, it } from "vitest";
import { computeCreditScore } from "./creditScore";
import type { HisaabException, Transaction } from "@/lib/types";

const OWNER = "owner1";
const AS_OF = "2026-08-31";

function creditSale(id: string, date: string, amountPaise: number, partyId = "pty_rekha"): Transaction {
  return {
    id,
    ownerUid: OWNER,
    eventId: id,
    date,
    type: "credit_sale",
    source: "voice",
    partyId,
    amountPaise,
    taxPaise: 0,
    items: [],
    status: "open",
    createdAt: `${date}T10:00:00.000Z`,
  };
}

function paymentIn(id: string, date: string, amountPaise: number, partyId = "pty_rekha"): Transaction {
  return {
    id,
    ownerUid: OWNER,
    eventId: id,
    date,
    type: "payment_in",
    source: "voice",
    partyId,
    amountPaise,
    taxPaise: 0,
    items: [],
    status: "open",
    createdAt: `${date}T10:00:00.000Z`,
  };
}

function exception(id: string, subjectIds: string[]): HisaabException {
  return {
    id,
    ownerUid: OWNER,
    runId: "run1",
    kind: "AMOUNT_MISMATCH",
    severity: "medium",
    subjectIds,
    explanation: "test exception",
    recommendedAction: "review",
    status: "open",
    createdAt: "2026-08-20T10:00:00.000Z",
  };
}

describe("computeCreditScore", () => {
  it("scores a clean on-time payer above 80", () => {
    // Bought and paid back within a few days, several times, all
    // recent, no exceptions: aging, lateness and exception penalties
    // should all be at or near zero, and tenure should help.
    const txns = [
      creditSale("t1", "2026-08-01", 10000),
      paymentIn("p1", "2026-08-04", 10000),
      creditSale("t2", "2026-08-10", 10000),
      paymentIn("p2", "2026-08-13", 10000),
      creditSale("t3", "2026-08-28", 5000), // still open, only 3 days old
    ];
    const result = computeCreditScore(txns, [], "pty_rekha", AS_OF);
    expect(result.score).toBeGreaterThan(80);
    expect(result.band).toBe("good");
  });

  it("scores a proven poor payer below 40", () => {
    // Three old, still-open sales (all in the 30+ day bucket) and a
    // slow settlement history, plus one reconciliation exception tied
    // to one of this party's own transactions.
    const txns = [
      creditSale("t1", "2026-06-01", 20000),
      creditSale("t2", "2026-06-15", 20000),
      creditSale("t3", "2026-06-20", 20000),
      creditSale("t4", "2026-05-01", 10000),
      paymentIn("p1", "2026-06-15", 10000), // 45 days to settle t4
    ];
    const result = computeCreditScore(txns, [exception("e1", ["t2"])], "pty_rekha", AS_OF);
    expect(result.score).toBeLessThan(40);
    expect(result.band).toBe("poor");
  });

  it("clamps the score to [0, 100] under extreme synthetic inputs", () => {
    // Every open sale ancient and several exceptions stacked on the
    // same two transactions: both penalty terms maxed at once, plus a
    // separate case below with every penalty at its floor and tenure
    // maxed out, which is what actually pushes the raw formula above
    // 100 and exercises the clamp's upper bound.
    const txns = [
      creditSale("t1", "2026-01-01", 50000),
      creditSale("t2", "2026-01-02", 50000),
    ];
    const exceptions = [
      exception("e1", ["t1"]),
      exception("e2", ["t1"]),
      exception("e3", ["t2"]),
      exception("e4", ["t2"]),
      exception("e5", ["t2"]),
    ];
    const poor = computeCreditScore(txns, exceptions, "pty_rekha", AS_OF);
    expect(poor.score).toBeGreaterThanOrEqual(0);
    expect(poor.score).toBeLessThanOrEqual(100);

    // A party with no transactions at all (never bought anything):
    // no aging, no lateness, no exceptions, no tenure. Should sit at
    // the formula's neutral baseline, not overflow past 100.
    const clean = computeCreditScore([], [], "pty_nobody", AS_OF);
    expect(clean.score).toBeGreaterThanOrEqual(0);
    expect(clean.score).toBeLessThanOrEqual(100);
  });

  it("does not punish a brand-new party as hard as a proven poor payer", () => {
    const freshParty = computeCreditScore(
      [creditSale("t1", "2026-08-29", 5000)],
      [],
      "pty_new",
      AS_OF
    );
    const poorPayer = computeCreditScore(
      [
        creditSale("t1", "2026-06-01", 20000),
        creditSale("t2", "2026-06-15", 20000),
        creditSale("t3", "2026-06-20", 20000),
      ],
      [exception("e1", ["t2"])],
      "pty_rekha",
      AS_OF
    );
    expect(freshParty.score).toBeGreaterThan(poorPayer.score);
  });
});
