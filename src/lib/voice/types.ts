// The voice provider seam. Speech in and speech out are behind these two
// interfaces so a provider is a configuration choice, not an architectural
// commitment. The reasoning layer (Gemini, see src/lib/gemini/client.ts)
// never depends on which implementation is active here.

export interface SttEngine {
  /** Transcribes recorded audio. Returns the empty string if nothing was
   *  said, never throws for silence, only for a genuine request failure. */
  transcribe(wav: Buffer, languageHint?: string): Promise<string>;
}

export interface TtsSynthesis {
  /** Raw PCM samples, no header. */
  pcm: Buffer;
  /** Sample rate the PCM was actually generated at. Callers must use this,
   *  not assume a fixed rate: providers differ, and assuming one here is
   *  exactly the kind of unverified assumption this project has been
   *  burned by twice already this session. */
  sampleRateHz: number;
  channels: number;
}

export interface TtsEngine {
  synthesize(text: string, opts?: { languageCode?: string }): Promise<TtsSynthesis>;
}
