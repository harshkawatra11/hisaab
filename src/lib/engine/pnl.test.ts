import { describe, expect, it } from "vitest";
import { computePnl } from "./pnl";
import { paise } from "@/lib/money";
import type { Transaction, TxnItem } from "@/lib/types";

const OWNER = "owner1";

function item(qty: number, unitPricePaise: number, gstRatePct: 0 | 5 | 12 | 18 | 28 = 5): TxnItem {
  return { productId: "prd_milk", productName: "Milk", qty, unitPricePaise, lineTotalPaise: qty * unitPricePaise, gstRatePct };
}

function purchase(date: string, qty: number, unitPricePaise: number): Transaction {
  return {
    id: `p_${date}`,
    ownerUid: OWNER,
    eventId: "e",
    date,
    type: "purchase",
    source: "voice",
    amountPaise: qty * unitPricePaise,
    taxPaise: Math.round((qty * unitPricePaise * 5) / 105),
    items: [item(qty, unitPricePaise)],
    status: "open",
    createdAt: `${date}T00:00:00.000Z`,
  };
}

function sale(date: string, qty: number, unitPricePaise: number): Transaction {
  return {
    id: `s_${date}`,
    ownerUid: OWNER,
    eventId: "e",
    date,
    type: "cash_sale",
    source: "voice",
    amountPaise: qty * unitPricePaise,
    taxPaise: Math.round((qty * unitPricePaise * 5) / 105),
    items: [item(qty, unitPricePaise)],
    status: "open",
    createdAt: `${date}T00:00:00.000Z`,
  };
}

describe("computePnl", () => {
  it("computes revenue, COGS at weighted-average cost, and gross margin", () => {
    const txns = [
      purchase("2026-08-01", 10, paise(20)), // ex-tax cost ~19.05/unit
      sale("2026-08-05", 5, paise(30)),
    ];
    const result = computePnl(txns, [], "2026-08-01", "2026-08-10");
    expect(result.revenuePaise).toBeGreaterThan(0);
    expect(result.cogsPaise).toBeGreaterThan(0);
    expect(result.grossProfitPaise).toBe(result.revenuePaise - result.cogsPaise);
    expect(result.grossMarginPct).toBeGreaterThan(0);
  });

  it("excludes transactions outside the date range", () => {
    const txns = [sale("2026-07-01", 5, paise(30))];
    const result = computePnl(txns, [], "2026-08-01", "2026-08-10");
    expect(result.revenuePaise).toBe(0);
  });

  it("subtracts expenses to reach net profit", () => {
    const txns: Transaction[] = [
      sale("2026-08-01", 10, paise(30)),
      {
        id: "exp1",
        ownerUid: OWNER,
        eventId: "e",
        date: "2026-08-02",
        type: "expense",
        source: "manual",
        amountPaise: paise(50),
        taxPaise: 0,
        items: [],
        status: "open",
        createdAt: "2026-08-02T00:00:00.000Z",
      },
    ];
    const result = computePnl(txns, [], "2026-08-01", "2026-08-10");
    expect(result.expensesPaise).toBe(paise(50));
    expect(result.netProfitPaise).toBe(result.grossProfitPaise - paise(50));
  });
});
