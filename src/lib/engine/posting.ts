// The deterministic double-entry poster. Every rupee that ever appears
// anywhere in Hisaab passes through one of these functions. The model
// never computes money: it calls a tool, the tool calls one of these,
// and the tool reads back the numbers this file produced.
//
// Every function asserts debits equal credits before returning. That
// assertion, exercised across the full synthetic dataset in
// posting.test.ts, is the literal basis for the claim "the books
// balance".

import { makeId } from "@/lib/ids";
import type { Account, LedgerEntry, Source, Transaction, TxnItem, TxnType } from "@/lib/types";

export interface PostingResult {
  transaction: Transaction;
  ledgerEntries: LedgerEntry[];
}

function assertBalanced(entries: LedgerEntry[]): void {
  const debits = entries.reduce((s, e) => s + e.debitPaise, 0);
  const credits = entries.reduce((s, e) => s + e.creditPaise, 0);
  if (debits !== credits) {
    throw new Error(
      `Posting is not balanced: debits ${debits} paise, credits ${credits} paise.`
    );
  }
}

function entry(
  ownerUid: string,
  transactionId: string,
  date: string,
  account: Account,
  debitPaise: number,
  creditPaise: number,
  memo: string
): LedgerEntry {
  return {
    id: makeId("led"),
    ownerUid,
    transactionId,
    date,
    account,
    debitPaise,
    creditPaise,
    memo,
  };
}

function itemsAmount(items: TxnItem[]): { subtotalPaise: number; taxPaise: number } {
  let subtotalPaise = 0;
  let taxPaise = 0;
  for (const it of items) {
    subtotalPaise += it.lineTotalPaise;
    taxPaise += Math.round((it.lineTotalPaise * it.gstRatePct) / (100 + it.gstRatePct));
  }
  return { subtotalPaise, taxPaise };
}

function baseTransaction(
  ownerUid: string,
  type: TxnType,
  source: Source,
  date: string,
  eventId: string
): Pick<Transaction, "id" | "ownerUid" | "eventId" | "date" | "type" | "source" | "status" | "createdAt"> {
  return {
    id: makeId("txn"),
    ownerUid,
    eventId,
    date,
    type,
    source,
    status: "open",
    createdAt: new Date().toISOString(),
  };
}

export interface PostPurchaseInput {
  ownerUid: string;
  eventId: string;
  date: string;
  source: Source;
  partyId?: string;
  partyNameRaw?: string;
  items: TxnItem[];
  paymentMethod: "credit" | "cash";
  reference?: string;
  note?: string;
}

export function postPurchase(input: PostPurchaseInput): PostingResult {
  const { subtotalPaise, taxPaise } = itemsAmount(input.items);
  const totalPaise = subtotalPaise; // items' lineTotalPaise are GST-inclusive
  const base = baseTransaction(input.ownerUid, "purchase", input.source, input.date, input.eventId);
  const transaction: Transaction = {
    ...base,
    partyId: input.partyId,
    partyNameRaw: input.partyNameRaw,
    amountPaise: totalPaise,
    taxPaise,
    reference: input.reference,
    items: input.items,
    note: input.note,
  };

  const inventoryDebit = totalPaise - taxPaise;
  const creditAccount: Account = input.paymentMethod === "credit" ? "PAYABLE" : "CASH";
  const entries = [
    entry(input.ownerUid, transaction.id, input.date, "INVENTORY", inventoryDebit, 0, "Purchase, ex-tax"),
    entry(input.ownerUid, transaction.id, input.date, "GST_INPUT", taxPaise, 0, "Input GST on purchase"),
    entry(input.ownerUid, transaction.id, input.date, creditAccount, 0, totalPaise, "Purchase settlement"),
  ];
  assertBalanced(entries);
  return { transaction, ledgerEntries: entries };
}

export interface PostSaleInput {
  ownerUid: string;
  eventId: string;
  date: string;
  source: Source;
  partyId?: string;
  partyNameRaw?: string;
  items: TxnItem[];
  paymentMethod: "credit" | "cash";
  reference?: string;
  note?: string;
}

