// Seeds the store with the deterministic synthetic dataset and runs
// reconciliation once so the dashboard has real matches, exceptions
// and a run summary to render on first load. Run with `npm run seed`.
// Safe to re-run: it resets the demo owner's data first.

import { generateDataset } from "@/lib/seed/generator";
import { executeReconciliation } from "@/lib/recon/run";
import { DEMO_OWNER_UID } from "@/lib/owner";
import { getStore } from "@/lib/store";

async function main() {
  const store = getStore();
  console.log(`Resetting data for ${DEMO_OWNER_UID}...`);
  await store.resetOwner(DEMO_OWNER_UID);

  console.log("Generating deterministic synthetic dataset...");
  const ds = generateDataset(DEMO_OWNER_UID);
  console.log(
    `${ds.parties.length} parties, ${ds.products.length} products, ` +
      `${ds.transactions.length} transactions, ${ds.externalRecords.length} external records.`
  );

  console.log("Writing to store...");
  await store.bulkInsertParties(ds.parties);
  await store.bulkInsertProducts(ds.products);
  await store.bulkInsertTransactions(ds.transactions);
  await store.createLedgerEntries(ds.ledgerEntries);
  await store.bulkInsertExternalRecords(ds.externalRecords);

  console.log("Running reconciliation over the settlement pool...");
  const reconcilable = ds.transactions.filter(
    (t) => (t.type === "payment_in" || t.type === "payment_out") && t.method === "bank"
  );
  const settlementRecords = ds.externalRecords.filter((e) => e.source !== "invoice");
  const settlementResult = executeReconciliation(
    DEMO_OWNER_UID,
    reconcilable,
    settlementRecords,
    ds.groundTruth
  );

  console.log("Running reconciliation over the invoice/tax pool...");
  const invoiceInternal = ds.transactions.filter((t) => t.type === "purchase");
  const invoiceRecords = ds.externalRecords.filter((e) => e.source === "invoice");
  const invoiceResult = executeReconciliation(
    DEMO_OWNER_UID,
    invoiceInternal,
    invoiceRecords,
    ds.groundTruth
  );

  await store.bulkInsertMatches([...settlementResult.matches, ...invoiceResult.matches]);
  await store.bulkInsertExceptions([...settlementResult.exceptions, ...invoiceResult.exceptions]);
  await store.createRun(settlementResult.run);
  await store.createRun(invoiceResult.run);

  console.log(
    `Done. Settlement match rate ${settlementResult.run.matchRatePct.toFixed(1)}%, ` +
      `invoice match rate ${invoiceResult.run.matchRatePct.toFixed(1)}%.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
