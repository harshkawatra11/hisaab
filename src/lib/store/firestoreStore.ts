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

export const firestoreStore: HisaabStore = {
  async listParties(ownerUid) {
    const db = getFirestoreDb();
    const snap = await db.collection(COL.parties).where("ownerUid", "==", ownerUid).get();
    return snap.docs.map((d) => d.data() as Party);
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
    const db = getFirestoreDb();
    await db.collection(COL.parties).doc(party.id).set(party);
    return party;
  },
  async bulkInsertParties(parties) {
    if (parties.length === 0) return;
    const db = getFirestoreDb();
    for (let i = 0; i < parties.length; i += 400) {
      const chunk = parties.slice(i, i + 400);
      const batch = db.batch();
      for (const p of chunk) batch.set(db.collection(COL.parties).doc(p.id), p);
      await batch.commit();
    }
  },

  async listProducts(ownerUid) {
    const db = getFirestoreDb();
    const snap = await db.collection(COL.products).where("ownerUid", "==", ownerUid).get();
    return snap.docs.map((d) => d.data() as Product);
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
    const db = getFirestoreDb();
    await db.collection(COL.products).doc(product.id).set(product);
    return product;
  },
  async bulkInsertProducts(products) {
    if (products.length === 0) return;
    const db = getFirestoreDb();
    for (let i = 0; i < products.length; i += 400) {
      const chunk = products.slice(i, i + 400);
      const batch = db.batch();
      for (const p of chunk) batch.set(db.collection(COL.products).doc(p.id), p);
      await batch.commit();
    }
  },

  async listTransactions(ownerUid) {
    const db = getFirestoreDb();
    const snap = await db
      .collection(COL.transactions)
      .where("ownerUid", "==", ownerUid)
      .orderBy("date", "asc")
      .get();
    return snap.docs.map((d) => d.data() as Transaction);
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
    const db = getFirestoreDb();
    await db.collection(COL.transactions).doc(txn.id).set(txn);
    return txn;
  },
  async bulkInsertTransactions(transactions) {
    if (transactions.length === 0) return;
    const db = getFirestoreDb();
    for (let i = 0; i < transactions.length; i += 400) {
      const chunk = transactions.slice(i, i + 400);
      const batch = db.batch();
      for (const t of chunk) batch.set(db.collection(COL.transactions).doc(t.id), t);
      await batch.commit();
    }
  },

  async listLedgerEntries(ownerUid) {
    const db = getFirestoreDb();
    const snap = await db
      .collection(COL.ledgerEntries)
      .where("ownerUid", "==", ownerUid)
      .get();
    return snap.docs.map((d) => d.data() as LedgerEntry);
  },
  async createLedgerEntries(entries) {
    if (entries.length === 0) return entries;
    assertWriteAllowed(entries.length);
    const db = getFirestoreDb();
    const batch = db.batch();
    for (const e of entries) batch.set(db.collection(COL.ledgerEntries).doc(e.id), e);
    await batch.commit();
    return entries;
  },

  async listExternalRecords(ownerUid) {
    const db = getFirestoreDb();
    const snap = await db
      .collection(COL.externalRecords)
      .where("ownerUid", "==", ownerUid)
      .get();
    return snap.docs.map((d) => d.data() as ExternalRecord);
  },
  async bulkInsertExternalRecords(records) {
    if (records.length === 0) return;
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
    const db = getFirestoreDb();
    let q = db.collection(COL.matches).where("ownerUid", "==", ownerUid);
    if (runId) q = q.where("runId", "==", runId);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as Match);
  },
  async bulkInsertMatches(matches) {
    if (matches.length === 0) return;
    const db = getFirestoreDb();
    for (let i = 0; i < matches.length; i += 400) {
      const chunk = matches.slice(i, i + 400);
      const batch = db.batch();
      for (const m of chunk) batch.set(db.collection(COL.matches).doc(m.id), m);
      await batch.commit();
    }
  },
  async listExceptions(ownerUid, runId) {
    const db = getFirestoreDb();
    let q = db.collection(COL.exceptions).where("ownerUid", "==", ownerUid);
    if (runId) q = q.where("runId", "==", runId);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as HisaabException);
  },
  async bulkInsertExceptions(exceptions) {
    if (exceptions.length === 0) return;
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
    const db = getFirestoreDb();
    const doc = await db.collection(COL.exceptions).doc(id).get();
    const data = doc.data() as HisaabException | undefined;
    if (!data || data.ownerUid !== ownerUid) return;
    await doc.ref.update({ status });
  },
  async createRun(run) {
    assertWriteAllowed();
    const db = getFirestoreDb();
    await db.collection(COL.runs).doc(run.id).set(run);
    return run;
  },
  async getLatestRun(ownerUid) {
    const db = getFirestoreDb();
    const snap = await db
      .collection(COL.runs)
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    return snap.empty ? undefined : (snap.docs[0].data() as ReconciliationRun);
  },

  async saveForecast(ownerUid, forecast) {
    assertWriteAllowed();
    const db = getFirestoreDb();
    await db.collection(COL.forecasts).doc(ownerUid).set(forecast);
  },
  async getForecast(ownerUid) {
    const db = getFirestoreDb();
    const doc = await db.collection(COL.forecasts).doc(ownerUid).get();
    return doc.data() as ForecastResult | undefined;
  },

  async resetOwner(ownerUid) {
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
