// The eight tools shared by the Live voice session and the text chat
// fallback. Every handler follows one rule without exception: it calls
// the deterministic engine for any number it needs, then reads the
// number back into spokenSummary, which is assembled by a string
// template here, never phrased freely by the model. The model's job
// is choosing which tool to call and reading the summary aloud, not
// computing what the summary says.

import { z } from "zod";
import { makeId, todayIST } from "@/lib/ids";
import { formatCompactINR, formatINR } from "@/lib/money";
import { postExpense, postPayment, postPurchase, postSale } from "@/lib/engine/posting";
import { applyTransactionToInventory } from "@/lib/engine/inventory";
import { computePartyKhata } from "@/lib/engine/khata";
import { computeGstSummary } from "@/lib/engine/tax";
import { computePnl } from "@/lib/engine/pnl";
import { forecastCashPosition } from "@/lib/engine/forecast";
import { resolveParty, resolveProduct } from "@/lib/agent/resolve";
import { requireIndianNumeral } from "@/lib/agent/numerals";
import { normalizeName } from "@/lib/recon/normalize";
import { nameSim } from "@/lib/recon/signals";
import type { HisaabStore } from "@/lib/store/types";
import type { Account, Transaction } from "@/lib/types";

export interface ToolContext {
  store: HisaabStore;
  ownerUid: string;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  spokenSummary: string;
}

function fail(message: string): ToolResult {
  return { ok: false, error: message, spokenSummary: message };
}

// --- record_business_events -------------------------------------------------

const qtyOrWords = z.union([z.number().positive(), z.string().min(1)]);

const itemSchema = z.object({
  productName: z.string().min(1),
  qty: qtyOrWords,
});

const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("inventory_purchase"),
    supplierName: z.string().min(1),
    items: z.array(itemSchema).min(1),
    paymentMethod: z.enum(["credit", "cash"]).default("credit"),
  }),
  z.object({
    type: z.literal("cash_sale"),
    items: z.array(itemSchema).min(1),
  }),
  z.object({
    type: z.literal("credit_sale"),
    customerName: z.string().min(1),
    items: z.array(itemSchema).min(1),
  }),
  z.object({
    type: z.literal("payment_received"),
    partyName: z.string().min(1),
    amountPaise: z.number().positive(),
    method: z.enum(["cash", "bank"]).default("cash"),
  }),
  z.object({
    type: z.literal("payment_made"),
    partyName: z.string().min(1),
    amountPaise: z.number().positive(),
    method: z.enum(["cash", "bank"]).default("cash"),
  }),
  z.object({
    type: z.literal("expense"),
    amountPaise: z.number().positive(),
    note: z.string().optional(),
    method: z.enum(["cash", "bank"]).default("cash"),
  }),
]);

export const recordBusinessEventsSchema = z.object({
  events: z.array(eventSchema).min(1),
  date: z.string().optional(),
});

function resolveQty(qty: number | string): number {
  return typeof qty === "number" ? qty : requireIndianNumeral(qty);
}

