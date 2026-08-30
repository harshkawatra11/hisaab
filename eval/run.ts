// The real evaluation harness. Generates the deterministic synthetic
// dataset, runs the exact reconciliation pipeline the app uses
// (src/lib/recon/run.ts, not a separate copy of the logic), and prints
// the honest numbers: precision, recall and F1 against ground truth,
// not a self-graded match rate. This is what README's evaluation table
// and the deck's "what we measure" slide both quote. Run with
// `npm run eval`.

import { generateDataset } from "@/lib/seed/generator";
import { executeReconciliation } from "@/lib/recon/run";
import { formatINR } from "@/lib/money";

const OWNER = "eval-owner";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function main() {
  console.log("Generating deterministic synthetic dataset...\n");
  const ds = generateDataset(OWNER);

  console.log(`Parties: ${ds.parties.length}  Products: ${ds.products.length}`);
  console.log(`Internal transactions: ${ds.transactions.length}`);
  console.log(`External records: ${ds.externalRecords.length}`);
  console.log(`Ground truth pairs: ${ds.groundTruth.length}`);
  console.log(`Defect distribution: ${JSON.stringify(ds.defectSummary)}\n`);

  // Only bank/UPI-settled payments can ever appear on a bank statement.
  // A cash settlement is out of scope for reconciliation entirely, not
  // an unmatched exception, so it is excluded from the internal pool
  // here rather than left to show up as a false UNMATCHED_LEDGER_ENTRY.
  const reconcilable = ds.transactions.filter(
    (t) => (t.type === "payment_in" || t.type === "payment_out") && t.method === "bank"
  );
  const invoiceRecords = ds.externalRecords.filter((e) => e.source === "invoice");
  const settlementRecords = ds.externalRecords.filter((e) => e.source !== "invoice");
  const invoiceInternal = ds.transactions.filter((t) => t.type === "purchase");

  // Run reconciliation twice: once over the settlement pool (bank/UPI
  // against payment_in/payment_out), once over the invoice pool
  // (purchases against supplier invoices, for the tax-line matcher).
  // Kept separate because they are semantically different loops, the
  // way the product itself treats them.
  const settlementResult = executeReconciliation(
    OWNER,
    reconcilable,
    settlementRecords,
    ds.groundTruth.filter((g) => reconcilable.some((t) => t.id === g.internalTxnId))
  );
  const invoiceResult = executeReconciliation(
    OWNER,
    invoiceInternal,
    invoiceRecords,
    ds.groundTruth.filter((g) => invoiceInternal.some((t) => t.id === g.internalTxnId))
  );

  console.log("=".repeat(72));
  console.log("SETTLEMENT RECONCILIATION (bank/UPI against payment_in/payment_out)");
  console.log("=".repeat(72));
  printRun(settlementResult.run, reconcilable.length, settlementRecords.length);
  printExceptionBreakdown(settlementResult.exceptions);

  console.log("\n" + "=".repeat(72));
  console.log("INVOICE / TAX-LINE RECONCILIATION (purchases against supplier invoices)");
  console.log("=".repeat(72));
  printRun(invoiceResult.run, invoiceInternal.length, invoiceRecords.length);
  printExceptionBreakdown(invoiceResult.exceptions);

  console.log("\n" + "=".repeat(72));
  console.log("KNOWN LIMITATION: split payments");
  console.log("=".repeat(72));
  const splitExceptions = settlementResult.exceptions.filter((e) => e.kind === "SPLIT_PAYMENT_SUSPECTED");
  console.log(
    `${ds.defectSummary.split ?? 0} split-payment cases were deliberately injected. ` +
      `The three-layer matcher cannot resolve a 1:1 match for these by construction. ` +
      `${splitExceptions.length} were caught and reported as SPLIT_PAYMENT_SUSPECTED exceptions ` +
      `rather than silently mismatched or missed. This is reported as a known limitation, not hidden.`
  );

  console.log("\n" + "=".repeat(72));
  console.log("COMBINED HONESTY CHECK");
  console.log("=".repeat(72));
  const totalMatched = settlementResult.run.matchedCount + invoiceResult.run.matchedCount;
  const totalExceptions = settlementResult.run.exceptionCount + invoiceResult.run.exceptionCount;
  console.log(
    `A naive "match rate" alone can be gamed by matching nothing and calling everything an ` +
      `exception (100% exceptions, 0% false matches, looks safe, is useless). This run reports ` +
      `precision and recall against ground truth specifically so that gaming is visible: ` +
      `precision ${pct(settlementResult.run.precision ?? 0)}, recall ${pct(settlementResult.run.recall ?? 0)}.`
  );
  console.log(`Total matched across both loops: ${totalMatched}. Total exceptions: ${totalExceptions}.`);
}

function printRun(run: ReturnType<typeof executeReconciliation>["run"], totalInternal: number, totalExternal: number) {
  console.log(`Internal records:     ${totalInternal}`);
  console.log(`External records:     ${totalExternal}`);
  console.log(`Matched:              ${run.matchedCount}`);
  console.log(`Review (unresolved):  ${run.reviewCount}`);
  console.log(`Exceptions:           ${run.exceptionCount}`);
  console.log(`Match rate:           ${run.matchRatePct.toFixed(1)}%`);
  if (run.precision !== null) {
    console.log(`Precision:            ${pct(run.precision)}`);
    console.log(`Recall:               ${pct(run.recall ?? 0)}`);
    console.log(`F1:                   ${pct(run.f1 ?? 0)}`);
  }
  console.log(`Total variance:       ${formatINR(run.totalVariancePaise)}`);
  console.log(`Runtime:              ${run.runtimeMs}ms`);
}

function printExceptionBreakdown(exceptions: { kind: string }[]) {
  const byKind = exceptions.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log("Exception breakdown:", JSON.stringify(byKind));
}

main();
