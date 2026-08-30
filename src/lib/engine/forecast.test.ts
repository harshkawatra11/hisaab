import { describe, expect, it } from "vitest";
import { detectRecurringPatterns, forecastCashPosition, medianDaysToPay } from "./forecast";
import { paise } from "@/lib/money";
import type { Transaction, TxnItem } from "@/lib/types";

const OWNER = "owner1";

function purchaseItem(qty: number): TxnItem {
  return { productId: "prd_milk", productName: "Milk", qty, unitPricePaise: paise(25), lineTotalPaise: qty * paise(25), gstRatePct: 5 };
}

function purchase(date: string, qty: number, partyId = "pty_wholesaler"): Transaction {
  return {
    id: `p_${date}`,
    ownerUid: OWNER,
    eventId: "e",
    date,
    type: "purchase",
    source: "voice",
    partyId,
    amountPaise: qty * paise(25),
    taxPaise: 0,
    items: [purchaseItem(qty)],
    status: "open",
    createdAt: `${date}T00:00:00.000Z`,
  };
}

function creditSale(id: string, date: string, amountPaise: number, partyId: string): Transaction {
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
    createdAt: `${date}T00:00:00.000Z`,
  };
}

function paymentIn(id: string, date: string, amountPaise: number, partyId: string): Transaction {
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
    createdAt: `${date}T00:00:00.000Z`,
  };
}

describe("detectRecurringPatterns", () => {
  it("detects a weekly restock pattern with the right cadence", () => {
    const txns = [
      purchase("2026-07-06", 20),
      purchase("2026-07-13", 20),
      purchase("2026-07-20", 22),
      purchase("2026-07-27", 20),
      purchase("2026-08-03", 21),
    ];
    const patterns = detectRecurringPatterns(txns);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].medianGapDays).toBe(7);
    expect(patterns[0].partyId).toBe("pty_wholesaler");
    expect(patterns[0].productId).toBe("prd_milk");
    expect(patterns[0].observationCount).toBe(5);
  });

  it("does not treat 3 irregular purchases as a pattern (needs 4+ observations)", () => {
    const txns = [purchase("2026-07-01", 5), purchase("2026-07-20", 8), purchase("2026-08-15", 3)];
    expect(detectRecurringPatterns(txns)).toHaveLength(0);
  });

  it("rejects a pattern whose gaps are too irregular", () => {
    const txns = [
      purchase("2026-07-01", 10),
      purchase("2026-07-05", 10),
      purchase("2026-07-25", 10),
      purchase("2026-08-01", 10),
    ];
    expect(detectRecurringPatterns(txns)).toHaveLength(0);
  });
});

describe("medianDaysToPay", () => {
  it("falls back to the documented default with no settlement history", () => {
    expect(medianDaysToPay([], "pty_x")).toBe(7);
  });

  it("computes the median lag between a credit sale and its full settlement", () => {
    const txns = [
      creditSale("s1", "2026-08-01", paise(1000), "pty_rekha"),
      paymentIn("pay1", "2026-08-06", paise(1000), "pty_rekha"), // 5 day lag
      creditSale("s2", "2026-08-10", paise(2000), "pty_rekha"),
      paymentIn("pay2", "2026-08-19", paise(2000), "pty_rekha"), // 9 day lag
    ];
    expect(medianDaysToPay(txns, "pty_rekha")).toBe(7);
  });
});

describe("forecastCashPosition", () => {
  it("projects a recurring purchase forward at the detected cadence", () => {
    const txns = [
      purchase("2026-07-27", 20),
      purchase("2026-08-03", 20),
      purchase("2026-08-10", 20),
      purchase("2026-08-17", 20),
    ];
    const result = forecastCashPosition({
      transactions: txns,
      openingCashPaise: paise(100000),
      asOfDate: "2026-08-18",
      horizonDays: 14,
      unitPriceByProduct: new Map([["prd_milk", paise(25)]]),
    });
    // Next purchase expected 2026-08-24 (17 + 7)
    const purchaseDay = result.days.find((d) => d.date === "2026-08-24");
    expect(purchaseDay?.projectedPurchasesPaise).toBeGreaterThan(0);
  });

  it("flags a shortfall date when projected purchases exceed available cash", () => {
    const txns = [
      purchase("2026-08-01", 1000),
      purchase("2026-08-08", 1000),
      purchase("2026-08-15", 1000),
      purchase("2026-08-22", 1000),
    ];
    const result = forecastCashPosition({
      transactions: txns,
      openingCashPaise: paise(100),
      asOfDate: "2026-08-23",
      horizonDays: 14,
      unitPriceByProduct: new Map([["prd_milk", paise(25)]]),
    });
    expect(result.shortfallDate).not.toBeNull();
    expect(result.shortfallPaise).toBeGreaterThan(0);
  });

  it("names the largest drivers", () => {
    const result = forecastCashPosition({
      transactions: [],
      openingCashPaise: paise(50000),
      asOfDate: "2026-08-18",
      horizonDays: 7,
      unitPriceByProduct: new Map(),
    });
    expect(result.drivers.length).toBeGreaterThan(0);
    expect(result.drivers.length).toBeLessThanOrEqual(3);
  });
});
