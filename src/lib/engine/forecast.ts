// The forward cash forecaster. Not an LLM, not a statistical black box
// like Prophet: a transparent recurrence model whose every projected
// rupee traces back to a named pattern in the merchant's own history.
// That transparency is a stated strength, not a limitation: every
// number in a ForecastResult can be explained by pointing at the
// RecurringPattern or the median that produced it.

import { addDays, daysBetween } from "@/lib/ids";
import type { ForecastDay, ForecastResult, RecurringPattern, Transaction } from "@/lib/types";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stddev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Detects recurring supplier-purchase patterns: group purchases by
 * (partyId, productId), compute the median inter-arrival gap and the
 * median quantity. A pattern needs at least 4 observations and a gap
 * standard deviation under 40% of the median gap to qualify: a real
 * weekly restock rhythm passes this comfortably, an irregular one-off
 * purchase repeated a few times by coincidence does not.
 */
export function detectRecurringPatterns(transactions: Transaction[]): RecurringPattern[] {
  const groups = new Map<string, { dates: string[]; qtys: number[] }>();

  for (const t of transactions) {
    if (t.type !== "purchase" || t.status === "void" || !t.partyId) continue;
    for (const item of t.items) {
      const key = `${t.partyId}|${item.productId}`;
      if (!groups.has(key)) groups.set(key, { dates: [], qtys: [] });
      const g = groups.get(key)!;
      g.dates.push(t.date);
      g.qtys.push(item.qty);
    }
  }

  const patterns: RecurringPattern[] = [];
  for (const [key, g] of groups) {
    if (g.dates.length < 4) continue;
    const sortedDates = [...g.dates].sort();
    const gaps: number[] = [];
    for (let i = 1; i < sortedDates.length; i++) {
      gaps.push(daysBetween(sortedDates[i - 1], sortedDates[i]));
    }
    const medianGap = median(gaps);
    if (medianGap <= 0) continue;
    const gapStddev = stddev(gaps, medianGap);
    if (gapStddev / medianGap > 0.4) continue;

    const [partyId, productId] = key.split("|");
    const observationCount = g.dates.length;
    const confidence = Math.max(0, Math.min(1, 1 - gapStddev / medianGap));
    patterns.push({
      partyId,
      productId,
      medianGapDays: Math.round(medianGap),
      medianQty: median(g.qtys),
      observationCount,
      confidence,
    });
  }

  return patterns;
}

/**
 * Median days between a credit sale's date and the date it was fully
 * settled, per party, from historical payments. Approximated by
 * pairing each payment_in against the oldest still-open credit sale at
 * the time it was recorded (the same FIFO order khata.ts settles by),
 * and measuring the lag to the sale that payment finally closes out.
 * Falls back to a documented default when a party has no settlement
 * history yet, rather than guessing.
 */
const DEFAULT_DAYS_TO_PAY = 7;

export function medianDaysToPay(transactions: Transaction[], partyId: string): number {
  const partyTxns = transactions
    .filter((t) => t.partyId === partyId && t.status !== "void")
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const openSales = partyTxns
    .filter((t) => t.type === "credit_sale")
    .map((t) => ({ date: t.date, openPaise: t.amountPaise }));

  const lags: number[] = [];
  for (const t of partyTxns) {
    if (t.type !== "payment_in") continue;
    let remaining = t.amountPaise;
    for (const sale of openSales) {
      if (remaining <= 0) break;
      if (sale.openPaise <= 0) continue;
      const applied = Math.min(sale.openPaise, remaining);
      sale.openPaise -= applied;
      remaining -= applied;
      if (sale.openPaise === 0) lags.push(daysBetween(sale.date, t.date));
    }
  }

  return lags.length > 0 ? median(lags) : DEFAULT_DAYS_TO_PAY;
}

function trailingMedianDailySales(transactions: Transaction[], asOfDate: string, windowDays = 14): number {
  const fromDate = addDays(asOfDate, -windowDays);
  const dailyTotals = new Map<string, number>();
  for (const t of transactions) {
    if (t.status === "void") continue;
    if (t.type !== "cash_sale" && t.type !== "credit_sale") continue;
    if (t.date < fromDate || t.date > asOfDate) continue;
    dailyTotals.set(t.date, (dailyTotals.get(t.date) ?? 0) + t.amountPaise);
  }
  const values = [...dailyTotals.values()];
  return values.length > 0 ? median(values) : 0;
}

export interface ForecastInput {
  transactions: Transaction[];
  openingCashPaise: number;
  asOfDate: string;
  horizonDays: number;
  unitPriceByProduct: Map<string, number>; // productId -> unitPricePaise (GST-inclusive)
  recurringExpensesPaise?: number; // flat daily estimate, optional
}

