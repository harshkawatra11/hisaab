// The synthetic dataset generator. Deterministic (seeded PRNG), shaped
// to look like a real 60-day kirana-store operating history rather
// than placeholder rows: real product names and Indian MRP-band
// prices, real personal and business naming conventions, bank/UPI
// narrations formatted the way an actual Indian bank statement export
// looks. Every defect injected is documented in DEFECT_DISTRIBUTION
// below and echoed in the Methodology screen and the README, per the
// project rule that synthetic data must never be presented as if it
// were real, and must never hide what was deliberately broken in it.

import { addDays, makeId } from "@/lib/ids";
import { normalizeName } from "@/lib/recon/normalize";
import { postExpense, postPayment, postPurchase, postSale } from "@/lib/engine/posting";
import { Rng } from "@/lib/seed/prng";
import {
  CATALOG_CUSTOMERS,
  CATALOG_PRODUCTS,
  CATALOG_SUPPLIERS,
  formatNeftNarration,
  formatUpiNarration,
  randomBankIfsc,
  upiHandle,
  type CatalogProduct,
} from "@/lib/seed/catalog";
import { mangleNameCasual, unrelatedCounterparty } from "@/lib/seed/defects";
import type {
  ExternalRecord,
  LedgerEntry,
  Party,
  Product,
  Transaction,
  TxnItem,
} from "@/lib/types";

export const SEED = 20260903;
export const SIM_START_DATE = "2026-06-30";
export const SIM_DAYS = 90;

export interface GroundTruthPair {
  internalTxnId: string;
  externalRecordId: string;
}

export interface GeneratedDataset {
  ownerUid: string;
  parties: Party[];
  products: Product[];
  transactions: Transaction[];
  ledgerEntries: LedgerEntry[];
  externalRecords: ExternalRecord[];
  groundTruth: GroundTruthPair[];
  defectSummary: Record<string, number>;
}

type DefectClass =
  | "clean"
  | "name_variant"
  | "date_lag"
  | "fee_delta"
  | "duplicate"
  | "missing"
  | "split";

// Minimum guaranteed counts per defect class, proportioned from the
// documented target distribution (300/40/25/20/12/10/5 out of ~412
// settlements) but applied as explicit floors rather than independent
// per-event random draws. The reconcilable settlement pool this
// simulation produces is itself a byproduct of a random walk, so
// leaving rare classes (missing, split) to chance risks a seed that
// happens to produce zero of them, which would silently break both the
// eval harness's ability to report a real recall figure for that class
// and the demo's ability to show it. Floors are clipped to whatever
// pool size the walk actually produced; any remainder is clean.
const DEFECT_FLOORS: [DefectClass, number][] = [
  ["split", 6],
  ["duplicate", 8],
  ["missing", 12],
  ["name_variant", 20],
  ["date_lag", 15],
  ["fee_delta", 15],
];

function buildDefectAssignment(rng: Rng, poolSize: number): DefectClass[] {
  const assignment: DefectClass[] = [];
  let remaining = poolSize;
  for (const [cls, target] of DEFECT_FLOORS) {
    const count = Math.min(target, Math.max(0, remaining));
    for (let i = 0; i < count; i++) assignment.push(cls);
    remaining -= count;
  }
  for (let i = 0; i < remaining; i++) assignment.push("clean");
  return rng.shuffle(assignment);
}

interface PaymentEvent {
  transaction: Transaction;
  counterpartyName: string;
  direction: "credit" | "debit"; // from the bank's perspective: payment_in => credit, payment_out => debit
  method: "cash" | "bank";
}

interface ScheduledSettlement {
  partyId: string;
  partyName: string;
  amountPaise: number;
  settleDay: number;
  kind: "receivable" | "payable";
}