export function postSale(input: PostSaleInput): PostingResult {
  const { subtotalPaise, taxPaise } = itemsAmount(input.items);
  const totalPaise = subtotalPaise;
  const type: TxnType = input.paymentMethod === "credit" ? "credit_sale" : "cash_sale";
  const base = baseTransaction(input.ownerUid, type, input.source, input.date, input.eventId);
  const transaction: Transaction = {
    ...base,
    partyId: input.partyId,
    partyNameRaw: input.partyNameRaw,
    amountPaise: totalPaise,
    taxPaise,
    reference: input.reference,
    items: input.items,
    note: input.note,
  };

  const debitAccount: Account = input.paymentMethod === "credit" ? "RECEIVABLE" : "CASH";
  const salesPaise = totalPaise - taxPaise;
  const entries = [
    entry(input.ownerUid, transaction.id, input.date, debitAccount, totalPaise, 0, "Sale"),
    entry(input.ownerUid, transaction.id, input.date, "SALES", 0, salesPaise, "Sale, ex-tax"),
    entry(input.ownerUid, transaction.id, input.date, "GST_OUTPUT", 0, taxPaise, "Output GST on sale"),
  ];
  assertBalanced(entries);
  return { transaction, ledgerEntries: entries };
}

export interface PostPaymentInput {
  ownerUid: string;
  eventId: string;
  date: string;
  source: Source;
  partyId?: string;
  partyNameRaw?: string;
  amountPaise: number;
  direction: "in" | "out";
  method: "cash" | "bank";
  reference?: string;
  note?: string;
}

export function postPayment(input: PostPaymentInput): PostingResult {
  const type: TxnType = input.direction === "in" ? "payment_in" : "payment_out";
  const base = baseTransaction(input.ownerUid, type, input.source, input.date, input.eventId);
  const transaction: Transaction = {
    ...base,
    partyId: input.partyId,
    partyNameRaw: input.partyNameRaw,
    amountPaise: input.amountPaise,
    taxPaise: 0,
    reference: input.reference,
    items: [],
    note: input.note,
    method: input.method,
  };

  const cashOrBank: Account = input.method === "bank" ? "BANK" : "CASH";
  const entries =
    input.direction === "in"
      ? [
          entry(input.ownerUid, transaction.id, input.date, cashOrBank, input.amountPaise, 0, "Payment received"),
          entry(input.ownerUid, transaction.id, input.date, "RECEIVABLE", 0, input.amountPaise, "Receivable settled"),
        ]
      : [
          entry(input.ownerUid, transaction.id, input.date, "PAYABLE", input.amountPaise, 0, "Payable settled"),
          entry(input.ownerUid, transaction.id, input.date, cashOrBank, 0, input.amountPaise, "Payment made"),
        ];
  assertBalanced(entries);
  return { transaction, ledgerEntries: entries };
}

export interface PostExpenseInput {
  ownerUid: string;
  eventId: string;
  date: string;
  source: Source;
  amountPaise: number;
  method: "cash" | "bank";
  note?: string;
  reference?: string;
}

export function postExpense(input: PostExpenseInput): PostingResult {
  const base = baseTransaction(input.ownerUid, "expense", input.source, input.date, input.eventId);
  const transaction: Transaction = {
    ...base,
    amountPaise: input.amountPaise,
    taxPaise: 0,
    reference: input.reference,
    items: [],
    note: input.note,
  };

  const cashOrBank: Account = input.method === "bank" ? "BANK" : "CASH";
  const entries = [
    entry(input.ownerUid, transaction.id, input.date, "PURCHASES", input.amountPaise, 0, "Expense"),
    entry(input.ownerUid, transaction.id, input.date, cashOrBank, 0, input.amountPaise, "Expense paid"),
  ];
  assertBalanced(entries);
  return { transaction, ledgerEntries: entries };
}
