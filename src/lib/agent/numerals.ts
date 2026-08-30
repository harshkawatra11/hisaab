// Resolves spoken Indian quantity words to numbers, deterministically,
// before any tool argument reaches the posting engine. A voice model
// that mishears "dhai kilo" as "2 kilo" writes a wrong ledger entry,
// and no amount of prompt engineering makes that safe: this is why the
// normalization lives in code, with its own test fixtures, rather than
// being left to the model's own arithmetic.
//
// Covers the fractional/compound words a shopkeeper actually uses
// (dhai, sava, paune, derh) plus the large-number words (hazaar, lakh,
// crore) in both Latin transliteration and Devanagari. Anything not
// recognised is rejected rather than guessed, so a caller can fall back
// to asking a clarifying question instead of silently posting a wrong
// quantity.

const WORD_TO_NUMBER: Record<string, number> = {
  // Fractional / compound quantities
  "dhai": 2.5,
  "ढाई": 2.5,
  "sava": 1.25,
  "सवा": 1.25,
  "paune": 0.75, // used as "paune do" = 1.75, handled compositionally below
  "पौने": 0.75,
  "derh": 1.5,
  "डेढ़": 1.5,
  "adha": 0.5,
  "आधा": 0.5,
  "aadha": 0.5,

  // Cardinals 0-20 (Hindi/Hinglish, informal spellings included)
  "zero": 0, "शून्य": 0,
  "ek": 1, "एक": 1,
  "do": 2, "दो": 2,
  "teen": 3, "tin": 3, "तीन": 3,
  "chaar": 4, "char": 4, "चार": 4,
  "paanch": 5, "panch": 5, "पांच": 5, "पाँच": 5,
  "chhe": 6, "che": 6, "छह": 6, "छे": 6,
  "saat": 7, "सात": 7,
  "aath": 8, "आठ": 8,
  "nau": 9, "नौ": 9,
  "das": 10, "dus": 10, "दस": 10,
  "gyarah": 11, "ग्यारह": 11,
  "baarah": 12, "barah": 12, "बारह": 12,
  "terah": 13, "तेरह": 13,
  "chaudah": 14, "चौदह": 14,
  "pandrah": 15, "पंद्रह": 15,
  "solah": 16, "सोलह": 16,
  "satrah": 17, "सत्रह": 17,
  "atharah": 18, "अठारह": 18,
  "unnis": 19, "उन्नीस": 19,
  "bees": 20, "बीस": 20,
};

// Multiplier words: "X hazaar/lakh/crore" or the pre-composed Hindi
// numeral phrase "bara sau" (twelve hundred = 1200).
const MULTIPLIERS: Record<string, number> = {
  "sau": 100, "सौ": 100,
  "hazaar": 1000, "hazar": 1000, "हज़ार": 1000, "हजार": 1000,
  "lakh": 100000, "lac": 100000, "लाख": 100000,
  "crore": 10000000, "karod": 10000000, "करोड़": 10000000,
};

export interface ParsedNumeral {
  value: number;
  matchedTokens: string[];
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Parses a spoken Indian-numeral phrase into a number. Returns null
 * (never a best-effort guess) when the phrase is not recognised, so
 * the caller can ask a clarifying question instead of posting a wrong
 * quantity or amount.
 *
 * Examples: "dhai" -> 2.5, "sava do" -> 2.25, "derh sau" -> 150,
 * "bara sau" -> 1200, "paune do" -> 1.75, "do lakh" -> 200000.
 */
export function parseIndianNumeral(input: string): ParsedNumeral | null {
  const tokens = tokenize(input);
  if (tokens.length === 0) return null;

  // "paune X" = X - 0.25 (e.g. "paune do" = 1.75, "paune sau" = 75)
  if (tokens[0] === "paune" || tokens[0] === "पौने") {
    const rest = parseIndianNumeral(tokens.slice(1).join(" "));
    if (rest === null) return null;
    return { value: rest.value - 0.25, matchedTokens: tokens };
  }

  // "sava X" = X + 0.25 (e.g. "sava do" = 2.25)
  if (tokens[0] === "sava" || tokens[0] === "सवा") {
    if (tokens.length === 1) return { value: 1.25, matchedTokens: tokens };
    const rest = parseIndianNumeral(tokens.slice(1).join(" "));
    if (rest === null) return null;
    return { value: rest.value + 0.25, matchedTokens: tokens };
  }

  // "derh X" = 1.5 * X only when X is a bare multiplier (sau/hazaar/...)
  if (tokens[0] === "derh" || tokens[0] === "डेढ़") {
    if (tokens.length === 1) return { value: 1.5, matchedTokens: tokens };
    const mult = MULTIPLIERS[tokens[1]];
    if (mult !== undefined) return { value: 1.5 * mult, matchedTokens: tokens.slice(0, 2) };
    return null;
  }

  // General case: an optional leading cardinal, followed by zero or
  // more multiplier words, e.g. "bara sau" = 12 * 100, "do lakh
  // pachaas hazaar" = 2*100000 + 50*1000.
  let total = 0;
  let current: number | null = null;
  let matched = false;

  for (const tok of tokens) {
    if (tok in WORD_TO_NUMBER) {
      current = WORD_TO_NUMBER[tok];
      matched = true;
      continue;
    }
    if (tok in MULTIPLIERS) {
      const base = current ?? 1;
      total += base * MULTIPLIERS[tok];
      current = null;
      matched = true;
      continue;
    }
    // Unrecognised token: fail rather than guess.
    return null;
  }

  if (!matched) return null;
  if (current !== null) total += current;
  return { value: total, matchedTokens: tokens };
}

/** Convenience wrapper for the common tool-argument case: parse or
 *  throw, since a tool handler should reject a malformed quantity
 *  rather than post a silently wrong one. */
export function requireIndianNumeral(input: string): number {
  const parsed = parseIndianNumeral(input);
  if (parsed === null) {
    throw new Error(`Could not resolve the spoken quantity "${input}" to a number.`);
  }
  return parsed.value;
}