export function forecastCashPosition(input: ForecastInput): ForecastResult {
  const { transactions, openingCashPaise, asOfDate, horizonDays } = input;
  const patterns = detectRecurringPatterns(transactions);
  const dailySales = trailingMedianDailySales(transactions, asOfDate);

  // Precompute each open receivable and when it is expected to collect,
  // using that party's own median days-to-pay.
  const receivablesByDay = new Map<string, number>();
  const salesByParty = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.type === "credit_sale" && t.partyId) {
      if (!salesByParty.has(t.partyId)) salesByParty.set(t.partyId, []);
      salesByParty.get(t.partyId)!.push(t);
    }
  }
  for (const [partyId, sales] of salesByParty) {
    const daysToPay = medianDaysToPay(transactions, partyId);
    // Open balance approximated as sales minus payments already made,
    // FIFO-consistent with khata.ts; only the *unsettled* remainder
    // (transactions after the last payment) is projected forward.
    const paymentsTotal = transactions
      .filter((t) => t.partyId === partyId && t.type === "payment_in")
      .reduce((s, t) => s + t.amountPaise, 0);
    let toConsume = paymentsTotal;
    for (const sale of [...sales].sort((a, b) => a.date.localeCompare(b.date))) {
      if (toConsume >= sale.amountPaise) {
        toConsume -= sale.amountPaise;
        continue;
      }
      const openAmount = sale.amountPaise - toConsume;
      toConsume = 0;
      const expectedDate = addDays(sale.date, daysToPay);
      if (expectedDate >= asOfDate) {
        receivablesByDay.set(expectedDate, (receivablesByDay.get(expectedDate) ?? 0) + openAmount);
      }
    }
  }

  // Precompute projected recurring purchases per future date.
  const purchasesByDay = new Map<string, number>();
  for (const pattern of patterns) {
    const lastDate = [...transactions]
      .filter(
        (t) =>
          t.type === "purchase" &&
          t.partyId === pattern.partyId &&
          t.items.some((i) => i.productId === pattern.productId)
      )
      .map((t) => t.date)
      .sort()
      .at(-1);
    if (!lastDate) continue;
    const unitPrice = input.unitPriceByProduct.get(pattern.productId) ?? 0;
    let nextDate = addDays(lastDate, pattern.medianGapDays);
    while (nextDate <= addDays(asOfDate, horizonDays)) {
      if (nextDate >= asOfDate) {
        const amount = Math.round(pattern.medianQty * unitPrice);
        purchasesByDay.set(nextDate, (purchasesByDay.get(nextDate) ?? 0) + amount);
      }
      nextDate = addDays(nextDate, pattern.medianGapDays);
    }
  }

  const recurringExpenseDaily = input.recurringExpensesPaise ?? 0;

  const days: ForecastDay[] = [];
  let opening = openingCashPaise;
  let shortfallDate: string | null = null;
  let shortfallPaise = 0;
  const driverTotals = new Map<string, number>();

  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(asOfDate, i);
    const expectedSalesPaise = Math.round(dailySales);
    const expectedCollectionsPaise = receivablesByDay.get(date) ?? 0;
    const projectedPurchasesPaise = purchasesByDay.get(date) ?? 0;
    const scheduledPayablesPaise = 0; // payables scheduling is a stated Phase 2 extension
    const recurringExpensesPaise = recurringExpenseDaily;

    const closing =
      opening +
      expectedSalesPaise +
      expectedCollectionsPaise -
      projectedPurchasesPaise -
      scheduledPayablesPaise -
      recurringExpensesPaise;

    if (closing < 0 && shortfallDate === null) {
      shortfallDate = date;
      shortfallPaise = Math.abs(closing);
    }

    driverTotals.set("Projected supplier purchases", (driverTotals.get("Projected supplier purchases") ?? 0) + projectedPurchasesPaise);
    driverTotals.set("Recurring expenses", (driverTotals.get("Recurring expenses") ?? 0) + recurringExpensesPaise);
    driverTotals.set("Expected collections", (driverTotals.get("Expected collections") ?? 0) - expectedCollectionsPaise);

    days.push({
      date,
      openingPaise: opening,
      expectedSalesPaise,
      expectedCollectionsPaise,
      projectedPurchasesPaise,
      scheduledPayablesPaise,
      recurringExpensesPaise,
      closingPaise: closing,
    });

    opening = closing;
  }

  const drivers = [...driverTotals.entries()]
    .map(([label, amountPaise]) => ({ label, amountPaise }))
    .sort((a, b) => b.amountPaise - a.amountPaise)
    .slice(0, 3);

  return { days, shortfallDate, shortfallPaise, drivers };
}
