import { describe, expect, it } from "vitest";
import { computePartyKhata, settlePayment } from "./khata";
import type { Transaction } from "@/lib/types";

const OWNER = "owner1";

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

describe("computePartyKhata", () => {
  it("sums outstanding across multiple credit sales with no payment", () => {
    const txns = [
      creditSale("t1", "2026-08-01", 24000),
      creditSale("t2", "2026-08-05", 15000),
    ];
    const result = computePartyKhata(txns, "pty_rekha", "2026-08-10");
    expect(result.outstandingPaise).toBe(39000);
  });

  it("applies a payment FIFO against the oldest open sale first", () => {
    const txns = [
      creditSale("t1", "2026-08-01", 24000),
      creditSale("t2", "2026-08-05", 15000),
      paymentIn("t3", "2026-08-07", 20000),
    ];
    const result = computePartyKhata(txns, "pty_rekha", "2026-08-10");
    // t1 (24000) absorbs 20000, leaving 4000 open on t1, all of t2 still open
    expect(result.outstandingPaise).toBe(4000 + 15000);
    const t1 = result.openSales.find((s) => s.transactionId === "t1");
    expect(t1?.openPaise).toBe(4000);
  });

  it("fully settles when payment covers all open sales", () => {
    const txns = [creditSale("t1", "2026-08-01", 10000), paymentIn("t2", "2026-08-02", 10000)];
    const result = computePartyKhata(txns, "pty_rekha", "2026-08-03");
    expect(result.outstandingPaise).toBe(0);
    expect(result.openSales.length).toBe(0);
  });

  it("buckets aging at exactly 7, 15 and 30 day boundaries", () => {
    const txns = [
      creditSale("a", "2026-08-24", 100), // age 7 at asOf 2026-08-31 -> 0-7
      creditSale("b", "2026-08-16", 200), // age 15 -> 8-15
      creditSale("c", "2026-08-01", 300), // age 30 -> 16-30
      creditSale("d", "2026-07-01", 400), // age 61 -> 30+
    ];
    const result = computePartyKhata(txns, "pty_rekha", "2026-08-31");
    expect(result.aging.d0to7Paise).toBe(100);
    expect(result.aging.d8to15Paise).toBe(200);
    expect(result.aging.d16to30Paise).toBe(300);
    expect(result.aging.d30PlusPaise).toBe(400);
  });
});

describe("settlePayment", () => {
  it("reports which sales a payment would consume, FIFO, without mutating input", () => {
    const txns = [creditSale("t1", "2026-08-01", 5000), creditSale("t2", "2026-08-03", 8000)];
    const result = settlePayment(txns, "pty_rekha", 6000, "2026-08-10");
    expect(result.amountAppliedPaise).toBe(6000);
    expect(result.consumedSaleIds).toEqual(["t1", "t2"]);
    expect(result.residualPaise).toBe(0);
    // input transactions untouched
    const recomputed = computePartyKhata(txns, "pty_rekha", "2026-08-10");
    expect(recomputed.outstandingPaise).toBe(13000);
  });

  it("reports a residual when payment exceeds all open sales", () => {
    const txns = [creditSale("t1", "2026-08-01", 3000)];
    const result = settlePayment(txns, "pty_rekha", 5000, "2026-08-10");
    expect(result.amountAppliedPaise).toBe(3000);
    expect(result.residualPaise).toBe(2000);
  });
});
