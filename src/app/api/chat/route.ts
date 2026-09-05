// The text chat fallback. Same tools, same system prompt, same
// dispatch boundary as the voice path: this is the bottom rung of the
// degradation ladder, so it has to work well on its own, not just as a
// stub. Runs a standard function-calling loop: send the conversation,
// execute any tool calls the model returns, send the results back,
// repeat until the model returns text instead of another tool call.

import { NextResponse } from "next/server";
import { GeminiNotConfiguredError, generateWithFallback, isGeminiConfigured } from "@/lib/gemini/client";
import { dispatchTool } from "@/lib/agent/dispatch";
import { TOOL_DECLARATIONS } from "@/lib/agent/dispatch";
import { SYSTEM_PROMPT } from "@/lib/agent/systemPrompt";
import { getStore } from "@/lib/store";
import { DEMO_OWNER_UID } from "@/lib/owner";

interface ChatMessage {
  role: "user" | "model";
  text: string;
}

const MAX_TOOL_ROUNDS = 6;

export async function POST(req: Request) {
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: new GeminiNotConfiguredError().message },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];
  const message: string = typeof body?.message === "string" ? body.message : "";
  if (!message.trim()) {
    return NextResponse.json({ error: "Expected a non-empty message." }, { status: 400 });
  }

  const ctx = { store: getStore(), ownerUid: DEMO_OWNER_UID };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = [
    ...history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  const toolTrace: { name: string; args: unknown; result: unknown }[] = [];

  // dispatchTool already catches every tool-level failure and returns
  // { ok: false, ... } rather than throwing, so the one exception that
  // can reach here uncaught is generateWithFallback's own
  // GeminiAllModelsFailedError, when every Gemini model and the
  // OpenRouter last-resort tier all fail in the same request. Without
  // this try/catch that crashes the route handler with no JSON body at
  // all, and the client's res.json() call then throws a raw, unhelpful
  // browser exception instead of a clean error message.
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { response } = await generateWithFallback(contents, {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS as never }],
      });

      const calls = response.functionCalls ?? [];
      if (calls.length === 0) {
        return NextResponse.json({ reply: response.text ?? "", toolTrace });
      }

      contents.push({
        role: "model",
        parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
      });

      const responseParts = [];
      for (const call of calls) {
        const result = await dispatchTool(ctx, call.name ?? "", call.args ?? {});
        toolTrace.push({ name: call.name ?? "", args: call.args, result });
        responseParts.push({
          functionResponse: { name: call.name, response: { result } },
        });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    return NextResponse.json(
      { error: "Too many tool-call rounds without a final answer.", toolTrace },
      { status: 500 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, toolTrace }, { status: 502 });
  }
}
