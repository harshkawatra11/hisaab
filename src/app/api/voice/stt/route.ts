// Transcribes recorded audio server-side, so SARVAM_API_KEY never reaches
// the browser, the same rule the Gemini key already followed.

import { NextResponse } from "next/server";
import { getSttEngine, isVoiceConfigured } from "@/lib/voice";

export async function POST(req: Request) {
  if (!isVoiceConfigured()) {
    return NextResponse.json({ error: "Voice is not configured on this deployment." }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No audio file provided." }, { status: 400 });
  }

  const wav = Buffer.from(await file.arrayBuffer());
  try {
    const text = await getSttEngine().transcribe(wav);
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
