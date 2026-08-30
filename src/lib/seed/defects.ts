// Name-mangling and narration helpers used only by the synthetic
// dataset generator, to produce the specific defect classes the match
// engine is supposed to handle (or, for split payments, honestly not
// handle at 1:1).

import type { Rng } from "@/lib/seed/prng";

const LEGAL_SUFFIXES = ["Pvt Ltd", "Enterprises", "Traders", "& Sons", "Trading Co"];

/** Strips a legal suffix and lowercases, simulating how a bank
 *  narration abbreviates a counterparty compared to how the merchant
 *  named them when speaking. */
export function mangleNameCasual(name: string): string {
  let s = name;
  for (const suffix of LEGAL_SUFFIXES) {
    s = s.replace(new RegExp(`\\s*${suffix}\\s*$`, "i"), "");
  }
  return s.trim();
}

export function bankNarration(rng: Rng, name: string, reference?: string): string {
  const prefix = rng.pick(["UPI/CR/", "UPI/DR/", "NEFT/", "IMPS/"]);
  const acctNoise = String(rng.int(100000, 999999));
  return `${prefix}${mangleNameCasual(name).toUpperCase()}/${reference ?? acctNoise}`;
}

const UNRELATED_BUSINESS_NAMES = [
  "Zepto Marketplace Pvt Ltd",
  "Amazon Pay India",
  "PhonePe Merchant Settlement",
  "Blinkit Instant Commerce",
  "Reliance Retail Ltd",
  "Jio Payments Bank",
];

export function unrelatedCounterparty(rng: Rng): string {
  return rng.pick(UNRELATED_BUSINESS_NAMES);
}

export function makeReference(rng: Rng): string {
  return `REF${rng.int(100000, 999999)}`;
}
