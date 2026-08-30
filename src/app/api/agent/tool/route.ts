// Executes exactly one tool call against the deterministic engine.
// Called from the Live session's toolCall handler (server-side, so the
// browser never touches the ledger directly) and from the text chat
// route. This is the single boundary where a model-chosen tool name
// and model-supplied arguments turn into a real store mutation or read.

import { NextResponse } from "next/server";
import { dispatchTool } from "@/lib/agent/dispatch";
import { getStore } from "@/lib/store";
import { DEMO_OWNER_UID } from "@/lib/owner";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string") {
    return NextResponse.json({ ok: false, error: "Expected { name, args }." }, { status: 400 });
  }

  const result = await dispatchTool(
    { store: getStore(), ownerUid: DEMO_OWNER_UID },
    body.name,
    body.args ?? {}
  );

  return NextResponse.json(result);
}
