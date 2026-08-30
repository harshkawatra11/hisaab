// All money in this domain is an integer number of paise. Floats are never
// used past this boundary: a rounding drift here would be visible in a live
// reconciliation demo, which is the one place it is least forgivable.

export function paise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function rupees(paiseAmount: number): number {
  return paiseAmount / 100;
}

const INDIAN_GROUPING = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(paiseAmount: number): string {
  const sign = paiseAmount < 0 ? "-" : "";
  const abs = Math.abs(paiseAmount);
  return `${sign}₹${INDIAN_GROUPING.format(abs / 100)}`;
}

export function formatCompactINR(paiseAmount: number): string {
  const sign = paiseAmount < 0 ? "-" : "";
  const rs = Math.abs(paiseAmount) / 100;
  if (rs >= 1_00_00_000) return `${sign}₹${(rs / 1_00_00_000).toFixed(2)}Cr`;
  if (rs >= 1_00_000) return `${sign}₹${(rs / 1_00_000).toFixed(2)}L`;
  if (rs >= 1_000) return `${sign}₹${(rs / 1_000).toFixed(1)}K`;
  return `${sign}₹${rs.toFixed(0)}`;
}

/**
 * Splits a total (base + GST) into base/CGST/SGST at the given combined
 * rate, half-and-half between CGST and SGST. Any rounding remainder is
 * absorbed into the base so the three parts always sum exactly to total.
 */
export function splitGst(
  totalPaise: number,
  ratePct: number
): { basePaise: number; cgstPaise: number; sgstPaise: number } {
  if (ratePct === 0) {
    return { basePaise: totalPaise, cgstPaise: 0, sgstPaise: 0 };
  }
  const basePaiseExact = totalPaise / (1 + ratePct / 100);
  const halfRate = ratePct / 2 / 100;
  const cgstPaise = Math.round(basePaiseExact * halfRate);
  const sgstPaise = Math.round(basePaiseExact * halfRate);
  const basePaise = totalPaise - cgstPaise - sgstPaise;
  return { basePaise, cgstPaise, sgstPaise };
}

/**
 * Computes CGST+SGST from a known base amount (used when checking an
 * invoice's declared tax against what the rate implies).
 */
export function expectedGstFromBase(
  basePaise: number,
  ratePct: number
): { cgstPaise: number; sgstPaise: number; totalGstPaise: number } {
  const halfRate = ratePct / 2 / 100;
  const cgstPaise = Math.round(basePaise * halfRate);
  const sgstPaise = Math.round(basePaise * halfRate);
  return { cgstPaise, sgstPaise, totalGstPaise: cgstPaise + sgstPaise };
}
