"use client";

// The voice button's brain, rewritten as a turn loop after Gemini Live
// was replaced (see the plan's "what broke at 2 AM" writeup for why).
// Where useLiveSession held one always-open socket doing everything,
// this hook runs one HTTP round trip per stage: Sarvam STT, Gemini
// reasoning through the existing /api/chat route, Sarvam TTS. The mic
// capture, the playback queue, the duration cap and the drain-aware
// speaking-status reset are carried over from useLiveSession largely
// unchanged, since none of that logic depended on the socket.

import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWav, rms } from "@/lib/voice/wav";

const SOFT_WARNING_MS = 6 * 60_000;
const HARD_CLOSE_MS = 8 * 60_000;

// Energy-gate voice activity detection tuning. Not a trained VAD model,
// a cheap RMS threshold, good enough for a relatively quiet counter and
// backstopped by the manual stop control for anything noisier.
const CHUNK_MS = 100; // matches pcm-recorder.js's chunk size
const SPEECH_RMS_THRESHOLD = 0.02;
const SILENCE_MS_TO_END_TURN = 1100;
const MIN_SPEECH_MS_BEFORE_END = 500;
const MAX_TURN_MS = 25_000;

// Without headphones, the agent's own TTS output leaks back into the
// mic and its echo/reverb tail can cross SPEECH_RMS_THRESHOLD, starting
// a phantom turn from nothing the user said. This window is ignored
// entirely right after playback ends, before VAD runs at all.
const POST_SPEECH_COOLDOWN_MS = 500;
// A single noisy 100ms chunk (a cough, a chair creak, echo) should not
// be enough to cut the agent off mid-sentence; barge-in requires this
// many consecutive above-threshold chunks first.
const BARGE_IN_CHUNKS_REQUIRED = 2;
// After this many turns in a row come back with no transcribable
// speech, stop auto-relistening rather than keep spending STT credits
// on a noisy room; the user has to manually re-engage the mic.
const MAX_CONSECUTIVE_EMPTY_TURNS = 3;

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "typed"
  | "error";

export interface ToolTraceEntry {
  name: string;
  args: unknown;
  result: unknown;
  at: number;
}

export interface UseVoiceSessionResult {
  status: VoiceStatus;
  statusLabel: string;
  inputTranscript: string;
  outputTranscript: string;
  toolTrace: ToolTraceEntry[];
  durationWarning: boolean;
  start: () => Promise<void>;
  stop: () => void;
  onDashboardFocus: (view: string, entityId?: string) => void;
}

interface ChatHistoryMessage {
  role: "user" | "model";
  text: string;
}

interface ChatApiResponse {
  reply?: string;
  error?: string;
  toolTrace?: { name: string; args: unknown; result: unknown }[];
}

/** A route that crashes uncaught (a compile interruption, a dev-server
 *  restart mid-request) can return an empty or non-JSON body even
 *  though every route in this app is written to always return JSON.
 *  Parsing that safely here means the user sees "the server had a
 *  problem, try again", never a raw browser exception message like
 *  "Failed to execute 'json' on 'Response': Unexpected end of JSON
 *  input" rendered as if it were a normal status update. */
