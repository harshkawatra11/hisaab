// A pure in-memory HisaabStore, used only by tests. Same semantics as
// fileStore.ts (ownership checks, FIFO-neutral reads) but with no disk
// I/O, so agent-tool and route-level tests run fast and hermetically.
// Never imported by application code, only by *.test.ts files.

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
import type { HisaabStore } from "@/lib/store/types";

export function createMemoryStore(): HisaabStore {
  let parties: Party[] = [];
  let products: Product[] = [];
  let transactions: Transaction[] = [];
  let ledgerEntries: LedgerEntry[] = [];
  let externalRecords: ExternalRecord[] = [];
  let matches: Match[] = [];
  let exceptions: HisaabException[] = [];
  let runs: ReconciliationRun[] = [];
  const forecasts = new Map<string, ForecastResult>();

  return {
    async listParties(ownerUid) {
      return parties.filter((p) => p.ownerUid === ownerUid);
    },
    async getParty(id, ownerUid) {
      return parties.find((p) => p.id === id && p.ownerUid === ownerUid);
    },
    async findPartyByName(ownerUid, normalizedName) {
      return parties.find((p) => p.ownerUid === ownerUid && p.normalizedName === normalizedName);
    },
    async upsertParty(party) {
      const idx = parties.findIndex((p) => p.id === party.id);
      if (idx === -1) parties.push(party);
      else parties[idx] = party;
      return party;
    },
    async bulkInsertParties(newParties) {
      parties.push(...newParties);
    },

    async listProducts(ownerUid) {
      return products.filter((p) => p.ownerUid === ownerUid);
    },
    async getProduct(id, ownerUid) {
      return products.find((p) => p.id === id && p.ownerUid === ownerUid);
    },
    async findProductByName(ownerUid, normalizedName) {
      return products.find((p) => p.ownerUid === ownerUid && p.normalizedName === normalizedName);
    },
    async upsertProduct(product) {
      const idx = products.findIndex((p) => p.id === product.id);
      if (idx === -1) products.push(product);
      else products[idx] = product;
      return product;
    },
    async bulkInsertProducts(newProducts) {
      products.push(...newProducts);
    },

    async listTransactions(ownerUid) {
      return transactions
        .filter((t) => t.ownerUid === ownerUid)
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    async getTransaction(id, ownerUid) {
      return transactions.find((t) => t.id === id && t.ownerUid === ownerUid);
    },
    async createTransaction(txn) {
      transactions.push(txn);
      return txn;
    },
    async bulkInsertTransactions(newTransactions) {
      transactions.push(...newTransactions);
    },

    async listLedgerEntries(ownerUid) {
      return ledgerEntries.filter((e) => e.ownerUid === ownerUid);
    },
    async createLedgerEntries(entries) {
      ledgerEntries.push(...entries);
      return entries;
    },

    async listExternalRecords(ownerUid) {
      return externalRecords.filter((r) => r.ownerUid === ownerUid);
    },
    async bulkInsertExternalRecords(records) {
      externalRecords.push(...records);
    },

    async listMatches(ownerUid, runId) {
      return matches.filter((m) => m.ownerUid === ownerUid && (!runId || m.runId === runId));
    },
    async bulkInsertMatches(newMatches) {
      matches.push(...newMatches);
    },
    async listExceptions(ownerUid, runId) {
      return exceptions.filter((e) => e.ownerUid === ownerUid && (!runId || e.runId === runId));
    },
    async bulkInsertExceptions(newExceptions) {
      exceptions.push(...newExceptions);
    },
    async updateExceptionStatus(id, ownerUid, status) {
      const idx = exceptions.findIndex((e) => e.id === id && e.ownerUid === ownerUid);
      if (idx === -1) return;
      exceptions[idx].status = status;
    },
    async createRun(run) {
      runs.push(run);
      return run;
    },
    async getLatestRun(ownerUid) {
      return runs.filter((r) => r.ownerUid === ownerUid).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    },

    async saveForecast(ownerUid, forecast) {
      forecasts.set(ownerUid, forecast);
    },
    async getForecast(ownerUid) {
      return forecasts.get(ownerUid);
    },

    async resetOwner(ownerUid) {
      parties = parties.filter((p) => p.ownerUid !== ownerUid);
      products = products.filter((p) => p.ownerUid !== ownerUid);
      transactions = transactions.filter((t) => t.ownerUid !== ownerUid);
      ledgerEntries = ledgerEntries.filter((e) => e.ownerUid !== ownerUid);
      externalRecords = externalRecords.filter((r) => r.ownerUid !== ownerUid);
      matches = matches.filter((m) => m.ownerUid !== ownerUid);
      exceptions = exceptions.filter((e) => e.ownerUid !== ownerUid);
      runs = runs.filter((r) => r.ownerUid !== ownerUid);
      forecasts.delete(ownerUid);
    },
  };
}
