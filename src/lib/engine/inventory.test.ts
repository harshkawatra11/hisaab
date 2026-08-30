import { describe, expect, it } from "vitest";
import { applyTransactionToInventory } from "./inventory";
import type { Product, Transaction, TxnItem } from "@/lib/types";

const OWNER = "owner1";

function product(id: string, stockQty: number): Product {
  return {
    id,
    ownerUid: OWNER,
    name: "Milk",
    normalizedName: "MILK",
    unit: "packet",
    unitPricePaise: 2500,
    gstRatePct: 5,
    stockQty,
  };
}

function item(productId: string, qty: number): TxnItem {
  return { productId, productName: "Milk", qty, unitPricePaise: 2500, lineTotalPaise: qty * 2500, gstRatePct: 5 };
}

function txn(type: Transaction["type"], items: TxnItem[]): Transaction {
  return {
    id: "t1",
    ownerUid: OWNER,
    eventId: "e1",
    date: "2026-08-10",
    type,
    source: "voice",
    amountPaise: 1000,
    taxPaise: 0,
    items,
    status: "open",
    createdAt: "2026-08-10T00:00:00.000Z",
  };
}

describe("applyTransactionToInventory", () => {
  it("increases stock on a purchase", () => {
    const products = [product("p1", 10)];
    const result = applyTransactionToInventory(products, txn("purchase", [item("p1", 20)]));
    expect(result.updatedProducts[0].stockQty).toBe(30);
    expect(result.warnings).toHaveLength(0);
  });

  it("decreases stock on a sale", () => {
    const products = [product("p1", 10)];
    const result = applyTransactionToInventory(products, txn("credit_sale", [item("p1", 3)]));
    expect(result.updatedProducts[0].stockQty).toBe(7);
  });

  it("allows negative stock but flags a warning, never throwing", () => {
    const products = [product("p1", 2)];
    const result = applyTransactionToInventory(products, txn("cash_sale", [item("p1", 5)]));
    expect(result.updatedProducts[0].stockQty).toBe(-3);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].resultingQty).toBe(-3);
  });

  it("leaves stock untouched for payment and expense transactions", () => {
    const products = [product("p1", 10)];
    const result = applyTransactionToInventory(products, txn("payment_in", []));
    expect(result.updatedProducts[0].stockQty).toBe(10);
  });
});
