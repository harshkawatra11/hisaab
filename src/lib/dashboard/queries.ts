// Server-only aggregation for the dashboards. Every number here is
// derived from the store's Transaction/LedgerEntry/Match/Exception
// records via the same engine functions the agent tools use, so the
// dashboard and the voice agent can never silently disagree about a
// figure.

import { addDays, daysBetween, todayIST } from "@/lib/ids";
import { computeGstSummary } from "@/lib/engine/tax";
import { computePartyKhata } from "@/lib/engine/khata";
import { detectRecurringPatterns, forecastCashPosition } from "@/lib/engine/forecast";
import { getStore } from "@/lib/store";
import { DEMO_OWNER_UID } from "@/lib/owner";
import type { Account } from "@/lib/types";

export async function loadDashboardData() {
  const store = getStore();
  const [transactions, ledgerEntries, parties, products, matches, exceptions] = await Promise.all([
    store.listTransactions(DEMO_OWNER_UID),
    store.listLedgerEntries(DEMO_OWNER_UID),
    store.listParties(DEMO_OWNER_UID),
    store.listProducts(DEMO_OWNER_UID),
    store.listMatches(DEMO_OWNER_UID),
    store.listExceptions(DEMO_OWNER_UID),
  ]);

  function balance(account: Account): number {
    return ledgerEntries.filter((e) => e.account === account).reduce((s, e) => s + e.debitPaise - e.creditPaise, 0);
  }

  const cashPaise = balance("CASH");
  const bankPaise = balance("BANK");
  const receivablesPaise = balance("RECEIVABLE");
  const payablesPaise = -balance("PAYABLE");

  const asOfDate = transactions.length > 0 ? transactions[transactions.length - 1].date : todayIST();
  const unitPriceByProduct = new Map(products.map((p) => [p.id, p.unitPricePaise]));
  const forecast = forecastCashPosition({
    transactions,
    openingCashPaise: cashPaise + bankPaise,
    asOfDate,
    horizonDays: 21,
    unitPriceByProduct,
  });
  const recurringPatterns = detectRecurringPatterns(transactions);

  const gst = computeGstSummary(transactions);

  const matchedCount = matches.filter((m) => m.decision === "MATCHED").length;
  const reviewCount = matches.filter((m) => m.decision === "REVIEW").length;
  const openExceptions = exceptions.filter((e) => e.status === "open");

  // Match rate is matched / total reconcilable internal records, the
  // same definition the eval harness reports, not matched / matches
  // found: a record with no candidate at all never produces a Match
  // row, and excluding it here would quietly inflate the number.
  const totalReconcilableInternal =
    transactions.filter((t) => (t.type === "payment_in" || t.type === "payment_out") && t.method === "bank")
      .length + transactions.filter((t) => t.type === "purchase").length;

  // Cash-flow series: last 21 days actual (from ledger, replayed
  // cumulatively) joined with the 21-day forecast, connected at today.
  const cashHistory: { date: string; balancePaise: number }[] = [];
  {
    const sorted = [...ledgerEntries].sort((a, b) => a.date.localeCompare(b.date));
    const byDay = new Map<string, number>();
    let running = 0;
    for (const e of sorted) {
      if (e.account !== "CASH" && e.account !== "BANK") continue;
      running += e.debitPaise - e.creditPaise;
      byDay.set(e.date, running);
    }
    const days = [...byDay.keys()].sort();
    const last21 = days.slice(-21);
    for (const d of last21) cashHistory.push({ date: d, balancePaise: byDay.get(d)! });
  }

  const cashFlowSeries = [
    ...cashHistory.map((h) => ({ date: h.date, actualPaise: h.balancePaise, forecastPaise: null as number | null })),
    ...forecast.days.map((d, i) => ({
      date: d.date,
      actualPaise: i === 0 ? (cashHistory.at(-1)?.balancePaise ?? d.openingPaise) : null,
      forecastPaise: d.closingPaise,
    })),
  ];

  // Ingestion breakdown by external source.
  const externalRecords = await store.listExternalRecords(DEMO_OWNER_UID);
  const bySource = new Map<string, { matched: number; review: number; exception: number }>();
  for (const source of ["bank", "upi", "invoice"] as const) {
    bySource.set(source, { matched: 0, review: 0, exception: 0 });
  }
  const extRecordSource = new Map(externalRecords.map((e) => [e.id, e.source]));
  for (const m of matches) {
    const source = extRecordSource.get(m.externalRecordId);
    if (!source) continue;
    const row = bySource.get(source);
    if (!row) continue;
    if (m.decision === "MATCHED") row.matched++;
    else row.review++;
  }
  for (const exc of exceptions) {
    for (const id of exc.subjectIds) {
      const source = extRecordSource.get(id);
      if (source && bySource.has(source)) bySource.get(source)!.exception++;
    }
  }
  const ingestion = [...bySource.entries()].map(([source, v]) => ({ source, ...v }));

  // Aging across all customers.
  const aging = { d0to7Paise: 0, d8to15Paise: 0, d16to30Paise: 0, d30PlusPaise: 0 };
  const customerAging: { partyId: string; name: string; outstandingPaise: number }[] = [];
  for (const p of parties.filter((p) => p.kind === "customer")) {
    const k = computePartyKhata(transactions, p.id, asOfDate);
    aging.d0to7Paise += k.aging.d0to7Paise;
    aging.d8to15Paise += k.aging.d8to15Paise;
    aging.d16to30Paise += k.aging.d16to30Paise;
    aging.d30PlusPaise += k.aging.d30PlusPaise;
    if (k.outstandingPaise > 0) customerAging.push({ partyId: p.id, name: p.name, outstandingPaise: k.outstandingPaise });
  }
  customerAging.sort((a, b) => b.outstandingPaise - a.outstandingPaise);

  // Inflow/outflow over the last 14 days.
  const inOutByDay = new Map<string, { inflow: number; outflow: number }>();
  const fromDate = addDays(asOfDate, -13);
  for (const t of transactions) {
    if (t.status === "void" || t.date < fromDate || t.date > asOfDate) continue;
    if (!["cash_sale", "credit_sale", "payment_in", "purchase", "payment_out", "expense"].includes(t.type)) continue;
    const row = inOutByDay.get(t.date) ?? { inflow: 0, outflow: 0 };
    if (t.type === "cash_sale" || t.type === "payment_in") row.inflow += t.amountPaise;
    if (t.type === "purchase" || t.type === "payment_out" || t.type === "expense") row.outflow += t.amountPaise;
    inOutByDay.set(t.date, row);
  }
  let runningBalance = cashPaise + bankPaise - [...inOutByDay.values()].reduce((s, r) => s + r.inflow - r.outflow, 0);
  const inOutSeries = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(fromDate, i);
    const row = inOutByDay.get(d) ?? { inflow: 0, outflow: 0 };
    runningBalance += row.inflow - row.outflow;
    inOutSeries.push({ date: d, inflowPaise: row.inflow, outflowPaise: row.outflow, balancePaise: runningBalance });
  }

  const recentMatches = [...matches]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);
  const transactionById = new Map(transactions.map((t) => [t.id, t]));

  const today = asOfDate;
  const todayTxns = transactions.filter((t) => t.date === today);

  return {
    kpis: {
      cashPaise,
      bankPaise,
      receivablesPaise,
      payablesPaise,
      matchRatePct: totalReconcilableInternal > 0 ? (matchedCount / totalReconcilableInternal) * 100 : 0,
      openExceptionsCount: openExceptions.length,
      netGstPayablePaise: gst.netPayablePaise,
    },
    cashFlowSeries,
    shortfallDate: forecast.shortfallDate,
    shortfallPaise: forecast.shortfallPaise,
    forecastDrivers: forecast.drivers,
    matchSummary: { matched: matchedCount, review: reviewCount, exception: openExceptions.length },
    ingestion,
    aging,
    topDebtors: customerAging.slice(0, 5),
    inOutSeries,
    gst,
    recurringPatterns,
    recentMatches,
    transactionById,
    openExceptions,
    todayTxns,
    asOfDate,
  };
}

export function daysUntil(date: string, from: string): number {
  return daysBetween(from, date);
}