function buildParties(ownerUid: string): { parties: Party[]; supplierIds: string[]; customerIds: string[] } {
  const parties: Party[] = [];
  const supplierIds: string[] = [];
  const customerIds: string[] = [];

  CATALOG_SUPPLIERS.forEach((name, i) => {
    const id = makeId("pty");
    parties.push({
      id,
      ownerUid,
      kind: "supplier",
      name,
      normalizedName: normalizeName(name),
      phone: `+9198${String(10000000 + i * 137).padStart(8, "0")}`,
      createdAt: `${SIM_START_DATE}T00:00:00.000Z`,
    });
    supplierIds.push(id);
  });

  CATALOG_CUSTOMERS.forEach((name, i) => {
    const id = makeId("pty");
    parties.push({
      id,
      ownerUid,
      kind: "customer",
      name,
      normalizedName: normalizeName(name),
      phone: `+9197${String(20000000 + i * 211).padStart(8, "0")}`,
      creditLimitPaise: 500000 + (i % 5) * 200000,
      createdAt: `${SIM_START_DATE}T00:00:00.000Z`,
    });
    customerIds.push(id);
  });

  return { parties, supplierIds, customerIds };
}

function buildProducts(ownerUid: string): Product[] {
  return CATALOG_PRODUCTS.map((c) => ({
    id: makeId("prd"),
    ownerUid,
    name: c.name,
    normalizedName: normalizeName(c.name),
    unit: c.unit,
    unitPricePaise: c.unitPricePaise,
    gstRatePct: c.gstRatePct,
    stockQty: 0,
  }));
}

// Sale item: MRP, the Product record's own unitPricePaise.
function item(product: Product, qty: number): TxnItem {
  return {
    productId: product.id,
    productName: product.name,
    qty,
    unitPricePaise: product.unitPricePaise,
    lineTotalPaise: qty * product.unitPricePaise,
    gstRatePct: product.gstRatePct,
  };
}

// Purchase item: the wholesaler's price, below MRP. Using the same
// price on both sides would give the shop a permanent zero gross
// margin, which is not how a real kirana store's books look.
function purchaseItem(product: Product, catalogEntry: CatalogProduct, qty: number): TxnItem {
  return {
    productId: product.id,
    productName: product.name,
    qty,
    unitPricePaise: catalogEntry.purchasePricePaise,
    lineTotalPaise: qty * catalogEntry.purchasePricePaise,
    gstRatePct: product.gstRatePct,
  };
}

