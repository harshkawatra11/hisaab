// The one place a Gemini client gets instantiated, and the one place
// the model fallback chain lives. Everything that calls Gemini in this
// codebase goes through here. If no key is configured, callers get a
// typed, expected failure rather than a crash: the text chat and voice
// features are additive, every deterministic feature (posting, khata,
// reconciliation, forecast, tax) was built and fully tested with zero
// Gemini access.

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { toOpenAITools } from "@/lib/agent/toOpenAITools";

// Text-generation chain for the chat fallback path. An explicit
// GEMINI_MODEL env var is tried first, never in place of the chain, so
// a misconfigured or since-renamed override cannot take the feature
// down entirely. Both models here were verified directly against a real
// key and a real tool-calling request before being pinned; gemini-2.5-flash
// was dropped after the same key returned 404, "no longer available to
// new users", for it.
const TEXT_MODEL_CHAIN = ["gemini-3.6-flash", "gemini-3.7-flash"];

// Last-resort fallback if every Gemini text model fails. A different API
// entirely (OpenAI-compatible), not another entry in TEXT_MODEL_CHAIN,
// so it is handled as a separate final attempt inside generateWithFallback
// rather than a chain entry. Verified directly against the real Scenario A
// test sentence before being pinned; free OpenRouter models share upstream
// pools and 429 intermittently, which is exactly the kind of failure this
// whole fallback exists to survive, one layer further out.
const OPENROUTER_FALLBACK_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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

// Minimal shape carrying only what every caller of generateWithFallback
// actually reads (response.text, response.functionCalls), so the
// OpenRouter fallback can return something structurally compatible
// without depending on the full Gemini SDK response type.
interface FallbackResponse {
  text: string | undefined;
  functionCalls: { name?: string; args?: unknown }[] | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeminiContent = { role?: string; parts?: any[] };

/** Converts the app's Gemini-shaped conversation into OpenAI chat messages,
 *  pairing functionCall/functionResponse parts by their position within
 *  each consecutive run, since neither side of this codebase's existing
 *  Gemini contents array carries an explicit call id to match on. */
function contentsToOpenAIMessages(
  contents: GeminiContent[],
  systemInstruction: string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [];
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });

  for (const content of contents) {
    const parts = content.parts ?? [];
    const textParts = parts.filter((p) => typeof p.text === "string");
    const callParts = parts.filter((p) => p.functionCall);
    const responseParts = parts.filter((p) => p.functionResponse);

    if (textParts.length) {
      messages.push({
        role: content.role === "model" ? "assistant" : "user",
        content: textParts.map((p) => p.text).join("\n"),
      });
    }
    if (callParts.length) {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: callParts.map((p, i) => ({
          id: `call_${i}`,
          type: "function",
          function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) },
        })),
      });
    }
    if (responseParts.length) {
      for (let i = 0; i < responseParts.length; i++) {
        messages.push({
          role: "tool",
          tool_call_id: `call_${i}`,
          content: JSON.stringify(responseParts[i].functionResponse.response),
        });
      }
    }
  }
  return messages;
}

/** The single last-resort call, made only after every Gemini text model
 *  has already failed. Verified directly against the real Scenario A test
 *  sentence before this was wired in. */
async function tryOpenRouterFallback(
  contents: GeminiContent[],
  config?: { systemInstruction?: unknown; tools?: { functionDeclarations?: unknown[] }[] }
): Promise<FallbackResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set, cannot use the fallback tier.");

  const systemText =
    typeof config?.systemInstruction === "string" ? config.systemInstruction : undefined;
  const messages = contentsToOpenAIMessages(contents, systemText);
  const declarations = config?.tools?.[0]?.functionDeclarations;
  const tools = declarations ? toOpenAITools(declarations as never) : undefined;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hisaab-hk.vercel.app",
      "X-Title": "Hisaab",
    },
    body: JSON.stringify({ model: OPENROUTER_FALLBACK_MODEL, messages, tools }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter fallback failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const choice = data.choices?.[0]?.message;
  const toolCalls = choice?.tool_calls as
    | { function: { name: string; arguments: string } }[]
    | undefined;
  return {
    text: choice?.content ?? undefined,
    functionCalls: toolCalls?.map((tc) => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || "{}"),
    })),
  };
}

/**
 * Tries each model in the text chain in order, moving to the next on
 * any request-level failure or empty response, so one model being
 * unavailable, renamed or deprecated cannot take the chat feature down.
 * If every Gemini model fails, makes one last attempt against OpenRouter
 * before giving up, converting the tool schema only for that one call.
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
      // thinkingConfig.thinkingLevel: "LOW" is load-bearing, not cosmetic.
      // Verified directly with raw curl outside this codebase: the exact
      // same tool-calling request took 277 seconds with the model's
      // default thinking level and 3.5 seconds with this one set, on this
      // key, for this model. thinkingBudget: 0 was tried first and
      // rejected outright (400 INVALID_ARGUMENT) by gemini-3.6-flash, so
      // that field is deliberately not used. A tool-dispatching agent
      // does not need deep reasoning to pick which function to call.
      const finalConfig = { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, ...config };
      const response = await genai.models.generateContent({ model, contents, config: finalConfig });
      if (response.text || response.functionCalls?.length) {
        return { response, model };
      }
      causes.push(new Error(`Empty response from ${model}`));
    } catch (err) {
      causes.push(err);
    }
  }

  if (process.env.OPENROUTER_API_KEY) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await tryOpenRouterFallback(contents as any, config as any);
      if (response.text || response.functionCalls?.length) {
        return { response, model: OPENROUTER_FALLBACK_MODEL };
      }
      causes.push(new Error(`Empty response from ${OPENROUTER_FALLBACK_MODEL}`));
    } catch (err) {
      causes.push(err);
    }
  }

  throw new GeminiAllModelsFailedError([...chain, OPENROUTER_FALLBACK_MODEL], causes);
}
