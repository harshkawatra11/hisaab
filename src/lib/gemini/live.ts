// Client-side wrapper around the Gemini Live API. Runs only in the
// browser: fetches a one-time ephemeral token from /api/voice/token
// (the standing GEMINI_API_KEY never reaches this file), opens a
// session with the resolved model, and routes tool calls to
// /api/agent/tool so the ledger is only ever touched server-side.

import { GoogleGenAI, Modality } from "@google/genai";
import { SYSTEM_PROMPT } from "@/lib/agent/systemPrompt";
import { TOOL_DECLARATIONS } from "@/lib/agent/dispatch";
import type { SessionRung } from "@/lib/limits/budget";

export interface TokenResponse {
  rung: SessionRung;
  model: string | null;
  statusLabel: string;
  token?: string;
  reason?: string;
}

export async function fetchVoiceToken(): Promise<TokenResponse> {
  const res = await fetch("/api/voice/token", { method: "POST" });
  return res.json();
}

export interface LiveSessionHandlers {
  onInputTranscript: (text: string, isFinal: boolean) => void;
  onOutputTranscript: (text: string, isFinal: boolean) => void;
  onAudioChunk: (base64Pcm24k: string) => void;
  onInterrupted: () => void;
  onToolCall: (name: string, args: unknown) => Promise<unknown>;
  onToolTrace: (name: string, args: unknown, result: unknown) => void;
  onClose: (reason?: string) => void;
  onError: (message: string) => void;
}

export interface LiveSessionHandle {
  sendAudioChunk: (pcm16: ArrayBuffer) => void;
  sendText: (text: string) => void;
  close: () => void;
}

/** Opens a Live session using a freshly minted ephemeral token. Throws
 *  if the token endpoint returns the "typed" rung: the caller is
 *  expected to check the rung before calling this, and fall back to
 *  the text chat path rather than opening a session that cannot work. */
export async function openLiveSession(
  tokenResponse: TokenResponse,
  handlers: LiveSessionHandlers
): Promise<LiveSessionHandle> {
  if (!tokenResponse.token || !tokenResponse.model) {
    throw new Error(tokenResponse.reason ?? "No voice session available at this quota level.");
  }

  // Ephemeral-token auth is only fully supported on the v1alpha surface.
  // Without this, the SDK connects on v1beta by default, the socket opens
  // and then closes immediately with no error surfaced anywhere, since the
  // server-side rejection happens after the handshake, not during it.
  const ai = new GoogleGenAI({ apiKey: tokenResponse.token, httpOptions: { apiVersion: "v1alpha" } });

  const session = await ai.live.connect({
    model: tokenResponse.model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS as never }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} } as never,
    },
    callbacks: {
      onopen: () => {},
      onmessage: async (message) => {
        if (message.serverContent?.interrupted) {
          handlers.onInterrupted();
        }
        const inputT = message.serverContent?.inputTranscription;
        if (inputT?.text) handlers.onInputTranscript(inputT.text, false);
        const outputT = message.serverContent?.outputTranscription;
        if (outputT?.text) handlers.onOutputTranscript(outputT.text, false);

        const parts = message.serverContent?.modelTurn?.parts ?? [];
        for (const part of parts) {
          const inlineData = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
          if (inlineData?.data && inlineData.mimeType?.startsWith("audio/")) {
            handlers.onAudioChunk(inlineData.data);
          }
        }

        const toolCall = message.toolCall;
        if (toolCall?.functionCalls?.length) {
          const responses = [];
          for (const call of toolCall.functionCalls) {
            const result = await handlers.onToolCall(call.name ?? "", call.args ?? {});
            handlers.onToolTrace(call.name ?? "", call.args, result);
            responses.push({ id: call.id, name: call.name, response: { result } });
          }
          session.sendToolResponse({ functionResponses: responses });
        }
      },
      onerror: (e: ErrorEvent) => handlers.onError(e.message ?? "Live session error."),
      onclose: (e: CloseEvent) => handlers.onClose(e.reason),
    },
  });

  return {
    sendAudioChunk(pcm16: ArrayBuffer) {
      const bytes = new Uint8Array(pcm16);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      session.sendRealtimeInput({ audio: { data: base64, mimeType: "audio/pcm;rate=16000" } });
    },
    sendText(text: string) {
      session.sendClientContent({ turns: text, turnComplete: true });
    },
    close() {
      session.close();
    },
  };
}
