// Synthesizes speech server-side, so SARVAM_API_KEY never reaches the
// browser. Returns raw PCM bytes with the actual sample rate and channel
// count in response headers, since Sarvam's TTS runs at 22050 Hz, not the
// 24kHz this codebase's playback queue was originally built assuming.
// Input length is capped hard: this is a real per-character cost, not a
// free quota, and a retry loop here spends actual money.

import { NextResponse } from "next/server";
import { getTtsEngine, isVoiceConfigured } from "@/lib/voice";

const MAX_CHARS = 600;

export async function POST(req: Request) {
  if (!isVoiceConfigured()) {
    return NextResponse.json({ error: "Voice is not configured on this deployment." }, { status: 503 });
  }

  const body = (await req.json()) as { text?: string; languageCode?: string };
  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "No text provided." }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `Text exceeds the ${MAX_CHARS} character limit for a single reply.` },
      { status: 400 }
    );
  }

  try {
    const { pcm, sampleRateHz, channels } = await getTtsEngine().synthesize(text, {
      languageCode: body.languageCode,
    });
    return new NextResponse(new Uint8Array(pcm), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Sample-Rate": String(sampleRateHz),
        "X-Channels": String(channels),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
