// The shared domain model. Every collection document also carries ownerUid
// (checked at the store layer, not just hidden in the UI) except where noted.

export type PartyKind = "customer" | "supplier";

export type TxnType =
  | "purchase"
  | "cash_sale"
  | "credit_sale"
  | "payment_in"
  | "payment_out"
  | "expense";

export type Source = "voice" | "pos" | "bank" | "upi" | "invoice" | "manual";

export type Account =
  | "CASH"
  | "BANK"
  | "RECEIVABLE"
  | "PAYABLE"
  | "SALES"
  | "PURCHASES"
  | "GST_INPUT"
  | "GST_OUTPUT"
  | "INVENTORY";

export type GstRate = 0 | 5 | 12 | 18 | 28;

export interface Party {
  id: string;
  ownerUid: string;
  kind: PartyKind;
  name: string;
  normalizedName: string;
  phone?: string;
  creditLimitPaise?: number;
  createdAt: string;
}

export interface Product {
  id: string;
  ownerUid: string;
  name: string;
  normalizedName: string;
  unit: "packet" | "kg" | "litre" | "piece";
  unitPricePaise: number;
  gstRatePct: GstRate;
  stockQty: number;
}

export interface TxnItem {
  productId: string;
  productName: string;
  qty: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  gstRatePct: GstRate;
}

export interface Transaction {
  id: string;
  ownerUid: string;
  eventId: string;
  date: string; // ISO calendar day, IST, yyyy-MM-dd
  type: TxnType;
  source: Source;
  partyId?: string;
  partyNameRaw?: string;
  amountPaise: number;
  taxPaise: number;
  reference?: string;
  items: TxnItem[];
  status: "open" | "settled" | "void";
  note?: string;
  createdAt: string;
  // Only meaningful on payment_in/payment_out: a cash settlement never
  // touches a bank statement and is therefore out of scope for
  // reconciliation entirely, not an unmatched exception.
  method?: "cash" | "bank";
}

export interface LedgerEntry {
  id: string;
  ownerUid: string;
  transactionId: string;
  date: string;
  account: Account;
  debitPaise: number;
  creditPaise: number;
  memo: string;
}

export interface ExternalRecord {
  id: string;
  ownerUid: string;
  source: "bank" | "upi" | "invoice";
  date: string;
  narration: string;
  counterpartyRaw: string;
  amountPaise: number;
  reference?: string;
  feePaise?: number;
  taxPaise?: number;
  direction: "credit" | "debit";
  // Present only when source === "invoice": the declared tax breakdown,
  // checked against the rate-derived expectation by engine/tax.ts.
  basePaise?: number;
  ratePct?: GstRate;
  declaredCgstPaise?: number;
  declaredSgstPaise?: number;
}

export interface MatchSignals {
  amountSim: number;
  dateSim: number;
  nameSim: number;
  refSim: number | null;
  daysApart: number;
  deltaPaise: number;
}

export type MatchMethod = "exact" | "fuzzy" | "ai";
export type MatchDecision = "MATCHED" | "REVIEW" | "EXCEPTION";

export interface Match {
  id: string;
  ownerUid: string;
  internalTxnId: string;
  externalRecordId: string;
  confidence: number;
  signals: MatchSignals;
  decision: MatchDecision;
  method: MatchMethod;
  reason: string;
  runId: string;
  createdAt: string;
}

export type ExceptionKind =
  | "UNMATCHED_LEDGER_ENTRY"
  | "UNMATCHED_BANK_CREDIT"
  | "UNMATCHED_BANK_DEBIT"
  | "AMOUNT_MISMATCH"
  | "DUPLICATE_SUSPECTED"
  | "MISSING_INVOICE"
  | "UNKNOWN_COUNTERPARTY"
  | "GST_MISMATCH"
  | "SPLIT_PAYMENT_SUSPECTED"
  | "DATE_OUT_OF_WINDOW";

export interface HisaabException {
  id: string;
  ownerUid: string;
  runId: string;
  kind: ExceptionKind;
  severity: "high" | "medium" | "low";
  subjectIds: string[];
  amountPaise?: number;
  explanation: string;
  recommendedAction: string;
  status: "open" | "reviewed" | "resolved";
  createdAt: string;
}

export interface ReconciliationRun {
  id: string;
  ownerUid: string;
  createdAt: string;
  totalInternal: number;
  totalExternal: number;
  matchedCount: number;
  reviewCount: number;
  exceptionCount: number;
  matchRatePct: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  totalVariancePaise: number;
  runtimeMs: number;
}

export interface RecurringPattern {
  partyId: string;
  productId: string;
  medianGapDays: number;
  medianQty: number;
  observationCount: number;
  confidence: number;
}

export interface ForecastDay {
  date: string;
  openingPaise: number;
  expectedSalesPaise: number;
  expectedCollectionsPaise: number;
  projectedPurchasesPaise: number;
  scheduledPayablesPaise: number;
  recurringExpensesPaise: number;
  closingPaise: number;
}

export interface ForecastResult {
  days: ForecastDay[];
  shortfallDate: string | null;
  shortfallPaise: number;
  drivers: { label: string; amountPaise: number }[];
}
