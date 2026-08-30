import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/store/memoryStore";
import {
  forecastCash,
  getCashPosition,
  getPartyBalance,
  getPnl,
  listExceptions,
  recordBusinessEvents,
  type ToolContext,
} from "./tools";
import { makeId } from "@/lib/ids";
import { normalizeName } from "@/lib/recon/normalize";
import type { HisaabStore } from "@/lib/store/types";

const OWNER = "owner1";
let store: HisaabStore;
let ctx: ToolContext;

beforeEach(async () => {
  store = createMemoryStore();
  ctx = { store, ownerUid: OWNER };
  // Seed a small product catalog, since the tools never invent a
  // product's price.
  await store.upsertProduct({
    id: makeId("prd"),
    ownerUid: OWNER,
    name: "Milk",
    normalizedName: normalizeName("Milk"),
    unit: "packet",
    unitPricePaise: 2500,
    gstRatePct: 5,
    stockQty: 100,
  });
  await store.upsertProduct({
    id: makeId("prd"),
    ownerUid: OWNER,
    name: "Bread",
    normalizedName: normalizeName("Bread"),
    unit: "packet",
    unitPricePaise: 4000,
    gstRatePct: 5,
    stockQty: 50,
  });
});

describe("recordBusinessEvents", () => {
  it("posts a credit sale and the spoken summary carries the engine's amount", async () => {
    const result = await recordBusinessEvents(ctx, {
      events: [
        {
          type: "credit_sale",
          customerName: "Rekha",
          items: [{ productName: "Milk", qty: 2 }],
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.spokenSummary).toContain("₹50.00"); // 2 x 2500 paise = ₹50
    expect(result.spokenSummary).toContain("Rekha");

    const transactions = await store.listTransactions(OWNER);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe("credit_sale");
  });

  it("resolves spoken Indian quantities before posting", async () => {
    const result = await recordBusinessEvents(ctx, {
      events: [{ type: "cash_sale", items: [{ productName: "Milk", qty: "dhai" }] }],
    });
    expect(result.ok).toBe(true);
    const transactions = await store.listTransactions(OWNER);
    expect(transactions[0].items[0].qty).toBe(2.5);
  });

  it("rejects a product the shop has never priced, rather than inventing one", async () => {
    await expect(
      recordBusinessEvents(ctx, {
        events: [{ type: "cash_sale", items: [{ productName: "Unobtainium Bars", qty: 1 }] }],
      })
    ).rejects.toThrow(/not a product/);
  });

  it("creates a new party on first mention and reuses it on the next", async () => {
    await recordBusinessEvents(ctx, {
      events: [{ type: "credit_sale", customerName: "Harsh", items: [{ productName: "Bread", qty: 1 }] }],
    });
    await recordBusinessEvents(ctx, {
      events: [{ type: "credit_sale", customerName: "Harsh", items: [{ productName: "Bread", qty: 1 }] }],
    });
    const parties = await store.listParties(OWNER);
    expect(parties.filter((p) => p.name === "Harsh")).toHaveLength(1);
  });

  it("handles multiple events from a single sentence in one call", async () => {
    const result = await recordBusinessEvents(ctx, {
      events: [
        { type: "inventory_purchase", supplierName: "Sharma Traders", items: [{ productName: "Milk", qty: 20 }] },
        { type: "credit_sale", customerName: "Rekha", items: [{ productName: "Milk", qty: 2 }, { productName: "Bread", qty: 1 }] },
      ],
    });
    expect(result.ok).toBe(true);
    const transactions = await store.listTransactions(OWNER);
    expect(transactions).toHaveLength(2);
  });
});

describe("getPartyBalance", () => {
  it("reports outstanding balance after a credit sale", async () => {
    await recordBusinessEvents(ctx, {
      events: [{ type: "credit_sale", customerName: "Rekha", items: [{ productName: "Milk", qty: 4 }] }],
    });
    const result = await getPartyBalance(ctx, { partyName: "Rekha" });
    expect(result.ok).toBe(true);
    expect(result.spokenSummary).toContain("Rekha");
    expect(result.spokenSummary).toContain("₹100.00"); // 4 x 2500
  });

  it("finds a party via fuzzy name match", async () => {
    await recordBusinessEvents(ctx, {
      events: [{ type: "credit_sale", customerName: "Rekha", items: [{ productName: "Milk", qty: 1 }] }],
    });
    const result = await getPartyBalance(ctx, { partyName: "rekha " });
    expect(result.ok).toBe(true);
  });

  it("fails clearly when no party matches", async () => {
    const result = await getPartyBalance(ctx, { partyName: "Nonexistent Customer" });
    expect(result.ok).toBe(false);
  });
});

describe("getCashPosition", () => {
  it("reflects posted transactions in the spoken summary", async () => {
    await recordBusinessEvents(ctx, {
      events: [{ type: "cash_sale", items: [{ productName: "Milk", qty: 10 }] }],
    });
    const result = await getCashPosition(ctx);
    expect(result.ok).toBe(true);
    expect(result.spokenSummary).toMatch(/Cash position is/);
  });
});

describe("forecastCash", () => {
  it("runs without a recorded shortfall on a small dataset", async () => {
    const result = await forecastCash(ctx, { horizonDays: 7 });
    expect(result.ok).toBe(true);
    expect(result.spokenSummary.length).toBeGreaterThan(0);
  });
});

describe("listExceptions", () => {
  it("returns zero when none exist", async () => {
    const result = await listExceptions(ctx, {});
    expect(result.ok).toBe(true);
    expect(result.spokenSummary).toContain("0 open");
  });
});

describe("getPnl", () => {
  it("computes revenue for a date range from posted sales", async () => {
    await recordBusinessEvents(ctx, {
      events: [{ type: "cash_sale", items: [{ productName: "Milk", qty: 5 }] }],
    });
    const result = await getPnl(ctx, { fromDate: "2020-01-01", toDate: "2030-01-01" });
    expect(result.ok).toBe(true);
    expect(result.spokenSummary).toMatch(/Revenue/);
  });
});
