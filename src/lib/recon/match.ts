// The three-layer matching engine. Layer 1 (exact) and Layer 2 (fuzzy)
// are pure deterministic code. Layer 3 (model reasoning) only ever sees
// candidates Layer 2 already produced, may only return an id from that
// candidate list, and has its confidence clamped below the auto-post
// threshold in code, not by asking it nicely in the prompt. See
// docs/methodology and README for why that clamp is the point.

import { normalizeDate, normalizeName, normalizeReference } from "@/lib/recon/normalize";
import { amountSim, dateSim, nameSim, refSim } from "@/lib/recon/signals";
import { daysBetween } from "@/lib/ids";
import type { ExternalRecord, MatchDecision, MatchMethod, MatchSignals, Transaction } from "@/lib/types";

export const EXACT_CONFIDENCE = 0.99;
export const MATCH_THRESHOLD = 0.9;
export const REVIEW_THRESHOLD = 0.72;
/** The model can never post as MATCHED: its confidence is clamped
 *  strictly below MATCH_THRESHOLD, enforced here, not in a prompt. */
export const AI_CONFIDENCE_CAP = 0.89;

export interface CandidatePair {
  internalTxnId: string;
  externalRecordId: string;
  confidence: number;
  signals: MatchSignals;
  decision: MatchDecision;
  method: MatchMethod;
  reason: string;
}

interface Normalized {
  id: string;
  date: string;
  amountPaise: number;
  name: string;
  ref: string | null;
}

function normalizeTxn(t: Transaction): Normalized {
  return {
    id: t.id,
    date: t.date,
    amountPaise: t.amountPaise,
    name: normalizeName(t.partyNameRaw ?? ""),
    ref: normalizeReference(t.reference),
  };
}

function normalizeExt(e: ExternalRecord): Normalized {
  return {
    id: e.id,
    date: normalizeDate(e.date),
    amountPaise: e.amountPaise,
    name: normalizeName(e.counterpartyRaw ?? e.narration ?? ""),
    ref: normalizeReference(e.reference),
  };
}

function scorePair(internal: Normalized, external: Normalized): { signals: MatchSignals; score: number } {
  const daysApart = daysBetween(internal.date, external.date);
  const aSim = amountSim(internal.amountPaise, external.amountPaise);
  const dSim = dateSim(daysApart);
  const nSim = nameSim(internal.name, external.name);
  const rSim = refSim(internal.ref, external.ref);

  let score: number;
  if (rSim === null) {
    // Rescale the remaining weights (0.40 + 0.20 + 0.25 = 0.85) to sum to 1.
    score = (0.4 * aSim + 0.2 * dSim + 0.25 * nSim) / 0.85;
  } else {
    score = 0.4 * aSim + 0.2 * dSim + 0.25 * nSim + 0.15 * rSim;
  }

  return {
    signals: {
      amountSim: aSim,
      dateSim: dSim,
      nameSim: nSim,
      refSim: rSim,
      daysApart,
      deltaPaise: internal.amountPaise - external.amountPaise,
    },
    score,
  };
}

// Bucket width for amount blocking: ₹50. A settlement fee, rounding
// difference, or short remittance is almost always well under this, so
// bucketing here (with a ±1 neighbor bucket, same trick as the date
// window below) keeps a genuine near-match from being blocked out of
// candidacy while still keeping the candidate set small on a 400+
// record dataset.
const AMOUNT_BUCKET_PAISE = 5000;

function amountBucketKeys(amountPaise: number): number[] {
  const center = Math.round(amountPaise / AMOUNT_BUCKET_PAISE);
  return [center - 1, center, center + 1];
}

/** Blocks candidates by a coarse amount bucket (±1 neighbor) and a ±5
 *  day window, so scoring stays roughly linear rather than O(n^2) on a
 *  400+ record dataset, while still surfacing near-amount matches
 *  (settlement fees, rounding, short remittances) as candidates. */
