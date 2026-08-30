import { describe, expect, it } from "vitest";
import { parseIndianNumeral, requireIndianNumeral } from "./numerals";

describe("parseIndianNumeral", () => {
  it("resolves dhai to 2.5", () => {
    expect(parseIndianNumeral("dhai")?.value).toBe(2.5);
    expect(parseIndianNumeral("ढाई")?.value).toBe(2.5);
  });

  it("resolves sava to 1.25 and sava do to 2.25", () => {
    expect(parseIndianNumeral("sava")?.value).toBe(1.25);
    expect(parseIndianNumeral("sava do")?.value).toBeCloseTo(2.25, 5);
  });

  it("resolves paune do to 1.75", () => {
    expect(parseIndianNumeral("paune do")?.value).toBeCloseTo(1.75, 5);
  });

  it("resolves derh to 1.5 and derh sau to 150", () => {
    expect(parseIndianNumeral("derh")?.value).toBe(1.5);
    expect(parseIndianNumeral("derh sau")?.value).toBe(150);
  });

  it("resolves bara sau to 1200", () => {
    expect(parseIndianNumeral("bara sau")?.value ?? parseIndianNumeral("baarah sau")?.value).toBe(1200);
  });

  it("resolves lakh and crore multipliers", () => {
    expect(parseIndianNumeral("do lakh")?.value).toBe(200000);
    expect(parseIndianNumeral("ek crore")?.value).toBe(10000000);
  });

  it("resolves compound large numbers", () => {
    expect(parseIndianNumeral("do lakh pandrah hazaar")?.value).toBe(215000);
  });

  it("resolves plain cardinals", () => {
    expect(parseIndianNumeral("paanch")?.value).toBe(5);
    expect(parseIndianNumeral("bees")?.value).toBe(20);
  });

  it("resolves Devanagari forms", () => {
    expect(parseIndianNumeral("दो लाख")?.value).toBe(200000);
  });

  it("returns null for an unrecognised phrase rather than guessing", () => {
    expect(parseIndianNumeral("purple elephant")).toBeNull();
    expect(parseIndianNumeral("")).toBeNull();
  });

  it("returns null when only part of the phrase is recognised", () => {
    expect(parseIndianNumeral("do gadha")).toBeNull();
  });
});

describe("requireIndianNumeral", () => {
  it("returns the parsed value", () => {
    expect(requireIndianNumeral("dhai")).toBe(2.5);
  });

  it("throws rather than guessing on an unrecognised phrase", () => {
    expect(() => requireIndianNumeral("banana")).toThrow();
  });
});
