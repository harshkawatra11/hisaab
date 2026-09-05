// Mints a single-use Gemini ephemeral token so the browser can open a
// Live API session without the standing GEMINI_API_KEY ever reaching
// the client. Ephemeral tokens work only against the Live API and only
// on v1beta (see ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens).
//
// Consults the token-budget degradation ladder first: if every voice
// model's rolling TPM window is exhausted, this returns the next
// available rung (or "typed") instead of a token, so the client can
// degrade its UI honestly rather than opening a session that would
// immediately fail.

import { NextResponse } from "next/server";
import { isGeminiConfigured, getGeminiClient } from "@/lib/gemini/client";
import { estimateAudioTokens, selectSessionRung } from "@/lib/limits/budget";

// A conservative estimate for a fresh session: ~90 seconds of expected
// audio in the first exchange, plus the system instruction and tool
// declarations (~1500 tokens, charged once at session open).
const ESTIMATED_SESSION_OPEN_TOKENS = estimateAudioTokens(90) + 1500;

export async function POST() {
  if (!isGeminiConfigured()) {
    // This branch looks identical from the client to a real service outage,
    // but it almost always means GEMINI_API_KEY is simply absent from the
    // environment (no .env.local, or a deploy target missing the variable).
    // Logged loudly here so that distinction is never invisible again.
    if (process.env.NODE_ENV !== "production") {
      console.error("[voice/token] GEMINI_API_KEY is not set, degrading to typed.");
    }
    return NextResponse.json({
      rung: "typed",
      model: null,
      statusLabel: "typed",
      reason: "Gemini is not configured on this deployment.",
    });
  }

  const selection = selectSessionRung(ESTIMATED_SESSION_OPEN_TOKENS);
  if (selection.rung === "typed" || !selection.model) {
    return NextResponse.json(selection);
  }

  try {
    const client = getGeminiClient();
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: selection.model,
        },
      },
    });

    return NextResponse.json({
      ...selection,
      token: token.name,
    });
  } catch (err) {
    // Token minting failed for a reason unrelated to our own budget
    // tracking (network, an SDK surface mismatch, an expired key).
    // Degrade to the next rung down rather than surfacing a raw error
    // to a live demo, but log it loudly outside production so this
    // branch is never confused with the "no key configured" branch above.
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV !== "production") {
      console.error("[voice/token] mint failed, degrading to typed:", message);
    }
    return NextResponse.json({
      rung: "typed",
      model: null,
      statusLabel: "typed",
      reason: `Voice session could not start: ${message}`,
    });
  }
}
