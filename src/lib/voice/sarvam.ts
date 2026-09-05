// Sarvam speech to text and text to speech. Chosen for Hindi and Hinglish
// coverage. Both endpoints were verified directly against the real API
// before this file was written:
//   - TTS returns a standard 44-byte WAV header, PCM16 mono at 22050 Hz,
//     not the 24kHz this codebase's playback queue was built assuming.
//     Never hardcode a sample rate for this provider; read it from the
//     header every time, the way parseWavHeader does below.
//   - STT's response field is `transcript`, not `text`.

import type { SttEngine, TtsEngine, TtsSynthesis } from "@/lib/voice/types";

const BASE_URL = "https://api.sarvam.ai";

function requireKey(): string {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new SarvamNotConfiguredError();
  return key;
}

export class SarvamNotConfiguredError extends Error {
  constructor() {
    super("SARVAM_API_KEY is not set. Add it to .env.local to enable voice input and output.");
    this.name = "SarvamNotConfiguredError";
  }
}

/** Parses a standard RIFF/WAVE header and returns the PCM payload plus the
 *  format fields actually present in it, rather than assuming any of them. */
function parseWavHeader(buf: Buffer): TtsSynthesis {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Sarvam TTS did not return a recognizable WAV file.");
  }
  // Walk chunks after the 12-byte RIFF/WAVE header rather than assuming
  // "fmt " and "data" sit at fixed offsets 12 and 36, since some WAV
  // encoders insert extra chunks (e.g. LIST) between them.
  let offset = 12;
  let sampleRateHz = 0;
  let channels = 0;
  let dataStart = -1;
  let dataLength = 0;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    if (chunkId === "fmt ") {
      channels = buf.readUInt16LE(bodyStart + 2);
      sampleRateHz = buf.readUInt32LE(bodyStart + 4);
    } else if (chunkId === "data") {
      dataStart = bodyStart;
      dataLength = chunkSize;
    }
    offset = bodyStart + chunkSize + (chunkSize % 2);
  }
  if (dataStart < 0 || sampleRateHz === 0) {
    throw new Error("Sarvam TTS WAV was missing a fmt or data chunk.");
  }
  return {
    pcm: buf.subarray(dataStart, dataStart + dataLength),
    sampleRateHz,
    channels: channels || 1,
  };
}

class SarvamTts implements TtsEngine {
  async synthesize(text: string, opts?: { languageCode?: string }): Promise<TtsSynthesis> {
    const res = await fetch(`${BASE_URL}/text-to-speech`, {
      method: "POST",
      headers: {
        "api-subscription-key": requireKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        target_language_code: opts?.languageCode ?? "hi-IN",
        speaker: "shubh",
        model: "bulbul:v3",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sarvam TTS failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { audios: string[] };
    const wavBuffer = Buffer.from(data.audios[0], "base64");
    return parseWavHeader(wavBuffer);
  }
}

class SarvamStt implements SttEngine {
  async transcribe(wav: Buffer, languageHint?: string): Promise<string> {
    const form = new FormData();
    form.append("model", "saaras:v3");
    if (languageHint) form.append("language_code", languageHint);
    form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");

    const res = await fetch(`${BASE_URL}/speech-to-text`, {
      method: "POST",
      headers: { "api-subscription-key": requireKey() },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sarvam STT failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { transcript?: string };
    return data.transcript ?? "";
  }
}

export function isSarvamConfigured(): boolean {
  return Boolean(process.env.SARVAM_API_KEY);
}

export function createSarvamTts(): TtsEngine {
  return new SarvamTts();
}

export function createSarvamStt(): SttEngine {
  return new SarvamStt();
}
