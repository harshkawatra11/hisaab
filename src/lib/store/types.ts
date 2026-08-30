import type {
  ExternalRecord,
  ForecastResult,
  HisaabException,
  LedgerEntry,
  Match,
  Party,
  Product,
  ReconciliationRun,
  Transaction,
} from "@/lib/types";

/**
 * Every backing store, file or Firestore, implements exactly this.
 * Ownership is enforced inside the store, not by the caller, so a
 * mismatched owner behaves like the record does not exist rather than
 * throwing, the same discipline Adhikaar's CaseStore uses.
 */
export interface HisaabStore {
  // Parties
  listParties(ownerUid: string): Promise<Party[]>;
  getParty(id: string, ownerUid: string): Promise<Party | undefined>;
  findPartyByName(ownerUid: string, normalizedName: string): Promise<Party | undefined>;
  upsertParty(party: Party): Promise<Party>;
  bulkInsertParties(parties: Party[]): Promise<void>;

  // Products
  listProducts(ownerUid: string): Promise<Product[]>;
  getProduct(id: string, ownerUid: string): Promise<Product | undefined>;
  findProductByName(ownerUid: string, normalizedName: string): Promise<Product | undefined>;
  upsertProduct(product: Product): Promise<Product>;
  bulkInsertProducts(products: Product[]): Promise<void>;

  // Transactions (the internal ledger's source events)
  listTransactions(ownerUid: string): Promise<Transaction[]>;
  getTransaction(id: string, ownerUid: string): Promise<Transaction | undefined>;
  createTransaction(txn: Transaction): Promise<Transaction>;
  bulkInsertTransactions(transactions: Transaction[]): Promise<void>;

  // Ledger entries (double-entry postings)
  listLedgerEntries(ownerUid: string): Promise<LedgerEntry[]>;
  createLedgerEntries(entries: LedgerEntry[]): Promise<LedgerEntry[]>;

  // External records (bank / UPI / invoice feeds to reconcile against)
  listExternalRecords(ownerUid: string): Promise<ExternalRecord[]>;
  bulkInsertExternalRecords(records: ExternalRecord[]): Promise<void>;

  // Reconciliation output
  listMatches(ownerUid: string, runId?: string): Promise<Match[]>;
  bulkInsertMatches(matches: Match[]): Promise<void>;
  listExceptions(ownerUid: string, runId?: string): Promise<HisaabException[]>;
  bulkInsertExceptions(exceptions: HisaabException[]): Promise<void>;
  updateExceptionStatus(
    id: string,
    ownerUid: string,
    status: HisaabException["status"]
  ): Promise<void>;
  createRun(run: ReconciliationRun): Promise<ReconciliationRun>;
  getLatestRun(ownerUid: string): Promise<ReconciliationRun | undefined>;

  // Forecast cache (cheap to recompute, but stored so the dashboard and
  // the voice agent read the identical figure without re-running it)
  saveForecast(ownerUid: string, forecast: ForecastResult): Promise<void>;
  getForecast(ownerUid: string): Promise<ForecastResult | undefined>;

  /** Wipes every collection for one owner. Used by the seed script and
   *  by tests, never reachable from a browser route. */
  resetOwner(ownerUid: string): Promise<void>;
}
