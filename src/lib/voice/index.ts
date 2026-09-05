// Provider factories. Sarvam is the only implementation today; this file
// is the single place a second provider would be added, so nothing else
// in the app imports src/lib/voice/sarvam.ts directly.

import { createSarvamStt, createSarvamTts, isSarvamConfigured } from "@/lib/voice/sarvam";
import type { SttEngine, TtsEngine } from "@/lib/voice/types";

export function isVoiceConfigured(): boolean {
  return isSarvamConfigured();
}

export function getSttEngine(): SttEngine {
  return createSarvamStt();
}

export function getTtsEngine(): TtsEngine {
  return createSarvamTts();
}

export type { SttEngine, TtsEngine, TtsSynthesis } from "@/lib/voice/types";
