import { describe, expect, it } from "vitest";
import { amountSim, dateSim, nameSim, refSim } from "./signals";

describe("amountSim", () => {
  it("returns 1 for identical amounts", () => {
    expect(amountSim(1000, 1000)).toBe(1);
  });
  it("degrades proportionally to the relative delta", () => {
    expect(amountSim(1000, 900)).toBeCloseTo(0.9, 5);
  });
  it("handles zero amounts without dividing by zero", () => {
    expect(amountSim(0, 0)).toBe(1);
  });
});

describe("dateSim", () => {
  it("is 1 at zero days apart", () => {
    expect(dateSim(0)).toBe(1);
  });
  it("is 0 at 7 or more days apart", () => {
    expect(dateSim(7)).toBe(0);
    expect(dateSim(10)).toBe(0);
  });
  it("degrades linearly within the 7-day window", () => {
    expect(dateSim(3.5)).toBeCloseTo(0.5, 5);
  });
});

describe("nameSim", () => {
  it("is 1 for identical normalized names", () => {
    expect(nameSim("SHARMA TRADERS", "SHARMA TRADERS")).toBe(1);
  });
  it("is high for a name variant missing one token", () => {
    expect(nameSim("SHARMA", "SHARMA TRADERS")).toBeGreaterThan(0.9);
  });
  it("is low for unrelated names", () => {
    expect(nameSim("SHARMA TRADERS", "ZEPTO MARKETPLACE")).toBeLessThan(0.5);
  });
});

describe("refSim", () => {
  it("returns null when either reference is absent", () => {
    expect(refSim(null, "ABC123")).toBeNull();
    expect(refSim("ABC123", null)).toBeNull();
  });
  it("returns 1 for identical references", () => {
    expect(refSim("ABC123", "ABC123")).toBe(1);
  });
  it("scores partial overlap by longest common substring", () => {
    const s = refSim("REF00012345", "TXN00012345XYZ");
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(1);
  });
});
