// Profit and loss for a date range, built entirely from posted
// Transaction records. COGS uses weighted-average cost from purchase
// history rather than a separate cost-tracking system, which is
// sufficient for the demo scale and stated as such rather than hidden
// behind a false precision.

import type { Product, Transaction } from "@/lib/types";

export interface PnlResult {
  fromDate: string;
  toDate: string;
  revenuePaise: number;
  cogsPaise: number;
  grossProfitPaise: number;
  grossMarginPct: number;
  expensesPaise: number;
  netProfitPaise: number;
  outputGstPaise: number;
  inputGstPaise: number;
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/** Weighted-average unit cost per product, computed from all purchases
 *  up to (and including) toDate, so COGS reflects prices actually paid
 *  rather than the product's current list price. */
function weightedAverageCost(transactions: Transaction[], toDate: string): Map<string, number> {
  const totals = new Map<string, { qty: number; costPaise: number }>();
  for (const t of transactions) {
    if (t.type !== "purchase" || t.status === "void" || t.date > toDate) continue;
    for (const item of t.items) {
      const exTaxUnitPaise = Math.round(
        item.unitPricePaise / (1 + item.gstRatePct / 100)
      );
      const prev = totals.get(item.productId) ?? { qty: 0, costPaise: 0 };
      totals.set(item.productId, {
        qty: prev.qty + item.qty,
        costPaise: prev.costPaise + item.qty * exTaxUnitPaise,
      });
    }
  }
  const avg = new Map<string, number>();
  for (const [productId, { qty, costPaise }] of totals) {
    if (qty > 0) avg.set(productId, Math.round(costPaise / qty));
  }
  return avg;
}

export function computePnl(
  transactions: Transaction[],
  _products: Product[],
  fromDate: string,
  toDate: string
): PnlResult {
  const costByProduct = weightedAverageCost(transactions, toDate);

  let revenuePaise = 0;
  let cogsPaise = 0;
  let outputGstPaise = 0;
  let inputGstPaise = 0;
  let expensesPaise = 0;

  for (const t of transactions) {
    if (t.status === "void" || !inRange(t.date, fromDate, toDate)) continue;

    if (t.type === "cash_sale" || t.type === "credit_sale") {
      revenuePaise += t.amountPaise - t.taxPaise;
      outputGstPaise += t.taxPaise;
      for (const item of t.items) {
        const unitCost = costByProduct.get(item.productId) ?? 0;
        cogsPaise += unitCost * item.qty;
      }
    }
    if (t.type === "purchase") {
      inputGstPaise += t.taxPaise;
    }
    if (t.type === "expense") {
      expensesPaise += t.amountPaise;
    }
  }

  const grossProfitPaise = revenuePaise - cogsPaise;
  const grossMarginPct = revenuePaise > 0 ? (grossProfitPaise / revenuePaise) * 100 : 0;
  const netProfitPaise = grossProfitPaise - expensesPaise;

  return {
    fromDate,
    toDate,
    revenuePaise,
    cogsPaise,
    grossProfitPaise,
    grossMarginPct,
    expensesPaise,
    netProfitPaise,
    outputGstPaise,
    inputGstPaise,
  };
}
