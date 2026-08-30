// Re-runs reconciliation over whatever internal transactions and
// external records currently exist in the store, for the "re-run"
// control on the Reconcile screen. Splits into the same two loops the
// seed script and eval harness use: settlements (bank/UPI against
// payment_in/payment_out) and invoices (purchases against supplier
// invoices, feeding the tax-line matcher).

import { NextResponse } from "next/server";
import { executeReconciliation } from "@/lib/recon/run";
import { getStore } from "@/lib/store";
import { DEMO_OWNER_UID } from "@/lib/owner";

export async function POST() {
  const store = getStore();
  const transactions = await store.listTransactions(DEMO_OWNER_UID);
  const externalRecords = await store.listExternalRecords(DEMO_OWNER_UID);

  const reconcilable = transactions.filter(
    (t) => (t.type === "payment_in" || t.type === "payment_out") && t.method === "bank"
  );
  const settlementRecords = externalRecords.filter((e) => e.source !== "invoice");
  const settlementResult = executeReconciliation(DEMO_OWNER_UID, reconcilable, settlementRecords);

  const invoiceInternal = transactions.filter((t) => t.type === "purchase");
  const invoiceRecords = externalRecords.filter((e) => e.source === "invoice");
  const invoiceResult = executeReconciliation(DEMO_OWNER_UID, invoiceInternal, invoiceRecords);

  await store.bulkInsertMatches([...settlementResult.matches, ...invoiceResult.matches]);
  await store.bulkInsertExceptions([...settlementResult.exceptions, ...invoiceResult.exceptions]);
  await store.createRun(settlementResult.run);
  await store.createRun(invoiceResult.run);

  return NextResponse.json({
    settlement: settlementResult.run,
    invoice: invoiceResult.run,
  });
}
