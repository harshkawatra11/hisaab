"use client";

// The voice button's brain. Owns mic capture, the 24kHz playback
// queue, the Live session lifecycle, and the client side of the
// duration cap (soft warning at 6 minutes, hard close at 8, mirroring
// src/lib/limits/budget.ts's server-side constants exactly, since a
// long session is what actually burns TPM). On any failure it degrades
// to the next rung rather than surfacing a dead button.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchVoiceToken, openLiveSession, type LiveSessionHandle } from "@/lib/gemini/live";

// Mirrors SOFT_WARNING_MS / HARD_CLOSE_MS in src/lib/limits/budget.ts.
const SOFT_WARNING_MS = 6 * 60_000;
const HARD_CLOSE_MS = 8 * 60_000;

export type VoiceStatus = "idle" | "connecting" | "listening" | "speaking" | "transcribe_only" | "typed" | "error";

export interface ToolTraceEntry {
  name: string;
  args: unknown;
  result: unknown;
  at: number;
}

export interface UseLiveSessionResult {
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

async function callToolApi(name: string, args: unknown): Promise<unknown> {
  const res = await fetch("/api/agent/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, args }),
  });
  return res.json();
}

export function useLiveSession(onFocus: (view: string, entityId?: string) => void): UseLiveSessionResult {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [statusLabel, setStatusLabel] = useState("typed");
  const [inputTranscript, setInputTranscript] = useState("");
  const [outputTranscript, setOutputTranscript] = useState("");
  const [toolTrace, setToolTrace] = useState<ToolTraceEntry[]>([]);
  const [durationWarning, setDurationWarning] = useState(false);

  const sessionRef = useRef<LiveSessionHandle | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const playbackQueueTimeRef = useRef(0);
  const startedAtRef = useRef<number>(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    playbackCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current = null;
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    durationTimerRef.current = null;
    setStatus("idle");
    setDurationWarning(false);
  }, []);

  const playAudioChunk = useCallback((base64Pcm24k: string) => {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });
      playbackQueueTimeRef.current = playbackCtxRef.current.currentTime;
    }
    const ctx = playbackCtxRef.current;
    const binary = atob(base64Pcm24k);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, playbackQueueTimeRef.current);
    source.start(startAt);
    playbackQueueTimeRef.current = startAt + buffer.duration;
    setStatus("speaking");
  }, []);

  const flushPlayback = useCallback(() => {
    // Barge-in: closing and reopening the playback context is the
    // simplest reliable way to flush already-scheduled buffer sources.
    playbackCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current = null;
    playbackQueueTimeRef.current = 0;
  }, []);

  const start = useCallback(async () => {
    setStatus("connecting");
    setInputTranscript("");
    setOutputTranscript("");
    setToolTrace([]);

    const tokenResponse = await fetchVoiceToken();
    setStatusLabel(tokenResponse.statusLabel);

    if (tokenResponse.rung === "typed" || !tokenResponse.token) {
      setStatus("typed");
      return;
    }

    try {
      const handle = await openLiveSession(tokenResponse, {
        onInputTranscript: (text) => setInputTranscript((prev) => prev + text),
        onOutputTranscript: (text) => setOutputTranscript((prev) => prev + text),
        onAudioChunk: playAudioChunk,
        onInterrupted: flushPlayback,
        onToolCall: async (name, args) => {
          if (name === "focus_dashboard") {
            const a = args as { view?: string; entityId?: string };
            if (a.view) onFocus(a.view, a.entityId);
          }
          return callToolApi(name, args);
        },
        onToolTrace: (name, args, result) =>
          setToolTrace((prev) => [...prev, { name, args, result, at: Date.now() }]),
        onClose: () => setStatus("idle"),
        onError: () => setStatus("error"),
      });

      sessionRef.current = handle;
      setStatus("listening");
      startedAtRef.current = Date.now();

      durationTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        if (elapsed >= HARD_CLOSE_MS) {
          stop();
        } else if (elapsed >= SOFT_WARNING_MS) {
          setDurationWarning(true);
        }
      }, 5000);

      // Mic capture: 16kHz AudioContext feeding the PCM worklet.
      const micCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = micCtx;
      await micCtx.audioWorklet.addModule("/worklets/pcm-recorder.js");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = stream;
      const source = micCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(micCtx, "pcm-recorder");
      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        sessionRef.current?.sendAudioChunk(e.data);
      };
      source.connect(worklet);
      workletNodeRef.current = worklet;
    } catch (err) {
      setStatus("error");
      setStatusLabel(err instanceof Error ? err.message : "Voice session failed to start.");
    }
  }, [flushPlayback, onFocus, playAudioChunk, stop]);

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
