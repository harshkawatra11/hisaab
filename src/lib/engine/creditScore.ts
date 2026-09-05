// A published, auditable credit-risk score per party, 0 to 100. Every
// input is a number the engine already computes elsewhere; the model
// is never consulted, the same rule every other deterministic feature
// in this codebase follows.
//
//   score = 100
//         - (agingPenalty     * 0.40)   share of open balance in the 30+ day bucket
//         - (latenessPenalty  * 0.35)   medianDaysToPay against a 15-day term
//         - (exceptionPenalty * 0.15)   reconciliation exceptions touching this party
//         + (tenureBonus       * 0.10)  transaction count, so a new party isn't
//                                       punished as hard as a proven poor payer
//
// Each term is normalized to 0-100 before weighting, and the final
// score is clamped to [0, 100]. medianDaysToPay and the aging buckets
// are both reused from forecast.ts and khata.ts rather than
// recomputed, since they are already the deterministic source of
// truth for those figures everywhere else in the app.

import { computePartyKhata } from "@/lib/engine/khata";
import { medianDaysToPay } from "@/lib/engine/forecast";
import { todayIST } from "@/lib/ids";
import type { HisaabException, Transaction } from "@/lib/types";

const CREDIT_TERM_DAYS = 15;
const LATENESS_FULL_PENALTY_DAYS = 45; // median days at or beyond this scores the full penalty
const EXCEPTION_PENALTY_PER_HIT = 25;
const TENURE_BONUS_PER_TXN = 10;

export type CreditBand = "good" | "fair" | "poor";

export interface CreditScoreResult {
  score: number;
  band: CreditBand;
  agingPenalty: number;
  latenessPenalty: number;
  exceptionPenalty: number;
  tenureBonus: number;
  medianDaysToPay: number;
  transactionCount: number;
  exceptionCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bandFor(score: number): CreditBand {
  if (score > 70) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

export function computeCreditScore(
  transactions: Transaction[],
  exceptions: HisaabException[],
  partyId: string,
  asOfDate: string = todayIST()
): CreditScoreResult {
  const partyTxns = transactions.filter((t) => t.partyId === partyId && t.status !== "void");
  const summary = computePartyKhata(transactions, partyId, asOfDate);
  const days = medianDaysToPay(transactions, partyId);

  const agingPenalty =
    summary.outstandingPaise > 0 ? (summary.aging.d30PlusPaise / summary.outstandingPaise) * 100 : 0;

  const latenessPenalty = clamp(
    ((days - CREDIT_TERM_DAYS) / (LATENESS_FULL_PENALTY_DAYS - CREDIT_TERM_DAYS)) * 100,
    0,
    100
  );

  // subjectIds on an exception holds internal transaction ids and
  // external record ids, never a party id directly (see
  // recon/exceptions.ts and recon/splitPayments.ts), so a party's
  // exceptions are found by intersecting its own transaction ids
  // against every open exception's subjectIds.
  const partyTxnIds = new Set(partyTxns.map((t) => t.id));
  const exceptionCount = exceptions.filter((e) => e.subjectIds.some((id) => partyTxnIds.has(id))).length;
  const exceptionPenalty = Math.min(100, exceptionCount * EXCEPTION_PENALTY_PER_HIT);

  const tenureBonus = Math.min(100, partyTxns.length * TENURE_BONUS_PER_TXN);

  const score = clamp(
    100 - agingPenalty * 0.4 - latenessPenalty * 0.35 - exceptionPenalty * 0.15 + tenureBonus * 0.1,
    0,
    100
  );

  return {
    score: Math.round(score),
    band: bandFor(score),
    agingPenalty: Math.round(agingPenalty),
    latenessPenalty: Math.round(latenessPenalty),
    exceptionPenalty: Math.round(exceptionPenalty),
    tenureBonus: Math.round(tenureBonus),
    medianDaysToPay: days,
    transactionCount: partyTxns.length,
    exceptionCount,
  };
}
