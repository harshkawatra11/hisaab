// The one place a Gemini client gets instantiated, and the one place
// the model fallback chain lives. Everything that calls Gemini in this
// codebase goes through here. If no key is configured, callers get a
// typed, expected failure rather than a crash: the text chat and voice
// features are additive, every deterministic feature (posting, khata,
// reconciliation, forecast, tax) was built and fully tested with zero
// Gemini access.

import { GoogleGenAI } from "@google/genai";

// Text-generation chain for the chat fallback path. An explicit
// GEMINI_MODEL env var is tried first, never in place of the chain, so
// a misconfigured or since-renamed override cannot take the feature
// down entirely. gemini-2.5-flash is kept last for older keys that
// still have access to it, mirroring the same reasoning Adhikaar's
// client.ts documents: removing a still-working fallback only
// reintroduces the single-model fragility this chain exists to avoid.
const TEXT_MODEL_CHAIN = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-2.5-flash"];

// Live (voice) model chain. Resolved from the four models confirmed
// enabled on this project's AI Studio account: the console labels
// "Gemini 3 Flash Live" and "Gemini 2.5 Flash Native Audio Dialog" map
// to these preview ids. Both are unlimited on RPM/RPD; only TPM binds
// (150K and 1M respectively), which is what src/lib/limits/budget.ts
// defends rather than request counting.
export const LIVE_MODEL_PRIMARY = "gemini-3.1-flash-live-preview";
export const LIVE_MODEL_FALLBACK = "gemini-2.5-flash-native-audio-preview-12-2025";
export const LIVE_MODEL_TRANSCRIBE_ONLY = "gemini-3.5-transcribe-live";
export const LIVE_MODEL_TRANSLATE = "gemini-3.5-live-translate-preview";

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getTextModelChain(): string[] {
  const chain = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL, ...TEXT_MODEL_CHAIN] : TEXT_MODEL_CHAIN;
  return [...new Set(chain)];
}

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new GeminiNotConfiguredError();
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

/** Test-only: forces a fresh client on the next getGeminiClient() call,
 *  so a mocked SDK boundary is picked up cleanly between test cases. */
export function __resetGeminiClientForTests(): void {
  client = null;
}

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super(
      "GEMINI_API_KEY is not set. Add it to .env.local to enable the voice and text-chat features. Every other feature of Hisaab works without it."
    );
    this.name = "GeminiNotConfiguredError";
  }
}

export class GeminiAllModelsFailedError extends Error {
  constructor(triedModels: string[], causes: unknown[]) {
    const last = causes[causes.length - 1];
    const lastMessage = last instanceof Error ? last.message : String(last);
    super(`Every model in the fallback chain failed (tried: ${triedModels.join(", ")}). Last error: ${lastMessage}`);
    this.name = "GeminiAllModelsFailedError";
  }
}

/**
 * Tries each model in the text chain in order, moving to the next on
 * any request-level failure or empty response, so one model being
 * unavailable, renamed or deprecated cannot take the chat feature down.
 */
export async function generateWithFallback(
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"],
  config?: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["config"]
) {
  const genai = getGeminiClient();
  const chain = getTextModelChain();
  const causes: unknown[] = [];

  for (const model of chain) {
    try {
      const response = await genai.models.generateContent({ model, contents, config });
      if (response.text || response.functionCalls?.length) {
        return { response, model };
      }
      causes.push(new Error(`Empty response from ${model}`));
    } catch (err) {
      causes.push(err);
    }
  }

  throw new GeminiAllModelsFailedError(chain, causes);
}
