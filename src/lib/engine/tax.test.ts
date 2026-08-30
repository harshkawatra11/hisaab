import { describe, expect, it } from "vitest";
import { checkInvoiceTax, computeGstSummary } from "./tax";
import { paise } from "@/lib/money";
import type { Transaction } from "@/lib/types";

const OWNER = "owner1";

function txn(type: Transaction["type"], taxPaise: number, status: Transaction["status"] = "open"): Transaction {
  return {
    id: `t_${Math.random()}`,
    ownerUid: OWNER,
    eventId: "e",
    date: "2026-08-10",
    type,
    source: "voice",
    amountPaise: 1000 + taxPaise,
    taxPaise,
    items: [],
    status,
    createdAt: "2026-08-10T00:00:00.000Z",
  };
}

describe("computeGstSummary", () => {
  it("sums output GST from sales and input GST from purchases", () => {
    const txns = [
      txn("credit_sale", paise(50)),
      txn("cash_sale", paise(30)),
      txn("purchase", paise(20)),
    ];
    const summary = computeGstSummary(txns);
    expect(summary.outputGstPaise).toBe(paise(80));
    expect(summary.inputGstPaise).toBe(paise(20));
    expect(summary.netPayablePaise).toBe(paise(60));
  });

  it("ignores void transactions", () => {
    const txns = [txn("credit_sale", paise(50)), txn("credit_sale", paise(999), "void")];
    const summary = computeGstSummary(txns);
    expect(summary.outputGstPaise).toBe(paise(50));
  });
});

describe("checkInvoiceTax", () => {
  it("finds no discrepancy when declared GST matches the rate exactly", () => {
    const result = checkInvoiceTax({
      basePaise: paise(10000),
      ratePct: 5,
      declaredCgstPaise: paise(250),
      declaredSgstPaise: paise(250),
    });
    expect(result.isDiscrepant).toBe(false);
    expect(result.deltaPaise).toBe(0);
  });

  it("flags a ₹50 GST mismatch on a ₹10,500 invoice", () => {
    const result = checkInvoiceTax({
      basePaise: paise(10000),
      ratePct: 5,
      declaredCgstPaise: paise(225),
      declaredSgstPaise: paise(225),
    });
    expect(result.isDiscrepant).toBe(true);
    expect(result.deltaPaise).toBe(paise(-50));
  });

  it("does not flag a rounding difference under one rupee", () => {
    const result = checkInvoiceTax({
      basePaise: paise(10000),
      ratePct: 5,
      declaredCgstPaise: paise(250) - 30,
      declaredSgstPaise: paise(250) + 30,
    });
    expect(result.isDiscrepant).toBe(false);
  });
});
