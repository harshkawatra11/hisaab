// Normalization that runs before any matching signal is computed. Every
// function here is pure and independently testable, because a bug in
// normalization silently degrades every downstream signal at once.

const LEGAL_SUFFIXES = [
  "PVT",
  "LTD",
  "LIMITED",
  "PRIVATE",
  "ENTERPRISES",
  "TRADERS",
  "AND SONS",
  "& SONS",
  "TRADING",
  "CO",
  "COMPANY",
];

const NARRATION_PREFIXES = [
  "UPI/CR/",
  "UPI/DR/",
  "UPI-CR-",
  "UPI-DR-",
  "IMPS/",
  "NEFT/",
  "RTGS/",
  "POS/",
  "UPI/",
];

export function normalizeDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const shifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function normalizeName(raw: string): string {
  let s = raw.toUpperCase().trim();
  for (const prefix of NARRATION_PREFIXES) {
    if (s.startsWith(prefix)) s = s.slice(prefix.length);
  }
  s = s.replace(/[^A-Z0-9\s&]/g, " ");
  for (const suffix of LEGAL_SUFFIXES) {
    s = s.replace(new RegExp(`\\b${suffix}\\b`, "g"), "");
  }
  // Strip long digit runs that are typically reference/account numbers
  // embedded in a bank narration, not part of the counterparty's name.
  s = s.replace(/\b\d{6,}\b/g, "");
  return s.replace(/\s+/g, " ").trim();
}

export function normalizeReference(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length > 0 ? s : null;
}
