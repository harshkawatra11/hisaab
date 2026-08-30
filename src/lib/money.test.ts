import { describe, expect, it } from "vitest";
import {
  expectedGstFromBase,
  formatCompactINR,
  formatINR,
  paise,
  rupees,
  splitGst,
} from "./money";

describe("paise / rupees", () => {
  it("converts rupees to paise as an integer", () => {
    expect(paise(100)).toBe(10000);
    expect(paise(99.5)).toBe(9950);
  });

  it("round-trips through rupees", () => {
    expect(rupees(paise(1234.56))).toBeCloseTo(1234.56, 2);
  });
});

describe("formatINR", () => {
  it("formats with Indian digit grouping", () => {
    expect(formatINR(paise(142800))).toBe("₹1,42,800.00");
    expect(formatINR(paise(1000))).toBe("₹1,000.00");
  });

  it("formats negative amounts with a leading sign before the symbol", () => {
    expect(formatINR(paise(-500))).toBe("-₹500.00");
  });
});

describe("formatCompactINR", () => {
  it("uses lakh and crore suffixes at the right thresholds", () => {
    expect(formatCompactINR(paise(84250))).toBe("₹84.3K");
    expect(formatCompactINR(paise(3140000))).toBe("₹31.40L");
    expect(formatCompactINR(paise(15000000))).toBe("₹1.50Cr");
  });

  it("shows small amounts as plain rupees", () => {
    expect(formatCompactINR(paise(240))).toBe("₹240");
  });
});

describe("splitGst", () => {
  it("splits a GST-inclusive total into base, CGST and SGST that sum exactly to total", () => {
    const total = paise(1050); // 1000 base + 5% GST (2.5% CGST + 2.5% SGST)
    const { basePaise, cgstPaise, sgstPaise } = splitGst(total, 5);
    expect(basePaise + cgstPaise + sgstPaise).toBe(total);
    expect(basePaise).toBeCloseTo(paise(1000), -1);
  });

  it("returns zero tax at a zero rate", () => {
    const total = paise(500);
    expect(splitGst(total, 0)).toEqual({
      basePaise: total,
      cgstPaise: 0,
      sgstPaise: 0,
    });
  });

  it("never produces a rounding drift, across many odd totals", () => {
    for (let t = 1; t < 5000; t += 37) {
      for (const rate of [5, 12, 18, 28] as const) {
        const { basePaise, cgstPaise, sgstPaise } = splitGst(t, rate);
        expect(basePaise + cgstPaise + sgstPaise).toBe(t);
      }
    }
  });
});

describe("expectedGstFromBase", () => {
  it("computes CGST and SGST from a known base", () => {
    const { cgstPaise, sgstPaise, totalGstPaise } = expectedGstFromBase(paise(1000), 5);
    expect(cgstPaise).toBe(paise(25));
    expect(sgstPaise).toBe(paise(25));
    expect(totalGstPaise).toBe(paise(50));
  });
});