export async function recordBusinessEvents(
  ctx: ToolContext,
  rawArgs: z.input<typeof recordBusinessEventsSchema>
): Promise<ToolResult<{ transactions: Transaction[] }>> {
  const args = recordBusinessEventsSchema.parse(rawArgs);
  const { store, ownerUid } = ctx;
  const date = args.date ?? todayIST();
  const posted: Transaction[] = [];
  const summaries: string[] = [];

  for (const event of args.events) {
    if (event.type === "inventory_purchase") {
      const supplier = await resolveParty(store, ownerUid, "supplier", event.supplierName);
      const products = await Promise.all(
        event.items.map(async (i) => ({ product: await resolveProduct(store, ownerUid, i.productName), qty: resolveQty(i.qty) }))
      );
      const items = products.map(({ product, qty }) => ({
        productId: product.id,
        productName: product.name,
        qty,
        unitPricePaise: product.unitPricePaise,
        lineTotalPaise: Math.round(qty * product.unitPricePaise),
        gstRatePct: product.gstRatePct,
      }));
      const { transaction, ledgerEntries } = postPurchase({
        ownerUid,
        eventId: makeId("txn"),
        date,
        source: "voice",
        partyId: supplier.id,
        partyNameRaw: supplier.name,
        items,
        paymentMethod: event.paymentMethod,
      });
      await store.createTransaction(transaction);
      await store.createLedgerEntries(ledgerEntries);
      const { updatedProducts } = applyTransactionToInventory(products.map((p) => p.product), transaction);
      for (const p of updatedProducts) await store.upsertProduct(p);
      posted.push(transaction);
      summaries.push(`Purchase of ${formatINR(transaction.amountPaise)} from ${supplier.name} recorded.`);
    }

    if (event.type === "cash_sale" || event.type === "credit_sale") {
      const isCredit = event.type === "credit_sale";
      const customer = isCredit
        ? await resolveParty(store, ownerUid, "customer", (event as { customerName: string }).customerName)
        : undefined;
      const products = await Promise.all(
        event.items.map(async (i) => ({ product: await resolveProduct(store, ownerUid, i.productName), qty: resolveQty(i.qty) }))
      );
      const items = products.map(({ product, qty }) => ({
        productId: product.id,
        productName: product.name,
        qty,
        unitPricePaise: product.unitPricePaise,
        lineTotalPaise: Math.round(qty * product.unitPricePaise),
        gstRatePct: product.gstRatePct,
      }));
      const { transaction, ledgerEntries } = postSale({
        ownerUid,
        eventId: makeId("txn"),
        date,
        source: "voice",
        partyId: customer?.id,
        partyNameRaw: customer?.name,
        items,
        paymentMethod: isCredit ? "credit" : "cash",
      });
      await store.createTransaction(transaction);
      await store.createLedgerEntries(ledgerEntries);
      const { updatedProducts } = applyTransactionToInventory(products.map((p) => p.product), transaction);
      for (const p of updatedProducts) await store.upsertProduct(p);
      posted.push(transaction);
      summaries.push(
        isCredit
          ? `Credit sale of ${formatINR(transaction.amountPaise)} to ${customer!.name} recorded.`
          : `Cash sale of ${formatINR(transaction.amountPaise)} recorded.`
      );
    }

    if (event.type === "payment_received" || event.type === "payment_made") {
      const kind: PartyLookup = event.type === "payment_received" ? "customer" : "supplier";
      const party = await resolveParty(store, ownerUid, kind, event.partyName);
      const { transaction, ledgerEntries } = postPayment({
        ownerUid,
        eventId: makeId("txn"),
        date,
        source: "voice",
        partyId: party.id,
        partyNameRaw: party.name,
        amountPaise: event.amountPaise,
        direction: event.type === "payment_received" ? "in" : "out",
        method: event.method,
      });
      await store.createTransaction(transaction);
      await store.createLedgerEntries(ledgerEntries);
      posted.push(transaction);
      summaries.push(
        event.type === "payment_received"
          ? `Payment of ${formatINR(transaction.amountPaise)} received from ${party.name}, recorded.`
          : `Payment of ${formatINR(transaction.amountPaise)} made to ${party.name}, recorded.`
      );
    }

    if (event.type === "expense") {
      const { transaction, ledgerEntries } = postExpense({
        ownerUid,
        eventId: makeId("txn"),
        date,
        source: "voice",
        amountPaise: event.amountPaise,
        method: event.method,
        note: event.note,
      });
      await store.createTransaction(transaction);
      await store.createLedgerEntries(ledgerEntries);
      posted.push(transaction);
      summaries.push(`Expense of ${formatINR(transaction.amountPaise)} recorded${event.note ? ` (${event.note})` : ""}.`);
    }
  }

  return {
    ok: true,
    data: { transactions: posted },
    spokenSummary: summaries.join(" "),
  };
}

type PartyLookup = "customer" | "supplier";

// --- get_party_balance -------------------------------------------------

export const getPartyBalanceSchema = z.object({ partyName: z.string().min(1) });