export function generateDataset(ownerUid: string, seed: number = SEED): GeneratedDataset {
  const rng = new Rng(seed);
  const { parties, supplierIds, customerIds } = buildParties(ownerUid);
  const products = buildProducts(ownerUid);
  const productBySupplier = new Map<number, Product[]>();
  CATALOG_PRODUCTS.forEach((c, i) => {
    if (!productBySupplier.has(c.supplierIndex)) productBySupplier.set(c.supplierIndex, []);
    productBySupplier.get(c.supplierIndex)!.push(products[i]);
  });

  const transactions: Transaction[] = [];
  const ledgerEntries: LedgerEntry[] = [];
  const paymentEvents: PaymentEvent[] = [];
  const purchaseTxns: Transaction[] = [];

  const recurringProducts = CATALOG_PRODUCTS.map((c, i) => ({ c, product: products[i] })).filter(
    (x) => x.c.recurring
  );
  const nonRecurring = CATALOG_PRODUCTS.map((c, i) => ({ c, product: products[i] })).filter(
    (x) => !x.c.recurring
  );
  const nextRestockDay = new Map<string, number>(); // productId -> next scheduled day

  const scheduled: ScheduledSettlement[] = [];
  const eventIdCounter = { n: 0 };
  const nextEventId = () => `evt_${(eventIdCounter.n++).toString(36)}`;

  function post(fn: () => { transaction: Transaction; ledgerEntries: LedgerEntry[] }) {
    const { transaction, ledgerEntries: entries } = fn();
    transactions.push(transaction);
    ledgerEntries.push(...entries);
    return transaction;
  }

  for (let d = 0; d < SIM_DAYS; d++) {
    const date = addDays(SIM_START_DATE, d);

    // Weekly recurring restocks: two products, staggered offsets so
    // they form two independent clean weekly patterns.
    recurringProducts.forEach(({ product }, idx) => {
      const offset = idx * 3;
      if (d % 7 === offset) {
        const catalogEntry = CATALOG_PRODUCTS.find((c) => c.name === product.name)!;
        const supplierIdx = catalogEntry.supplierIndex;
        const supplierId = supplierIds[supplierIdx];
        const supplierName = CATALOG_SUPPLIERS[supplierIdx];
        const qty = rng.int(15, 25);
        const credit = rng.chance(0.7);
        const txn = post(() =>
          postPurchase({
            ownerUid,
            eventId: nextEventId(),
            date,
            source: "voice",
            partyId: supplierId,
            partyNameRaw: supplierName,
            items: [purchaseItem(product, catalogEntry, qty)],
            paymentMethod: credit ? "credit" : "cash",
          })
        );
        purchaseTxns.push(txn);
        if (credit) {
          scheduled.push({
            partyId: supplierId,
            partyName: supplierName,
            amountPaise: txn.amountPaise,
            settleDay: d + rng.int(5, 25),
            kind: "payable",
          });
        }
      }
    });

    // Irregular restocks for the other six products.
    nonRecurring.forEach(({ c, product }) => {
      const next = nextRestockDay.get(product.id) ?? 0;
      if (d >= next) {
        const supplierId = supplierIds[c.supplierIndex];
        const supplierName = CATALOG_SUPPLIERS[c.supplierIndex];
        const qty = rng.int(8, 20);
        const credit = rng.chance(0.6);
        const txn = post(() =>
          postPurchase({
            ownerUid,
            eventId: nextEventId(),
            date,
            source: "voice",
            partyId: supplierId,
            partyNameRaw: supplierName,
            items: [purchaseItem(product, c, qty)],
            paymentMethod: credit ? "credit" : "cash",
          })
        );
        purchaseTxns.push(txn);
        if (credit) {
          scheduled.push({
            partyId: supplierId,
            partyName: supplierName,
            amountPaise: txn.amountPaise,
            settleDay: d + rng.int(5, 25),
            kind: "payable",
          });
        }
        nextRestockDay.set(product.id, d + rng.int(12, 18));
      }
    });

    // Daily sales.
    const salesCount = rng.int(4, 9);
    for (let s = 0; s < salesCount; s++) {
      const customerId = rng.pick(customerIds);
      const customerIdx = customerIds.indexOf(customerId);
      const customerName = CATALOG_CUSTOMERS[customerIdx];
      const itemCount = rng.int(1, 3);
      const chosenProducts = rng.shuffle(products).slice(0, itemCount);
      const items = chosenProducts.map((p) => item(p, rng.int(1, 6)));
      const credit = rng.chance(0.35);
      const txn = post(() =>
        postSale({
          ownerUid,
          eventId: nextEventId(),
          date,
          source: "voice",
          partyId: credit ? customerId : undefined,
          partyNameRaw: credit ? customerName : undefined,
          items,
          paymentMethod: credit ? "credit" : "cash",
        })
      );
      if (credit && rng.chance(0.8)) {
        scheduled.push({
          partyId: customerId,
          partyName: customerName,
          amountPaise: txn.amountPaise,
          settleDay: d + rng.int(3, 20),
          kind: "receivable",
        });
      }
    }

    // Process settlements scheduled for today.
    const dueToday = scheduled.filter((s) => s.settleDay === d);
    for (const due of dueToday) {
      if (due.kind === "receivable") {
        const method: "cash" | "bank" = rng.chance(0.6) ? "bank" : "cash";
        const txn = post(() =>
          postPayment({
            ownerUid,
            eventId: nextEventId(),
            date,
            source: "voice",
            partyId: due.partyId,
            partyNameRaw: due.partyName,
            amountPaise: due.amountPaise,
            direction: "in",
            method,
          })
        );
        paymentEvents.push({ transaction: txn, counterpartyName: due.partyName, direction: "credit", method });
      } else {
        const method: "cash" | "bank" = rng.chance(0.7) ? "bank" : "cash";
        const txn = post(() =>
          postPayment({
            ownerUid,
            eventId: nextEventId(),
            date,
            source: "voice",
            partyId: due.partyId,
            partyNameRaw: due.partyName,
            amountPaise: due.amountPaise,
            direction: "out",
            method,
          })
        );
        paymentEvents.push({ transaction: txn, counterpartyName: due.partyName, direction: "debit", method });
      }
    }

    // Occasional operating expenses.
    if (rng.chance(0.05)) {
      const kind = rng.pick(["Shop rent", "Electricity bill", "Cleaning supplies", "Local transport"]);
      const amount = kind === "Shop rent" ? rng.int(8000, 15000) * 100 : rng.int(500, 4000) * 100;
      post(() =>
        postExpense({
          ownerUid,
          eventId: nextEventId(),
          date,
          source: "manual",
          amountPaise: amount,
          method: rng.chance(0.5) ? "bank" : "cash",
          note: kind,
        })
      );
    }
  }

  // --- External record generation over the reconcilable settlement pool ---
  const externalRecords: ExternalRecord[] = [];
  const groundTruth: GroundTruthPair[] = [];
  const defectSummary: Record<string, number> = {};
  const bump = (k: string) => (defectSummary[k] = (defectSummary[k] ?? 0) + 1);

  // Only bank/UPI-settled payments leave an external trail; a cash
  // settlement never appears on a bank statement, which is realistic
  // and is also why not every payment_in/payment_out gets a counterpart
  // even before any defect is injected on top.
  const bankTrailEvents = paymentEvents.filter((e) => e.method === "bank");

  const defectAssignment = buildDefectAssignment(rng, bankTrailEvents.length);
  bankTrailEvents.forEach((evt, idx) => {
    const cls = defectAssignment[idx];
    const t = evt.transaction;
    const isUpi = idx % 2 === 0;
    const refNo = String(400000000000 + idx);

    function makeExternal(overrides: Partial<ExternalRecord> = {}): ExternalRecord {
      const counterpartyDisplay = mangleNameCasual(evt.counterpartyName);
      const narration = isUpi
        ? formatUpiNarration(counterpartyDisplay, upiHandle(counterpartyDisplay, idx), refNo)
        : formatNeftNarration(counterpartyDisplay, randomBankIfsc(idx), refNo);
      return {
        id: makeId("ext"),
        ownerUid,
        source: isUpi ? "upi" : "bank",
        date: t.date,
        narration,
        counterpartyRaw: counterpartyDisplay,
        amountPaise: t.amountPaise,
        reference: refNo,
        direction: evt.direction,
        ...overrides,
      };
    }

    switch (cls) {
      case "clean": {
        const ext = makeExternal();
        externalRecords.push(ext);
        groundTruth.push({ internalTxnId: t.id, externalRecordId: ext.id });
        bump("clean");
        break;
      }
      case "name_variant": {
        const ext = makeExternal({ reference: undefined, counterpartyRaw: mangleNameCasual(evt.counterpartyName).toLowerCase() });
        externalRecords.push(ext);
        groundTruth.push({ internalTxnId: t.id, externalRecordId: ext.id });
        bump("name_variant");
        break;
      }
      case "date_lag": {
        const lagDays = rng.int(1, 4);
        const ext = makeExternal({ date: addDays(t.date, lagDays) });
        externalRecords.push(ext);
        groundTruth.push({ internalTxnId: t.id, externalRecordId: ext.id });
        bump("date_lag");
        break;
      }
      case "fee_delta": {
        const feePaise = rng.int(200, 4000);
        const shortAmount = Math.max(1, t.amountPaise - feePaise);
        const ext = makeExternal({ amountPaise: shortAmount, feePaise });
        externalRecords.push(ext);
        groundTruth.push({ internalTxnId: t.id, externalRecordId: ext.id });
        bump("fee_delta");
        break;
      }
      case "duplicate": {
        const ext1 = makeExternal();
        const ext2 = makeExternal({ id: makeId("ext") });
        externalRecords.push(ext1, ext2);
        groundTruth.push({ internalTxnId: t.id, externalRecordId: ext1.id });
        bump("duplicate");
        break;
      }
      case "missing": {
        bump("missing");
        break; // no external record at all
      }
      case "split": {
        const half1 = Math.round(t.amountPaise / 2);
        const half2 = t.amountPaise - half1;
        const ext1 = makeExternal({ amountPaise: half1, reference: undefined });
        const ext2 = makeExternal({ id: makeId("ext"), amountPaise: half2, date: addDays(t.date, rng.int(0, 2)), reference: undefined });
        externalRecords.push(ext1, ext2);
        // No single ground-truth pair: this is the defect no 1:1 matcher resolves.
        bump("split");
        break;
      }
    }
  });

  // Unrelated noise: bank/UPI movements with no internal counterpart at all.
  const NOISE_COUNT = 8;
  for (let i = 0; i < NOISE_COUNT; i++) {
    const day = rng.int(0, SIM_DAYS - 1);
    const date = addDays(SIM_START_DATE, day);
    const name = unrelatedCounterparty(rng);
    const direction = rng.chance(0.5) ? "credit" : "debit";
    const amountPaise = rng.int(500, 25000) * 10;
    const refNo = String(500000000000 + i);
    externalRecords.push({
      id: makeId("ext"),
      ownerUid,
      source: rng.chance(0.5) ? "upi" : "bank",
      date,
      narration: formatUpiNarration(name, upiHandle(name, i + 100), refNo),
      counterpartyRaw: name,
      amountPaise,
      reference: refNo,
      direction,
    });
    bump("unknown_counterparty");
  }

  // --- Supplier invoices, for the tax-line matcher ---
  const invoiceSample = rng.shuffle(purchaseTxns).slice(0, Math.min(60, purchaseTxns.length));
  // Only a purchase with a nonzero GST rate can carry a meaningful,
  // always-positive understatement; a 0%-rate item (milk, atta) has no
  // tax to understate. Wrong invoices are chosen from that eligible
  // subset first so the six defective invoices are guaranteed real.
  const wrongEligibleIds = new Set(
    invoiceSample.filter((t) => (t.items[0]?.gstRatePct ?? 0) > 0).slice(0, 6).map((t) => t.id)
  );

  invoiceSample.forEach((t, idx) => {
    const rate = t.items[0]?.gstRatePct ?? 5;
    const basePaise = t.amountPaise - t.taxPaise;
    const halfRate = rate / 2 / 100;
    const correctCgst = Math.round(basePaise * halfRate);
    const correctSgst = Math.round(basePaise * halfRate);
    const isWrong = wrongEligibleIds.has(t.id);
    // Understate by 20-45% of the correct tax, never past zero: a real
    // misdeclared invoice still reports some tax, it does not go
    // negative.
    const understatementPct = isWrong ? 0.2 + rng.float() * 0.25 : 0;
    const declaredCgst = Math.max(0, Math.round(correctCgst * (1 - understatementPct)));
    const declaredSgst = Math.max(0, Math.round(correctSgst * (1 - understatementPct)));

    const invoiceNo = `INV/2026-27/${String(1000 + idx)}`;
    const ext: ExternalRecord = {
      id: makeId("ext"),
      ownerUid,
      source: "invoice",
      date: t.date,
      narration: `Tax Invoice ${invoiceNo}, ${t.partyNameRaw}`,
      counterpartyRaw: t.partyNameRaw ?? "",
      amountPaise: basePaise + declaredCgst + declaredSgst,
      reference: invoiceNo,
      direction: "debit",
      taxPaise: declaredCgst + declaredSgst,
      basePaise,
      ratePct: rate,
      declaredCgstPaise: declaredCgst,
      declaredSgstPaise: declaredSgst,
    };
    externalRecords.push(ext);
    if (!isWrong) {
      groundTruth.push({ internalTxnId: t.id, externalRecordId: ext.id });
    }
    bump(isWrong ? "gst_wrong" : "invoice_clean");
  });

  return {
    ownerUid,
    parties,
    products,
    transactions,
    ledgerEntries,
    externalRecords,
    groundTruth,
    defectSummary,
  };
}
