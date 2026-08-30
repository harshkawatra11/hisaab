import { describe, expect, it } from "vitest";
import { postExpense, postPayment, postPurchase, postSale } from "./posting";
import type { TxnItem } from "@/lib/types";

const OWNER = "owner1";

function item(name: string, qty: number, unitPricePaise: number, gstRatePct: 0 | 5 | 12 | 18 | 28): TxnItem {
  return {
    productId: "prd_x",
    productName: name,
    qty,
    unitPricePaise,
    lineTotalPaise: qty * unitPricePaise,
    gstRatePct,
  };
}

function sumDebits(entries: { debitPaise: number }[]) {
  return entries.reduce((s, e) => s + e.debitPaise, 0);
}
function sumCredits(entries: { creditPaise: number }[]) {
  return entries.reduce((s, e) => s + e.creditPaise, 0);
}

describe("postPurchase", () => {
  it("balances debits and credits, credit purchase", () => {
    const { ledgerEntries } = postPurchase({
      ownerUid: OWNER,
      eventId: "evt1",
      date: "2026-08-01",
      source: "voice",
      partyNameRaw: "Sharma Traders",
      items: [item("Milk", 20, 2500, 5)],
      paymentMethod: "credit",
    });
    expect(sumDebits(ledgerEntries)).toBe(sumCredits(ledgerEntries));
    expect(ledgerEntries.find((e) => e.account === "PAYABLE")?.creditPaise).toBe(20 * 2500);
  });

  it("balances debits and credits, cash purchase", () => {
    const { ledgerEntries } = postPurchase({
      ownerUid: OWNER,
      eventId: "evt2",
      date: "2026-08-01",
      source: "manual",
      items: [item("Chips", 5, 1000, 12)],
      paymentMethod: "cash",
    });
    expect(sumDebits(ledgerEntries)).toBe(sumCredits(ledgerEntries));
    expect(ledgerEntries.find((e) => e.account === "CASH")?.creditPaise).toBe(5 * 1000);
  });
});

describe("postSale", () => {
  it("balances a credit sale and produces a receivable", () => {
    const { transaction, ledgerEntries } = postSale({
      ownerUid: OWNER,
      eventId: "evt3",
      date: "2026-08-02",
      source: "voice",
      partyNameRaw: "Rekha",
      items: [item("Milk", 2, 2500, 5), item("Bread", 1, 4000, 5), item("Chips", 5, 1000, 12)],
      paymentMethod: "credit",
    });
    expect(sumDebits(ledgerEntries)).toBe(sumCredits(ledgerEntries));
    expect(transaction.type).toBe("credit_sale");
    const receivable = ledgerEntries.find((e) => e.account === "RECEIVABLE");
    expect(receivable?.debitPaise).toBe(transaction.amountPaise);
  });

  it("balances a cash sale", () => {
    const { ledgerEntries } = postSale({
      ownerUid: OWNER,
      eventId: "evt4",
      date: "2026-08-02",
      source: "pos",
      items: [item("Milk", 3, 2500, 5)],
      paymentMethod: "cash",
    });
    expect(sumDebits(ledgerEntries)).toBe(sumCredits(ledgerEntries));
  });
});

describe("postPayment", () => {
  it("balances a payment received, cash", () => {
    const { ledgerEntries } = postPayment({
      ownerUid: OWNER,
      eventId: "evt5",
      date: "2026-08-05",
      source: "voice",
      partyNameRaw: "Rekha",
      amountPaise: 100000,
      direction: "in",
      method: "cash",
    });
    expect(sumDebits(ledgerEntries)).toBe(sumCredits(ledgerEntries));
  });

  it("balances a payment made, bank", () => {
    const { ledgerEntries } = postPayment({
      ownerUid: OWNER,
      eventId: "evt6",
      date: "2026-08-05",
      source: "bank",
      partyNameRaw: "Sharma Traders",
      amountPaise: 150000,
      direction: "out",
      method: "bank",
    });
    expect(sumDebits(ledgerEntries)).toBe(sumCredits(ledgerEntries));
  });
});

describe("postExpense", () => {
  it("balances an expense", () => {
    const { ledgerEntries } = postExpense({
      ownerUid: OWNER,
      eventId: "evt7",
      date: "2026-08-06",
      source: "manual",
      amountPaise: 20000,
      method: "cash",
      note: "Electricity bill",
    });
    expect(sumDebits(ledgerEntries)).toBe(sumCredits(ledgerEntries));
  });
});

describe("balance invariant, randomized", () => {
  it("holds across many random postings of every type", () => {
    for (let i = 0; i < 200; i++) {
      const qty = 1 + Math.floor(Math.random() * 20);
      const price = 100 + Math.floor(Math.random() * 5000);
      const rate = ([0, 5, 12, 18, 28] as const)[i % 5];
      const items = [item("X", qty, price, rate)];
      const { ledgerEntries: p1 } = postPurchase({
        ownerUid: OWNER,
        eventId: `r${i}a`,
        date: "2026-08-10",
        source: "voice",
        items,
        paymentMethod: i % 2 === 0 ? "credit" : "cash",
      });
      const { ledgerEntries: p2 } = postSale({
        ownerUid: OWNER,
        eventId: `r${i}b`,
        date: "2026-08-10",
        source: "voice",
        items,
        paymentMethod: i % 2 === 0 ? "cash" : "credit",
      });
      expect(sumDebits(p1)).toBe(sumCredits(p1));
      expect(sumDebits(p2)).toBe(sumCredits(p2));
    }
  });
});
