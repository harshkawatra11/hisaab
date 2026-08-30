// GST computation and the tax-line matcher. Like every other engine
// module, the model never touches this arithmetic; it only reads back
// what this file computed.

import { expectedGstFromBase } from "@/lib/money";
import type { GstRate, Transaction } from "@/lib/types";

export interface GstSummary {
  outputGstPaise: number; // GST collected on sales
  inputGstPaise: number; // GST paid on purchases, reclaimable
  netPayablePaise: number; // output - input, can be negative (net credit)
}

export function computeGstSummary(transactions: Transaction[]): GstSummary {
  let outputGstPaise = 0;
  let inputGstPaise = 0;
  for (const t of transactions) {
    if (t.status === "void") continue;
    if (t.type === "cash_sale" || t.type === "credit_sale") outputGstPaise += t.taxPaise;
    if (t.type === "purchase") inputGstPaise += t.taxPaise;
  }
  return { outputGstPaise, inputGstPaise, netPayablePaise: outputGstPaise - inputGstPaise };
}

export interface InvoiceTaxCheck {
  basePaise: number;
  ratePct: GstRate;
  declaredCgstPaise: number;
  declaredSgstPaise: number;
}

export interface TaxDiscrepancy {
  expectedCgstPaise: number;
  expectedSgstPaise: number;
  declaredCgstPaise: number;
  declaredSgstPaise: number;
  deltaPaise: number;
  isDiscrepant: boolean;
}

/** Rounding noise under ₹1 is not a discrepancy; anything at or above it
 *  is flagged, matching the GST_MISMATCH exception threshold used by
 *  the reconciliation engine. */
const DISCREPANCY_THRESHOLD_PAISE = 100;

export function checkInvoiceTax(invoice: InvoiceTaxCheck): TaxDiscrepancy {
  const { cgstPaise: expectedCgstPaise, sgstPaise: expectedSgstPaise } = expectedGstFromBase(
    invoice.basePaise,
    invoice.ratePct
  );
  const deltaPaise =
    invoice.declaredCgstPaise +
    invoice.declaredSgstPaise -
    (expectedCgstPaise + expectedSgstPaise);
  return {
    expectedCgstPaise,
    expectedSgstPaise,
    declaredCgstPaise: invoice.declaredCgstPaise,
    declaredSgstPaise: invoice.declaredSgstPaise,
    deltaPaise,
    isDiscrepant: Math.abs(deltaPaise) >= DISCREPANCY_THRESHOLD_PAISE,
  };
}
