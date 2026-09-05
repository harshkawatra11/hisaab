// Browser-safe WAV encoding. Deliberately standalone, no imports from
// src/lib/voice/index.ts or sarvam.ts: this file runs in the client
// bundle (useVoiceSession.ts), and those files touch server-only env
// vars that have no reason to ever ship to the browser.

export function encodeWav(pcm16: Int16Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm16.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm16.length; i++, offset += 2) view.setInt16(offset, pcm16[i], true);

  return new Blob([buffer], { type: "audio/wav" });
}

/** Root-mean-square energy of a PCM16 chunk, normalized to 0..1, for
 *  simple voice-activity detection. Not a real VAD model, just an energy
 *  gate: cheap, no dependency, good enough to segment turns in a
 *  relatively quiet kirana counter. */
export function rms(pcm16: Int16Array): number {
  if (pcm16.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < pcm16.length; i++) {
    const s = pcm16[i] / 32768;
    sumSquares += s * s;
  }
  return Math.sqrt(sumSquares / pcm16.length);
}