async function readJsonSafely<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function useVoiceSession(onFocus: (view: string, entityId?: string) => void): UseVoiceSessionResult {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [statusLabel, setStatusLabel] = useState("idle");
  const [inputTranscript, setInputTranscript] = useState("");
  const [outputTranscript, setOutputTranscript] = useState("");
  const [toolTrace, setToolTrace] = useState<ToolTraceEntry[]>([]);
  const [durationWarning, setDurationWarning] = useState(false);

  const statusRef = useRef<VoiceStatus>("idle");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackSampleRateRef = useRef<number>(0);
  const playbackQueueTimeRef = useRef(0);
  const speakingResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startedAtRef = useRef<number>(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Turn-in-progress state, all mutated only from the worklet's onmessage
  // handler and endTurn, never touched by React state to avoid re-render
  // churn on every 100ms audio chunk.
  const turnChunksRef = useRef<Int16Array[]>([]);
  const turnSpeechDetectedRef = useRef(false);
  const turnSilenceMsRef = useRef(0);
  const turnSpeechMsRef = useRef(0);
  const turnActiveRef = useRef(false); // guards against overlapping endTurn calls
  const historyRef = useRef<ChatHistoryMessage[]>([]);
  const stoppedRef = useRef(false);

  // See POST_SPEECH_COOLDOWN_MS, BARGE_IN_CHUNKS_REQUIRED and
  // MAX_CONSECUTIVE_EMPTY_TURNS above for why each of these exists.
  const listeningCooldownUntilRef = useRef(0);
  const bargeInStreakRef = useRef(0);
  const consecutiveEmptyTurnsRef = useRef(0);

  const flushPlayback = useCallback(() => {
    playbackCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current = null;
    playbackQueueTimeRef.current = 0;
    if (speakingResetRef.current) clearTimeout(speakingResetRef.current);
    speakingResetRef.current = null;
    listeningCooldownUntilRef.current = Date.now() + POST_SPEECH_COOLDOWN_MS;
    setStatus((s) => (s === "speaking" ? "listening" : s));
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micCtxRef.current?.close().catch(() => {});
    micCtxRef.current = null;
    playbackCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current = null;
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    durationTimerRef.current = null;
    if (speakingResetRef.current) clearTimeout(speakingResetRef.current);
    speakingResetRef.current = null;
    turnChunksRef.current = [];
    turnSpeechDetectedRef.current = false;
    turnActiveRef.current = false;
    historyRef.current = [];
    listeningCooldownUntilRef.current = 0;
    bargeInStreakRef.current = 0;
    consecutiveEmptyTurnsRef.current = 0;
    setStatus("idle");
    setDurationWarning(false);
  }, []);

  const playPcm = useCallback((pcm: ArrayBuffer, sampleRateHz: number) => {
    if (!playbackCtxRef.current || playbackSampleRateRef.current !== sampleRateHz) {
      playbackCtxRef.current?.close().catch(() => {});
      playbackCtxRef.current = new AudioContext({ sampleRate: sampleRateHz });
      playbackSampleRateRef.current = sampleRateHz;
      playbackQueueTimeRef.current = playbackCtxRef.current.currentTime;
    }
    const ctx = playbackCtxRef.current;
    const int16 = new Int16Array(pcm);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    const buffer = ctx.createBuffer(1, float32.length, sampleRateHz);
    buffer.copyToChannel(float32, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, playbackQueueTimeRef.current);
    source.start(startAt);
    playbackQueueTimeRef.current = startAt + buffer.duration;
    setStatus("speaking");

    if (speakingResetRef.current) clearTimeout(speakingResetRef.current);
    const msUntilDrained = Math.max(0, (playbackQueueTimeRef.current - ctx.currentTime) * 1000);
    speakingResetRef.current = setTimeout(() => {
      listeningCooldownUntilRef.current = Date.now() + POST_SPEECH_COOLDOWN_MS;
      setStatus((s) => (s === "speaking" ? "listening" : s));
    }, msUntilDrained + 120);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      try {
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
        const sampleRateHz = Number(res.headers.get("X-Sample-Rate") ?? "22050");
        const pcm = await res.arrayBuffer();
        playPcm(pcm, sampleRateHz);
      } catch {
        // Speech synthesis failing should not stop the turn from having
        // happened: the reply is already in outputTranscript on screen.
        setStatus((s) => (s === "speaking" ? "listening" : s));
      }
    },
    [playPcm]
  );

  const runTurn = useCallback(
    async (spokenText: string, opts?: { showAsUserTranscript?: boolean; persistInHistory?: boolean }) => {
      if (opts?.showAsUserTranscript !== false) setInputTranscript(spokenText);
      setStatus("thinking");

      // The session-open primer is an instruction to the model, not
      // something the shopkeeper said, so it never joins the visible
      // conversation history sent with every later turn.
      const persist = opts?.persistInHistory !== false;
      const historyBefore = historyRef.current.slice();
      if (persist) historyRef.current.push({ role: "user", text: spokenText });

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: spokenText, history: historyBefore }),
        });
        const data = await readJsonSafely<ChatApiResponse>(res);
        if (!data) {
          throw new Error("The server had a problem answering. Try again.");
        }
        if (!res.ok || data.error) {
          throw new Error(data.error ?? `Chat failed: ${res.status}`);
        }

        const reply = data.reply ?? "";
        if (persist) historyRef.current.push({ role: "model", text: reply });
        setOutputTranscript(reply);

        for (const t of data.toolTrace ?? []) {
          setToolTrace((prev) => [...prev, { ...t, at: Date.now() }]);
          if (t.name === "focus_dashboard") {
            const a = t.args as { view?: string; entityId?: string };
            if (a.view) onFocus(a.view, a.entityId);
          }
        }

        await speak(reply);
      } catch (err) {
        setStatus("error");
        setStatusLabel(err instanceof Error ? err.message : "The agent could not respond.");
      }
    },
    [onFocus, speak]
  );

  const flagEmptyTurn = useCallback(() => {
    consecutiveEmptyTurnsRef.current += 1;
    if (consecutiveEmptyTurnsRef.current >= MAX_CONSECUTIVE_EMPTY_TURNS) {
      // A noisy room burning STT credits on nothing: stop the session
      // properly (releasing the mic and audio contexts, not just
      // changing what the status label says) rather than loop
      // unattended. A re-click of the mic button calls start() fresh
      // against a clean slate, since stop() already made status "idle".
      stop();
      setStatusLabel("Having trouble hearing you. Tap the mic to try again.");
      return;
    }
    setStatusLabel("Didn't catch that, try again");
    setStatus("listening");
    setTimeout(() => {
      setStatusLabel((label) => (label === "Didn't catch that, try again" ? "listening" : label));
    }, 1500);
  }, [stop]);

  const endTurn = useCallback(async () => {
    if (turnActiveRef.current) return;
    const chunks = turnChunksRef.current;
    const speechMs = turnSpeechMsRef.current;
    turnChunksRef.current = [];
    turnSpeechDetectedRef.current = false;
    turnSilenceMsRef.current = 0;
    turnSpeechMsRef.current = 0;
    if (chunks.length === 0) return;

    // A couple of borderline-energy chunks alone should never justify a
    // real Sarvam credit: STT models tend to hallucinate plausible text
    // from near-silent or noise-only audio rather than returning empty,
    // so the honest place to block a phantom turn is before the network
    // call, not by trying to filter its response afterward.
    if (speechMs < MIN_SPEECH_MS_BEFORE_END) {
      flagEmptyTurn();
      return;
    }

    turnActiveRef.current = true;
    setStatus("transcribing");

    const totalLength = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Int16Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const wavBlob = encodeWav(merged, 16000);

    try {
      const form = new FormData();
      form.append("file", wavBlob, "turn.wav");
      const res = await fetch("/api/voice/stt", { method: "POST", body: form });
      const data = await readJsonSafely<{ text?: string; error?: string }>(res);
      if (!data) throw new Error("The server had a problem transcribing. Try again.");
      if (!res.ok || data.error) throw new Error(data.error ?? `STT failed: ${res.status}`);

      const text = (data.text ?? "").trim();
      if (!text) {
        flagEmptyTurn();
        turnActiveRef.current = false;
        return;
      }
      consecutiveEmptyTurnsRef.current = 0;
      await runTurn(text);
    } catch (err) {
      setStatus("error");
      setStatusLabel(err instanceof Error ? err.message : "Could not transcribe.");
    } finally {
      turnActiveRef.current = false;
    }
  }, [runTurn, flagEmptyTurn]);

  const handleMicChunk = useCallback(
    (buf: ArrayBuffer) => {
      const s = statusRef.current;
      if (s === "idle" || s === "connecting" || s === "error" || s === "typed") return;
      if (s === "transcribing" || s === "thinking") return; // a turn is already being processed

      const pcm16 = new Int16Array(buf);
      const energy = rms(pcm16);
      const isSpeech = energy > SPEECH_RMS_THRESHOLD;

      if (s === "speaking") {
        // Barge-in: sustained speech while the agent is talking cuts it
        // off and starts a fresh turn. A single noisy chunk (echo, a
        // cough) is not enough on its own; BARGE_IN_CHUNKS_REQUIRED
        // consecutive above-threshold chunks are required first.
        if (isSpeech) {
          bargeInStreakRef.current += 1;
          if (bargeInStreakRef.current >= BARGE_IN_CHUNKS_REQUIRED) {
            flushPlayback();
            turnChunksRef.current = [pcm16];
            turnSpeechDetectedRef.current = true;
            turnSilenceMsRef.current = 0;
            turnSpeechMsRef.current = CHUNK_MS;
            bargeInStreakRef.current = 0;
          }
        } else {
          bargeInStreakRef.current = 0;
        }
        return;
      }

      // s === "listening"
      if (Date.now() < listeningCooldownUntilRef.current) return;
      if (!turnSpeechDetectedRef.current) {
        if (!isSpeech) return; // still silent, nothing to accumulate yet
        turnSpeechDetectedRef.current = true;
      }
      turnChunksRef.current.push(pcm16);
      turnSpeechMsRef.current += CHUNK_MS;

      if (isSpeech) {
        turnSilenceMsRef.current = 0;
      } else {
        turnSilenceMsRef.current += CHUNK_MS;
      }

      const shouldEndOnSilence =
        turnSpeechMsRef.current >= MIN_SPEECH_MS_BEFORE_END &&
        turnSilenceMsRef.current >= SILENCE_MS_TO_END_TURN;
      const shouldEndOnMaxLength = turnSpeechMsRef.current >= MAX_TURN_MS;

      if (shouldEndOnSilence || shouldEndOnMaxLength) {
        void endTurn();
      }
    },
    [endTurn, flushPlayback]
  );

  const start = useCallback(async () => {
    stoppedRef.current = false;
    setStatus("connecting");
    setInputTranscript("");
    setOutputTranscript("");
    setToolTrace([]);
    historyRef.current = [];

    try {
      const micCtx = new AudioContext({ sampleRate: 16000 });
      micCtxRef.current = micCtx;
      await micCtx.audioWorklet.addModule("/worklets/pcm-recorder.js");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (stoppedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      micStreamRef.current = stream;
      const source = micCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(micCtx, "pcm-recorder");
      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => handleMicChunk(e.data);
      source.connect(worklet);
      workletNodeRef.current = worklet;

      setStatus("listening");
      setStatusLabel("listening");
      startedAtRef.current = Date.now();
      durationTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        if (elapsed >= HARD_CLOSE_MS) stop();
        else if (elapsed >= SOFT_WARNING_MS) setDurationWarning(true);
      }, 5000);

      // The agent speaks first, grounded in real ledger figures, never a
      // guess: /api/voice/primer is provider-agnostic and unchanged from
      // the Gemini Live build.
      try {
        const primer = await fetch("/api/voice/primer").then((r) => r.json());
        await runTurn(
          `SESSION PRIMER, these are real figures from the ledger right now, greet the shopkeeper ` +
            `in Hinglish in one or two short sentences using them naturally, then ask what to record. ` +
            `Do not read the raw field names aloud. Transactions today: ${primer.txnsToday}. ` +
            `On credit today: ${primer.creditSalesToday}. Cash position in paise: ${primer.cashPositionPaise}. ` +
            `Bank position in paise: ${primer.bankPositionPaise}. Open exceptions: ${primer.openExceptions}.`,
          { showAsUserTranscript: false, persistInHistory: false }
        );
      } catch {
        await runTurn("Greet the shopkeeper in Hinglish in one short sentence and ask what to record.", {
          showAsUserTranscript: false,
          persistInHistory: false,
        });
      }
    } catch (err) {
      setStatus("error");
      setStatusLabel(err instanceof Error ? err.message : "Voice session failed to start.");
    }
  }, [handleMicChunk, runTurn, stop]);

  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    statusLabel,
    inputTranscript,
    outputTranscript,
    toolTrace,
    durationWarning,
    start,
    stop,
    onDashboardFocus: onFocus,
  };
}
