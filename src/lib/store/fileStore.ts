// File-backed persistence, the zero-setup fallback used automatically
// when Firestore is not configured. Mirrors the reasoning in Adhikaar's
// fileStore.ts: a serverless function's own bundle directory is
// read-only at runtime, only /tmp is writable, and /tmp is ephemeral
// and not shared across instances. Firestore is the real production
// path (see firestoreStore.ts); this file exists so the product runs
// end to end with no cloud account at all.

import { promises as fs } from "fs";
import os from "os";
import path from "path";
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

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "hisaab-data")
  : path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "hisaab.json");

interface DB {
  parties: Party[];
  products: Product[];
  transactions: Transaction[];
  ledgerEntries: LedgerEntry[];
  externalRecords: ExternalRecord[];
  matches: Match[];
  exceptions: HisaabException[];
  runs: ReconciliationRun[];
  forecasts: Record<string, ForecastResult>;
}

function emptyDb(): DB {
  return {
    parties: [],
    products: [],
    transactions: [],
    ledgerEntries: [],
    externalRecords: [],
    matches: [],
    exceptions: [],
    runs: [],
    forecasts: {},
  };
}

async function ensureFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(emptyDb(), null, 2), "utf-8");
  }
}

async function readDb(): Promise<DB> {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  try {
    return { ...emptyDb(), ...(JSON.parse(raw) as Partial<DB>) };
  } catch {
    return emptyDb();
  }
}

async function writeDb(db: DB): Promise<void> {
  await ensureFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
}

export const fileStore: HisaabStore = {
  async listParties(ownerUid) {
    const db = await readDb();
    return db.parties.filter((p) => p.ownerUid === ownerUid);
  },
  async getParty(id, ownerUid) {
    const db = await readDb();
    return db.parties.find((p) => p.id === id && p.ownerUid === ownerUid);
  },
  async findPartyByName(ownerUid, normalizedName) {
    const db = await readDb();
    return db.parties.find(
      (p) => p.ownerUid === ownerUid && p.normalizedName === normalizedName
    );
  },
  async upsertParty(party) {
    const db = await readDb();
    const idx = db.parties.findIndex((p) => p.id === party.id);
    if (idx === -1) db.parties.push(party);
    else db.parties[idx] = party;
    await writeDb(db);
    return party;
  },
  async bulkInsertParties(parties) {
    if (parties.length === 0) return;
    const db = await readDb();
    db.parties.push(...parties);
    await writeDb(db);
  },

  async listProducts(ownerUid) {
    const db = await readDb();
    return db.products.filter((p) => p.ownerUid === ownerUid);
  },
  async getProduct(id, ownerUid) {
    const db = await readDb();
    return db.products.find((p) => p.id === id && p.ownerUid === ownerUid);
  },
  async findProductByName(ownerUid, normalizedName) {
    const db = await readDb();
    return db.products.find(
      (p) => p.ownerUid === ownerUid && p.normalizedName === normalizedName
    );
  },
  async upsertProduct(product) {
    const db = await readDb();
    const idx = db.products.findIndex((p) => p.id === product.id);
    if (idx === -1) db.products.push(product);
    else db.products[idx] = product;
    await writeDb(db);
    return product;
  },
  async bulkInsertProducts(products) {
    if (products.length === 0) return;
    const db = await readDb();
    db.products.push(...products);
    await writeDb(db);
  },

  async listTransactions(ownerUid) {
    const db = await readDb();
    return db.transactions
      .filter((t) => t.ownerUid === ownerUid)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  async getTransaction(id, ownerUid) {
    const db = await readDb();
    return db.transactions.find((t) => t.id === id && t.ownerUid === ownerUid);
  },
  async createTransaction(txn) {
    const db = await readDb();
    db.transactions.push(txn);
    await writeDb(db);
    return txn;
  },
  async bulkInsertTransactions(transactions) {
    if (transactions.length === 0) return;
    const db = await readDb();
    db.transactions.push(...transactions);
    await writeDb(db);
  },

  async listLedgerEntries(ownerUid) {
    const db = await readDb();
    return db.ledgerEntries.filter((e) => e.ownerUid === ownerUid);
  },
  async createLedgerEntries(entries) {
    const db = await readDb();
    db.ledgerEntries.push(...entries);
    await writeDb(db);
    return entries;
  },

  async listExternalRecords(ownerUid) {
    const db = await readDb();
    return db.externalRecords.filter((r) => r.ownerUid === ownerUid);
  },
  async bulkInsertExternalRecords(records) {
    const db = await readDb();
    db.externalRecords.push(...records);
    await writeDb(db);
  },

  async listMatches(ownerUid, runId) {
    const db = await readDb();
    return db.matches.filter(
      (m) => m.ownerUid === ownerUid && (!runId || m.runId === runId)
    );
  },
  async bulkInsertMatches(matches) {
    const db = await readDb();
    db.matches.push(...matches);
    await writeDb(db);
  },
  async listExceptions(ownerUid, runId) {
    const db = await readDb();
    return db.exceptions.filter(
      (e) => e.ownerUid === ownerUid && (!runId || e.runId === runId)
    );
  },
  async bulkInsertExceptions(exceptions) {
    const db = await readDb();
    db.exceptions.push(...exceptions);
    await writeDb(db);
  },
  async updateExceptionStatus(id, ownerUid, status) {
    const db = await readDb();
    const idx = db.exceptions.findIndex((e) => e.id === id && e.ownerUid === ownerUid);
    if (idx === -1) return;
    db.exceptions[idx].status = status;
    await writeDb(db);
  },
  async createRun(run) {
    const db = await readDb();
    db.runs.push(run);
    await writeDb(db);
    return run;
  },
  async getLatestRun(ownerUid) {
    const db = await readDb();
    const runs = db.runs.filter((r) => r.ownerUid === ownerUid);
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  },

  async saveForecast(ownerUid, forecast) {
    const db = await readDb();
    db.forecasts[ownerUid] = forecast;
    await writeDb(db);
  },
  async getForecast(ownerUid) {
    const db = await readDb();
    return db.forecasts[ownerUid];
  },

  async resetOwner(ownerUid) {
    const db = await readDb();
    db.parties = db.parties.filter((p) => p.ownerUid !== ownerUid);
    db.products = db.products.filter((p) => p.ownerUid !== ownerUid);
    db.transactions = db.transactions.filter((t) => t.ownerUid !== ownerUid);
    db.ledgerEntries = db.ledgerEntries.filter((e) => e.ownerUid !== ownerUid);
    db.externalRecords = db.externalRecords.filter((r) => r.ownerUid !== ownerUid);
    db.matches = db.matches.filter((m) => m.ownerUid !== ownerUid);
    db.exceptions = db.exceptions.filter((e) => e.ownerUid !== ownerUid);
    db.runs = db.runs.filter((r) => r.ownerUid !== ownerUid);
    delete db.forecasts[ownerUid];
    await writeDb(db);
  },
};
