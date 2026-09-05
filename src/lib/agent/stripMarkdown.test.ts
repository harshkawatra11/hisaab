import { describe, expect, it } from "vitest";
import { stripMarkdown } from "./stripMarkdown";

describe("stripMarkdown", () => {
  it("strips bold markers, keeping the text", () => {
    expect(stripMarkdown("Cash position ab **₹2.31 lakh** hai.")).toBe("Cash position ab ₹2.31 lakh hai.");
  });

  it("strips italic markers", () => {
    expect(stripMarkdown("Yeh *bahut zaroori* hai.")).toBe("Yeh bahut zaroori hai.");
  });

  it("strips headings and bullet points", () => {
    expect(stripMarkdown("# Summary\n- Cash: 100\n- Bank: 50")).toBe("Summary\nCash: 100\nBank: 50");
  });

  it("strips numbered list markers", () => {
    expect(stripMarkdown("1. Sandeep\n2. Rekha")).toBe("Sandeep\nRekha");
  });

  it("strips inline code backticks", () => {
    expect(stripMarkdown("Field `partyId` is required.")).toBe("Field partyId is required.");
  });

  it("leaves plain text with no markdown untouched", () => {
    expect(stripMarkdown("Sandeep ka credit score 100 hai, achha hai.")).toBe(
      "Sandeep ka credit score 100 hai, achha hai."
    );
  });
});
