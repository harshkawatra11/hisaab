// Grounds the agent's opening line in real ledger figures before it ever
// speaks, so the first thing a shopkeeper hears is never a guess. The
// voice session sends this back to the model as a system-style primer
// on connect, per systemPrompt.ts's rule that the model may only speak
// a number it got from a tool or a primer like this one, never one it
// invents.

import { NextResponse } from "next/server";
import { loadDashboardData } from "@/lib/dashboard/queries";

export async function GET() {
  const d = await loadDashboardData();
  const creditSalesToday = d.todayTxns.filter((t) => t.type === "credit_sale").length;

  return NextResponse.json({
    txnsToday: d.todayTxns.length,
    creditSalesToday,
    cashPositionPaise: d.kpis.cashPaise,
    bankPositionPaise: d.kpis.bankPaise,
    openExceptions: d.kpis.openExceptionsCount,
  });
}
