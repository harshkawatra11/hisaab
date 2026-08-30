// Defends the Live API's real binding constraint. On this project's
// account, RPM and RPD are unlimited across all four Live models; only
// TPM (tokens per minute) is capped, so this is a token-budget limiter
// with a degradation ladder, not a request counter. Session *length*,
// not session *count*, is what burns the quota: Live API session
// memory re-bills at the standard input rate (1 session-memory token =
// 1 input token), so a single long session is a bigger threat than
// many short ones. That is why this module caps session duration as
// its primary defense, alongside a rolling token window.

import {
  LIVE_MODEL_FALLBACK,
  LIVE_MODEL_PRIMARY,
  LIVE_MODEL_TRANSCRIBE_ONLY,
  LIVE_MODEL_TRANSLATE,
} from "@/lib/gemini/client";

// Audio bills at 25 tokens/second (Gemini Live API capabilities doc).
// countTokens is not supported on Live models, so every estimate below
// is exactly that, an estimate; reconcile() overwrites it with the
// real figure whenever the server sends usageMetadata.
export const AUDIO_TOKENS_PER_SECOND = 25;

// Real per-model TPM ceilings read off the account's own AI Studio
// quota page. The 70% headroom absorbs estimation error, since
// countTokens is unavailable on Live models.
const RAW_TPM: Record<string, number> = {
  [LIVE_MODEL_PRIMARY]: 150_000,
  [LIVE_MODEL_FALLBACK]: 1_000_000,
  [LIVE_MODEL_TRANSCRIBE_ONLY]: 100_000,
  [LIVE_MODEL_TRANSLATE]: 100_000,
};
const HEADROOM_FACTOR = 0.7;

export function tpmCeiling(model: string): number {
  const raw = RAW_TPM[model];
  if (raw === undefined) throw new Error(`No TPM ceiling configured for model "${model}".`);
  return Math.floor(raw * HEADROOM_FACTOR);
}

const WINDOW_MS = 60_000;
export const SOFT_WARNING_MS = 6 * 60_000;
export const HARD_CLOSE_MS = 8 * 60_000;

interface Window {
  windowStart: number;
  tokensUsed: number;
}

const windows = new Map<string, Window>();

function getWindow(model: string, now: number): Window {
  let w = windows.get(model);
  if (!w || now - w.windowStart > WINDOW_MS) {
    w = { windowStart: now, tokensUsed: 0 };
    windows.set(model, w);
  }
  return w;
}

/** True if `tokens` more can be spent on `model` without crossing its
 *  70%-of-real-TPM ceiling in the current rolling window. Does not
 *  consume; call recordUsage() once the tokens are actually spent. */
export function canSpend(model: string, tokens: number, now: number = Date.now()): boolean {
  const w = getWindow(model, now);
  return w.tokensUsed + tokens <= tpmCeiling(model);
}

export function recordUsage(model: string, tokens: number, now: number = Date.now()): void {
  const w = getWindow(model, now);
  w.tokensUsed += tokens;
}

/** Overwrites the estimate with the real usageMetadata figure the
 *  server sends back, when it sends one, rather than trusting the
 *  25 tokens/sec estimate indefinitely within a window. */
export function reconcileUsage(model: string, actualTotalTokensSoFar: number, now: number = Date.now()): void {
  const w = getWindow(model, now);
  w.tokensUsed = actualTotalTokensSoFar;
}

export function estimateAudioTokens(seconds: number): number {
  return Math.ceil(seconds * AUDIO_TOKENS_PER_SECOND);
}

export type SessionRung = "full_duplex" | "fallback_duplex" | "transcribe_only" | "typed";

export interface RungSelection {
  rung: SessionRung;
  model: string | null;
  statusLabel: string;
}

const RUNG_LABELS: Record<SessionRung, string> = {
  full_duplex: "voice · full duplex",
  fallback_duplex: "voice · full duplex",
  transcribe_only: "voice · transcribe only",
  typed: "typed",
};

/**
 * Picks the best available rung of the degradation ladder for a new
 * session, given an estimated token cost for the session about to
 * start. Never throws: the bottom rung (typed) always succeeds, so the
 * product cannot die on stage when a quota is exhausted.
 */
export function selectSessionRung(estimatedTokens: number, now: number = Date.now()): RungSelection {
  if (canSpend(LIVE_MODEL_PRIMARY, estimatedTokens, now)) {
    return { rung: "full_duplex", model: LIVE_MODEL_PRIMARY, statusLabel: RUNG_LABELS.full_duplex };
  }
  if (canSpend(LIVE_MODEL_FALLBACK, estimatedTokens, now)) {
    return { rung: "fallback_duplex", model: LIVE_MODEL_FALLBACK, statusLabel: RUNG_LABELS.fallback_duplex };
  }
  if (canSpend(LIVE_MODEL_TRANSCRIBE_ONLY, estimatedTokens, now)) {
    return { rung: "transcribe_only", model: LIVE_MODEL_TRANSCRIBE_ONLY, statusLabel: RUNG_LABELS.transcribe_only };
  }
  return { rung: "typed", model: null, statusLabel: RUNG_LABELS.typed };
}

export interface SessionDurationState {
  startedAt: number;
  shouldWarn: boolean;
  shouldClose: boolean;
  elapsedMs: number;
}

export function checkSessionDuration(startedAt: number, now: number = Date.now()): SessionDurationState {
  const elapsedMs = now - startedAt;
  return {
    startedAt,
    elapsedMs,
    shouldWarn: elapsedMs >= SOFT_WARNING_MS,
    shouldClose: elapsedMs >= HARD_CLOSE_MS,
  };
}

/** Test-only: clears all per-model rolling windows. */
export function __resetBudgetForTests(): void {
  windows.clear();
}
