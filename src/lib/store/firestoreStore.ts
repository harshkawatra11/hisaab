// Firestore-backed persistence, the real production path. Every write
// funnels through assertWriteAllowed() first, since the voice agent can
// post a handful of writes from a single spoken sentence.

import { getFirestoreDb } from "@/lib/firestore/client";
import { assertWriteAllowed } from "@/lib/firestore/rateLimit";
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

const COL = {
  parties: "parties",
  products: "products",
  transactions: "transactions",
  ledgerEntries: "ledgerEntries",
  externalRecords: "externalRecords",
  matches: "matches",
  exceptions: "exceptions",
  runs: "runs",
  forecasts: "forecasts",
} as const;

// In-memory read cache with write-invalidation to make tab navigation
// instant (<5ms) rather than waiting on remote Firestore network round-trips.
interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}
const CACHE_TTL_MS = 60_000;
const memoryCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T): T {
  memoryCache.set(key, { data, cachedAt: Date.now() });
  return data;
}

function invalidateCache(prefix?: string) {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const k of memoryCache.keys()) {
    if (k.startsWith(prefix)) memoryCache.delete(k);
  }
}

export const firestoreStore: HisaabStore = {
  async listParties(ownerUid) {
    const key = `parties:${ownerUid}`;
    const cached = getCached<Party[]>(key);
    if (cached) return cached;
    const db = getFirestoreDb();
    const snap = await db.collection(COL.parties).where("ownerUid", "==", ownerUid).get();
    const result = snap.docs.map((d) => d.data() as Party);
    return setCached(key, result);
  },
  async getParty(id, ownerUid) {
    const db = getFirestoreDb();
    const doc = await db.collection(COL.parties).doc(id).get();
    const data = doc.data() as Party | undefined;
    if (!data || data.ownerUid !== ownerUid) return undefined;
    return data;
  },
  async findPartyByName(ownerUid, normalizedName) {
    const db = getFirestoreDb();
    const snap = await db
      .collection(COL.parties)
      .where("ownerUid", "==", ownerUid)
      .where("normalizedName", "==", normalizedName)
      .limit(1)
      .get();
    return snap.empty ? undefined : (snap.docs[0].data() as Party);
  },
  async upsertParty(party) {
    assertWriteAllowed();
    invalidateCache(`parties:${party.ownerUid}`);
    const db = getFirestoreDb();
    await db.collection(COL.parties).doc(party.id).set(party);
    return party;
  },
  async bulkInsertParties(parties) {
    if (parties.length === 0) return;
    invalidateCache("parties:");
    const db = getFirestoreDb();
    for (let i = 0; i < parties.length; i += 400) {
      const chunk = parties.slice(i, i + 400);
      const batch = db.batch();
      for (const p of chunk) batch.set(db.collection(COL.parties).doc(p.id), p);
      await batch.commit();
    }
  },

  async listProducts(ownerUid) {
    const key = `products:${ownerUid}`;
    const cached = getCached<Product[]>(key);
    if (cached) return cached;
    const db = getFirestoreDb();
    const snap = await db.collection(COL.products).where("ownerUid", "==", ownerUid).get();
    const result = snap.docs.map((d) => d.data() as Product);
    return setCached(key, result);
  },
  async getProduct(id, ownerUid) {
    const db = getFirestoreDb();
    const doc = await db.collection(COL.products).doc(id).get();
    const data = doc.data() as Product | undefined;
    if (!data || data.ownerUid !== ownerUid) return undefined;
    return data;
  },
  async findProductByName(ownerUid, normalizedName) {
    const db = getFirestoreDb();
    const snap = await db
      .collection(COL.products)
      .where("ownerUid", "==", ownerUid)
      .where("normalizedName", "==", normalizedName)
      .limit(1)
      .get();
    return snap.empty ? undefined : (snap.docs[0].data() as Product);
  },
  async upsertProduct(product) {
    assertWriteAllowed();
    invalidateCache(`products:${product.ownerUid}`);
    const db = getFirestoreDb();
    await db.collection(COL.products).doc(product.id).set(product);
    return product;
  },
  async bulkInsertProducts(products) {
    if (products.length === 0) return;
    invalidateCache("products:");
    const db = getFirestoreDb();
    for (let i = 0; i < products.length; i += 400) {
      const chunk = products.slice(i, i + 400);
      const batch = db.batch();
      for (const p of chunk) batch.set(db.collection(COL.products).doc(p.id), p);
      await batch.commit();
    }
  },

  async listTransactions(ownerUid) {
    const key = `transactions:${ownerUid}`;
    const cached = getCached<Transaction[]>(key);
    if (cached) return cached;
    const db = getFirestoreDb();
    const snap = await db
      .collection(COL.transactions)
      .where("ownerUid", "==", ownerUid)
      .get();
    const docs = snap.docs.map((d) => d.data() as Transaction);
    // Sort in JS to avoid requiring a composite index on (ownerUid, date).
    const result = docs.sort((a, b) => a.date.localeCompare(b.date));
    return setCached(key, result);
  },
  async getTransaction(id, ownerUid) {
    const db = getFirestoreDb();
    const doc = await db.collection(COL.transactions).doc(id).get();
    const data = doc.data() as Transaction | undefined;
    if (!data || data.ownerUid !== ownerUid) return undefined;
    return data;
  },
  async createTransaction(txn) {
    assertWriteAllowed();
    invalidateCache(`transactions:${txn.ownerUid}`);
    invalidateCache(`forecast:${txn.ownerUid}`);
    const db = getFirestoreDb();
    await db.collection(COL.transactions).doc(txn.id).set(txn);
    return txn;
  },
  async bulkInsertTransactions(transactions) {
    if (transactions.length === 0) return;
    invalidateCache("transactions:");
    invalidateCache("forecast:");
    const db = getFirestoreDb();
    for (let i = 0; i < transactions.length; i += 400) {
      const chunk = transactions.slice(i, i + 400);
      const batch = db.batch();
      for (const t of chunk) batch.set(db.collection(COL.transactions).doc(t.id), t);
      await batch.commit();
    }
  },

  async listLedgerEntries(ownerUid) {
    const key = `ledgerEntries:${ownerUid}`;
    const cached = getCached<LedgerEntry[]>(key);
    if (cached) return cached;
    const db = getFirestoreDb();
    const snap = await db
      .collection(COL.ledgerEntries)
      .where("ownerUid", "==", ownerUid)
      .get();
    const result = snap.docs.map((d) => d.data() as LedgerEntry);
    return setCached(key, result);
  },
  async createLedgerEntries(entries) {
    if (entries.length === 0) return entries;
    assertWriteAllowed(entries.length);
    invalidateCache("ledgerEntries:");
    const db = getFirestoreDb();
    const batch = db.batch();
    for (const e of entries) batch.set(db.collection(COL.ledgerEntries).doc(e.id), e);
    await batch.commit();
    return entries;
  },

  async listExternalRecords(ownerUid) {
    const key = `externalRecords:${ownerUid}`;
    const cached = getCached<ExternalRecord[]>(key);
    if (cached) return cached;
    const db = getFirestoreDb();
    const snap = await db
      .collection(COL.externalRecords)
      .where("ownerUid", "==", ownerUid)
      .get();
    const result = snap.docs.map((d) => d.data() as ExternalRecord);
    return setCached(key, result);
  },
  async bulkInsertExternalRecords(records) {
    if (records.length === 0) return;
    invalidateCache("externalRecords:");
    const db = getFirestoreDb();
    // Seeding a full synthetic dataset legitimately exceeds the
    // per-minute write ceiling; batched in chunks of 400 (below
    // Firestore's own 500-write batch cap) and not passed through
    // assertWriteAllowed, which guards interactive writes, not the
    // one-time dataset seed.
    for (let i = 0; i < records.length; i += 400) {
      const chunk = records.slice(i, i + 400);
      const batch = db.batch();
      for (const r of chunk) batch.set(db.collection(COL.externalRecords).doc(r.id), r);
      await batch.commit();
    }
  },

  async listMatches(ownerUid, runId) {
    const key = `matches:${ownerUid}:${runId ?? ""}`;
    const cached = getCached<Match[]>(key);
    if (cached) return cached;
    const db = getFirestoreDb();
    let q = db.collection(COL.matches).where("ownerUid", "==", ownerUid);
    if (runId) q = q.where("runId", "==", runId);
    const snap = await q.get();
    const result = snap.docs.map((d) => d.data() as Match);
    return setCached(key, result);
  },
  async bulkInsertMatches(matches) {
    if (matches.length === 0) return;
    invalidateCache("matches:");
    const db = getFirestoreDb();
    for (let i = 0; i < matches.length; i += 400) {
      const chunk = matches.slice(i, i + 400);
      const batch = db.batch();
      for (const m of chunk) batch.set(db.collection(COL.matches).doc(m.id), m);
      await batch.commit();
    }
  },
  async listExceptions(ownerUid, runId) {
    const key = `exceptions:${ownerUid}:${runId ?? ""}`;
    const cached = getCached<HisaabException[]>(key);
    if (cached) return cached;
    const db = getFirestoreDb();
    let q = db.collection(COL.exceptions).where("ownerUid", "==", ownerUid);
    if (runId) q = q.where("runId", "==", runId);
    const snap = await q.get();
    const result = snap.docs.map((d) => d.data() as HisaabException);
    return setCached(key, result);
  },
  async bulkInsertExceptions(exceptions) {
    if (exceptions.length === 0) return;
    invalidateCache("exceptions:");
    const db = getFirestoreDb();
    for (let i = 0; i < exceptions.length; i += 400) {
      const chunk = exceptions.slice(i, i + 400);
      const batch = db.batch();
      for (const e of chunk) batch.set(db.collection(COL.exceptions).doc(e.id), e);
      await batch.commit();
    }
  },
  async updateExceptionStatus(id, ownerUid, status) {
    assertWriteAllowed();
    invalidateCache(`exceptions:${ownerUid}`);
    const db = getFirestoreDb();
    const doc = await db.collection(COL.exceptions).doc(id).get();
    const data = doc.data() as HisaabException | undefined;
    if (!data || data.ownerUid !== ownerUid) return;
    await doc.ref.update({ status });
  },
  async createRun(run) {
    assertWriteAllowed();
    invalidateCache(`runs:${run.ownerUid}`);
    invalidateCache(`latestRun:${run.ownerUid}`);
    const db = getFirestoreDb();
    await db.collection(COL.runs).doc(run.id).set(run);
    return run;
  },
  async getLatestRun(ownerUid) {
    const key = `latestRun:${ownerUid}`;
    const cached = getCached<ReconciliationRun | null>(key);
    if (cached !== undefined) return cached === null ? undefined : cached;
    const db = getFirestoreDb();
    const snap = await db
      .collection(COL.runs)
      .where("ownerUid", "==", ownerUid)
      .get();
    if (snap.empty) {
      setCached(key, null);
      return undefined;
    }
    // Sort in JS to avoid requiring a composite index on (ownerUid, createdAt).
    const runs = snap.docs.map((d) => d.data() as ReconciliationRun);
    const result = runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    setCached(key, result ?? null);
    return result;
  },

  async saveForecast(ownerUid, forecast) {
    assertWriteAllowed();
    invalidateCache(`forecast:${ownerUid}`);
    const db = getFirestoreDb();
    await db.collection(COL.forecasts).doc(ownerUid).set(forecast);
  },
  async getForecast(ownerUid) {
    const key = `forecast:${ownerUid}`;
    const cached = getCached<ForecastResult | null>(key);
    if (cached !== undefined) return cached === null ? undefined : cached;
    const db = getFirestoreDb();
    const doc = await db.collection(COL.forecasts).doc(ownerUid).get();
    const result = doc.data() as ForecastResult | undefined;
    setCached(key, result ?? null);
    return result;
  },

  async resetOwner(ownerUid) {
    invalidateCache();
    const db = getFirestoreDb();
    const collections = [
      COL.parties,
      COL.products,
      COL.transactions,
      COL.ledgerEntries,
      COL.externalRecords,
      COL.matches,
      COL.exceptions,
      COL.runs,
    ];
    for (const col of collections) {
      const snap = await db.collection(col).where("ownerUid", "==", ownerUid).get();
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      if (!snap.empty) await batch.commit();
    }
    await db.collection(COL.forecasts).doc(ownerUid).delete();
  },
};