export async function getPartyBalance(
  ctx: ToolContext,
  args: z.infer<typeof getPartyBalanceSchema>
): Promise<ToolResult> {
  const { store, ownerUid } = ctx;
  const all = await store.listParties(ownerUid);
  const normalized = normalizeName(args.partyName);
  let best = all.find((p) => p.normalizedName === normalized);
  if (!best) {
    let bestScore = 0;
    for (const p of all) {
      const score = nameSim(normalized, p.normalizedName);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (bestScore < 0.6) best = undefined;
  }
  if (!best) {
    return fail(`I don't have a party matching "${args.partyName}" on record.`);
  }

  const transactions = await store.listTransactions(ownerUid);
  const summary = computePartyKhata(transactions, best.id);
  const recentItems = summary.openSales.slice(-5);

  return {
    ok: true,
    data: { party: best, summary, recentItems },
    spokenSummary:
      summary.outstandingPaise > 0
        ? `${best.name} owes ${formatINR(summary.outstandingPaise)}, across ${summary.openSales.length} open ${summary.openSales.length === 1 ? "sale" : "sales"}.`
        : `${best.name} has no outstanding balance.`,
  };
}

// --- get_cash_position -------------------------------------------------

export async function getCashPosition(ctx: ToolContext): Promise<ToolResult> {
  const transactions = await ctx.store.listTransactions(ctx.ownerUid);
  const ledgerEntries = await ctx.store.listLedgerEntries(ctx.ownerUid);

  function balance(account: Account): number {
    return ledgerEntries
      .filter((e) => e.account === account)
      .reduce((s, e) => s + e.debitPaise - e.creditPaise, 0);
  }

  const cash = balance("CASH");
  const bank = balance("BANK");
  const receivables = balance("RECEIVABLE");
  const payables = -balance("PAYABLE");

  return {
    ok: true,
    data: { cashPaise: cash, bankPaise: bank, receivablesPaise: receivables, payablesPaise: payables },
    spokenSummary: `Cash position is ${formatCompactINR(cash + bank)}. Receivables ${formatCompactINR(receivables)}, payables ${formatCompactINR(payables)}. ${transactions.length} transactions recorded so far.`,
  };
}

// --- forecast_cash -------------------------------------------------

export const forecastCashSchema = z.object({ horizonDays: z.number().int().positive().max(60).default(14) });

export async function forecastCash(
  ctx: ToolContext,
  rawArgs: z.input<typeof forecastCashSchema>
): Promise<ToolResult> {
  const args = forecastCashSchema.parse(rawArgs);
  const transactions = await ctx.store.listTransactions(ctx.ownerUid);
  const products = await ctx.store.listProducts(ctx.ownerUid);
  const ledgerEntries = await ctx.store.listLedgerEntries(ctx.ownerUid);
  const cashPaise = ledgerEntries
    .filter((e) => e.account === "CASH" || e.account === "BANK")
    .reduce((s, e) => s + e.debitPaise - e.creditPaise, 0);

  const unitPriceByProduct = new Map(products.map((p) => [p.id, p.unitPricePaise]));
  const result = forecastCashPosition({
    transactions,
    openingCashPaise: cashPaise,
    asOfDate: todayIST(),
    horizonDays: args.horizonDays,
    unitPriceByProduct,
  });

  await ctx.store.saveForecast(ctx.ownerUid, result);

  const spokenSummary = result.shortfallDate
    ? `Projected shortfall of ${formatINR(result.shortfallPaise)} around ${result.shortfallDate}. Largest driver: ${result.drivers[0]?.label ?? "supplier purchases"}.`
    : `No shortfall projected over the next ${args.horizonDays} days.`;

  return { ok: true, data: result, spokenSummary };
}

// --- list_exceptions -------------------------------------------------

export const listExceptionsSchema = z.object({ kind: z.string().optional() });

export async function listExceptions(
  ctx: ToolContext,
  args: z.infer<typeof listExceptionsSchema>
): Promise<ToolResult> {
  const all = await ctx.store.listExceptions(ctx.ownerUid);
  const filtered = args.kind ? all.filter((e) => e.kind === args.kind) : all;
  const open = filtered.filter((e) => e.status === "open");
  return {
    ok: true,
    data: { exceptions: open },
    spokenSummary: `${open.length} open ${open.length === 1 ? "exception" : "exceptions"}${args.kind ? ` of kind ${args.kind}` : ""}.`,
  };
}

// --- explain_match -------------------------------------------------

export const explainMatchSchema = z.object({ transactionId: z.string().min(1) });

export async function explainMatch(
  ctx: ToolContext,
  args: z.infer<typeof explainMatchSchema>
): Promise<ToolResult> {
  const matches = await ctx.store.listMatches(ctx.ownerUid);
  const match = matches.find((m) => m.internalTxnId === args.transactionId);
  if (!match) {
    const exceptions = await ctx.store.listExceptions(ctx.ownerUid);
    const exc = exceptions.find((e) => e.subjectIds.includes(args.transactionId));
    if (exc) {
      return { ok: true, data: { exception: exc }, spokenSummary: exc.explanation };
    }
    return fail("No match or exception record found for that transaction.");
  }
  const s = match.signals;
  return {
    ok: true,
    data: { match },
    spokenSummary: `${match.decision} at ${(match.confidence * 100).toFixed(0)}% confidence via ${match.method} matching. Amount similarity ${(s.amountSim * 100).toFixed(0)}%, date similarity ${(s.dateSim * 100).toFixed(0)}%, name similarity ${(s.nameSim * 100).toFixed(0)}%. ${match.reason}`,
  };
}

// --- get_pnl -------------------------------------------------

export const getPnlSchema = z.object({ fromDate: z.string(), toDate: z.string() });

export async function getPnl(ctx: ToolContext, args: z.infer<typeof getPnlSchema>): Promise<ToolResult> {
  const transactions = await ctx.store.listTransactions(ctx.ownerUid);
  const products = await ctx.store.listProducts(ctx.ownerUid);
  const result = computePnl(transactions, products, args.fromDate, args.toDate);
  const gst = computeGstSummary(transactions.filter((t) => t.date >= args.fromDate && t.date <= args.toDate));
  return {
    ok: true,
    data: { ...result, gst },
    spokenSummary: `Revenue ${formatCompactINR(result.revenuePaise)}, gross margin ${result.grossMarginPct.toFixed(1)}%, net profit ${formatCompactINR(result.netProfitPaise)}. GST payable ${formatCompactINR(gst.netPayablePaise)}.`,
  };
}

// --- focus_dashboard -------------------------------------------------

export const focusDashboardSchema = z.object({
  view: z.enum(["control", "reconcile", "khata", "books"]),
  entityId: z.string().optional(),
});

/** Purely a client-side navigation signal; the server just validates
 *  and echoes it back for the client to act on. No engine call, since
 *  there is no number to compute here. */
export async function focusDashboard(
  _ctx: ToolContext,
  args: z.infer<typeof focusDashboardSchema>
): Promise<ToolResult> {
  return { ok: true, data: args, spokenSummary: "" };
}
