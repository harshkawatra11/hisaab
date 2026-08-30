// Per-party credit ledger (the digital khata). Every figure here is
// derived from Transaction records already posted by engine/posting.ts,
// never recomputed with different logic, so the Khata view and the
// ledger can never silently disagree.

import { daysBetween, todayIST } from "@/lib/ids";
import type { Transaction } from "@/lib/types";

export interface AgingBuckets {
  d0to7Paise: number;
  d8to15Paise: number;
  d16to30Paise: number;
  d30PlusPaise: number;
}

export interface OpenCreditSale {
  transactionId: string;
  date: string;
  amountPaise: number;
  openPaise: number; // remaining after FIFO settlement
}

export interface PartyLedgerSummary {
  partyId: string;
  outstandingPaise: number;
  openSales: OpenCreditSale[];
  aging: AgingBuckets;
}

/**
 * Computes outstanding balance for one party from their credit sales and
 * payments-in, FIFO: the oldest open credit sale is settled first.
 * Deterministic given the transaction list, callable with today's date
 * fixed for testability.
 */
export function computePartyKhata(
  transactions: Transaction[],
  partyId: string,
  asOfDate: string = todayIST()
): PartyLedgerSummary {
  const partyTxns = transactions
    .filter((t) => t.partyId === partyId && t.status !== "void")
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const openSales: OpenCreditSale[] = partyTxns
    .filter((t) => t.type === "credit_sale")
    .map((t) => ({
      transactionId: t.id,
      date: t.date,
      amountPaise: t.amountPaise,
      openPaise: t.amountPaise,
    }));

  const payments = partyTxns.filter((t) => t.type === "payment_in");

  for (const payment of payments) {
    let remaining = payment.amountPaise;
    for (const sale of openSales) {
      if (remaining <= 0) break;
      if (sale.openPaise <= 0) continue;
      const applied = Math.min(sale.openPaise, remaining);
      sale.openPaise -= applied;
      remaining -= applied;
    }
    // Any remaining credit beyond open sales is an overpayment; not
    // tracked as negative debt here, left for the caller to surface as
    // an exception if it matters for the demo narrative.
  }

  const stillOpen = openSales.filter((s) => s.openPaise > 0);
  const outstandingPaise = stillOpen.reduce((s, o) => s + o.openPaise, 0);

  const aging: AgingBuckets = { d0to7Paise: 0, d8to15Paise: 0, d16to30Paise: 0, d30PlusPaise: 0 };
  for (const sale of stillOpen) {
    const age = daysBetween(sale.date, asOfDate);
    if (age <= 7) aging.d0to7Paise += sale.openPaise;
    else if (age <= 15) aging.d8to15Paise += sale.openPaise;
    else if (age <= 30) aging.d16to30Paise += sale.openPaise;
    else aging.d30PlusPaise += sale.openPaise;
  }

  return { partyId, outstandingPaise, openSales: stillOpen, aging };
}

export interface SettleResult {
  partyId: string;
  amountAppliedPaise: number;
  consumedSaleIds: string[];
  residualPaise: number;
}

/** Applies a payment amount to a party's open credit sales, FIFO,
 *  without mutating the transaction list (pure, for use inside a tool
 *  handler that then posts the actual payment transaction). */
export function settlePayment(
  transactions: Transaction[],
  partyId: string,
  amountPaise: number,
  asOfDate: string = todayIST()
): SettleResult {
  const before = computePartyKhata(transactions, partyId, asOfDate);
  let remaining = amountPaise;
  const consumedSaleIds: string[] = [];
  for (const sale of before.openSales) {
    if (remaining <= 0) break;
    const applied = Math.min(sale.openPaise, remaining);
    if (applied > 0) consumedSaleIds.push(sale.transactionId);
    remaining -= applied;
  }
  return {
    partyId,
    amountAppliedPaise: amountPaise - remaining,
    consumedSaleIds,
    residualPaise: remaining,
  };
}