function buildBlocks(externals: Normalized[]): Map<string, Normalized[]> {
  const blocks = new Map<string, Normalized[]>();
  for (const e of externals) {
    for (const amountKey of amountBucketKeys(e.amountPaise)) {
      for (const dayOffset of [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]) {
        const dateKey = shiftDate(e.date, dayOffset);
        const key = `${amountKey}|${dateKey}`;
        if (!blocks.has(key)) blocks.set(key, []);
        const bucket = blocks.get(key)!;
        if (!bucket.includes(e)) bucket.push(e);
      }
    }
  }
  return blocks;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface MatchEngineResult {
  exact: CandidatePair[];
  fuzzyAutoMatched: CandidatePair[];
  reviewCandidates: CandidatePair[]; // 0.72-0.90, needs Layer 3 or human review
  unmatched: { internalTxnId: string }[]; // no candidate scored >= 0.72
}

export function runMatchEngine(
  internalTxns: Transaction[],
  externalRecords: ExternalRecord[]
): MatchEngineResult {
  const internals = internalTxns.map(normalizeTxn);
  const externals = externalRecords.map(normalizeExt);
  const blocks = buildBlocks(externals);

  const exact: CandidatePair[] = [];
  const fuzzyAutoMatched: CandidatePair[] = [];
  const reviewCandidates: CandidatePair[] = [];
  const unmatched: { internalTxnId: string }[] = [];

  const claimedExternal = new Set<string>();

  // Layer 1: exact reference + exact amount, checked against every
  // external record directly (cheap, and blocking would risk missing
  // an exact match whose date is far apart).
  for (const internal of internals) {
    if (!internal.ref) continue;
    const exactMatch = externals.find(
      (e) => e.ref === internal.ref && e.amountPaise === internal.amountPaise && !claimedExternal.has(e.id)
    );
    if (exactMatch) {
      claimedExternal.add(exactMatch.id);
      exact.push({
        internalTxnId: internal.id,
        externalRecordId: exactMatch.id,
        confidence: EXACT_CONFIDENCE,
        signals: scorePair(internal, exactMatch).signals,
        decision: "MATCHED",
        method: "exact",
        reason: "Exact reference and exact amount.",
      });
    }
  }

  const exactInternalIds = new Set(exact.map((c) => c.internalTxnId));

  // Layer 2: blocked fuzzy scoring for everything Layer 1 didn't claim.
  for (const internal of internals) {
    if (exactInternalIds.has(internal.id)) continue;
    const amountKey = Math.round(internal.amountPaise / AMOUNT_BUCKET_PAISE);
    const key = `${amountKey}|${internal.date}`;
    const candidates = (blocks.get(key) ?? []).filter((e) => !claimedExternal.has(e.id));

    let best: { ext: Normalized; signals: MatchSignals; score: number } | null = null;
    for (const ext of candidates) {
      const { signals, score } = scorePair(internal, ext);
      if (!best || score > best.score) best = { ext, signals, score };
    }

    if (!best || best.score < REVIEW_THRESHOLD) {
      unmatched.push({ internalTxnId: internal.id });
      continue;
    }

    const pair: CandidatePair = {
      internalTxnId: internal.id,
      externalRecordId: best.ext.id,
      confidence: best.score,
      signals: best.signals,
      decision: best.score >= MATCH_THRESHOLD ? "MATCHED" : "REVIEW",
      method: "fuzzy",
      reason:
        best.score >= MATCH_THRESHOLD
          ? `Fuzzy match at ${(best.score * 100).toFixed(0)}% confidence, above the ${MATCH_THRESHOLD * 100}% auto-post threshold.`
          : `Fuzzy match at ${(best.score * 100).toFixed(0)}% confidence, in the review band (${REVIEW_THRESHOLD * 100}-${MATCH_THRESHOLD * 100}%).`,
    };

    if (pair.decision === "MATCHED") {
      claimedExternal.add(best.ext.id);
      fuzzyAutoMatched.push(pair);
    } else {
      reviewCandidates.push(pair);
    }
  }

  return { exact, fuzzyAutoMatched, reviewCandidates, unmatched };
}

/**
 * Applies a Layer-3 (model) decision to a review candidate. The caller
 * is responsible for ensuring the chosen id came from the candidate
 * list handed to the model; this function enforces the confidence cap
 * regardless of what the model claims.
 */
export function applyAiDecision(
  candidate: CandidatePair,
  aiConfidence: number,
  aiReason: string
): CandidatePair {
  const clamped = Math.min(aiConfidence, AI_CONFIDENCE_CAP);
  return {
    ...candidate,
    confidence: clamped,
    decision: "REVIEW", // never MATCHED: the cap keeps it below MATCH_THRESHOLD
    method: "ai",
    reason: aiReason,
  };
}
