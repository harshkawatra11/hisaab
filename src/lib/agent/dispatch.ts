// Maps a tool name to its schema and handler, and exposes the Gemini
// function-declaration shapes both the Live session and the text chat
// route hand to the model. dispatchTool is the one place a malformed
// or unresolved tool call gets turned into a typed failure result
// instead of an uncaught throw, since this sits on the boundary that a
// live voice session must never crash.

import {
  explainMatch,
  explainMatchSchema,
  focusDashboard,
  focusDashboardSchema,
  forecastCash,
  getCashPosition,
  getPartyBalance,
  getPartyBalanceSchema,
  getPnl,
  getPnlSchema,
  listExceptions,
  listExceptionsSchema,
  recordBusinessEvents,
  type ToolContext,
  type ToolResult,
} from "@/lib/agent/tools";

export type ToolName =
  | "record_business_events"
  | "get_party_balance"
  | "get_cash_position"
  | "forecast_cash"
  | "list_exceptions"
  | "explain_match"
  | "get_pnl"
  | "focus_dashboard";

export async function dispatchTool(ctx: ToolContext, name: string, args: unknown): Promise<ToolResult> {
  try {
    switch (name as ToolName) {
      case "record_business_events":
        return await recordBusinessEvents(ctx, args as never);
      case "get_party_balance":
        return await getPartyBalance(ctx, getPartyBalanceSchema.parse(args));
      case "get_cash_position":
        return await getCashPosition(ctx);
      case "forecast_cash":
        return await forecastCash(ctx, args as never);
      case "list_exceptions":
        return await listExceptions(ctx, listExceptionsSchema.parse(args));
      case "explain_match":
        return await explainMatch(ctx, explainMatchSchema.parse(args));
      case "get_pnl":
        return await getPnl(ctx, getPnlSchema.parse(args));
      case "focus_dashboard":
        return await focusDashboard(ctx, focusDashboardSchema.parse(args));
      default:
        return { ok: false, error: `Unknown tool: ${name}`, spokenSummary: `I don't have a tool called ${name}.` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, spokenSummary: message };
  }
}

// Gemini function-declaration shapes (OpenAPI-subset schema), shared by
// the Live session config and the text-chat generateContent config.
export const TOOL_DECLARATIONS = [
  {
    name: "record_business_events",
    description:
      "Records one or more business events from a single spoken or typed sentence: inventory purchases, cash or credit sales, payments received or made, or expenses. Call once with every event described, not once per event.",
    parameters: {
      type: "OBJECT",
      properties: {
        events: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              type: {
                type: "STRING",
                enum: ["inventory_purchase", "cash_sale", "credit_sale", "payment_received", "payment_made", "expense"],
              },
              supplierName: { type: "STRING", description: "For inventory_purchase" },
              customerName: { type: "STRING", description: "For credit_sale" },
              partyName: { type: "STRING", description: "For payment_received or payment_made" },
              items: {
                type: "ARRAY",
                description: "For inventory_purchase, cash_sale, credit_sale",
                items: {
                  type: "OBJECT",
                  properties: {
                    productName: { type: "STRING" },
                    qty: { type: "STRING", description: "A number, or a spoken Indian quantity word like dhai, sava, derh" },
                  },
                  required: ["productName", "qty"],
                },
              },
              amountPaise: { type: "NUMBER", description: "For payment_received, payment_made, expense. Amount in paise (rupees x 100)." },
              paymentMethod: { type: "STRING", enum: ["credit", "cash"] },
              method: { type: "STRING", enum: ["cash", "bank"] },
              note: { type: "STRING" },
            },
            required: ["type"],
          },
        },
        date: { type: "STRING", description: "yyyy-MM-dd, defaults to today" },
      },
      required: ["events"],
    },
  },
  {
    name: "get_party_balance",
    description: "Gets a customer's or supplier's outstanding balance, aging, and recent items.",
    parameters: {
      type: "OBJECT",
      properties: { partyName: { type: "STRING" } },
      required: ["partyName"],
    },
  },
  {
    name: "get_cash_position",
    description: "Gets current cash, bank, receivables and payables.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "forecast_cash",
    description: "Projects cash position forward using detected recurring purchase patterns and each party's own payment history.",
    parameters: {
      type: "OBJECT",
      properties: { horizonDays: { type: "NUMBER", description: "Defaults to 14" } },
    },
  },
  {
    name: "list_exceptions",
    description: "Lists open reconciliation exceptions, optionally filtered by kind.",
    parameters: {
      type: "OBJECT",
      properties: { kind: { type: "STRING" } },
    },
  },
  {
    name: "explain_match",
    description: "Explains why a transaction did or did not match, with the underlying similarity signals.",
    parameters: {
      type: "OBJECT",
      properties: { transactionId: { type: "STRING" } },
      required: ["transactionId"],
    },
  },
  {
    name: "get_pnl",
    description: "Computes revenue, COGS, gross margin, expenses and GST for a date range.",
    parameters: {
      type: "OBJECT",
      properties: {
        fromDate: { type: "STRING", description: "yyyy-MM-dd" },
        toDate: { type: "STRING", description: "yyyy-MM-dd" },
      },
      required: ["fromDate", "toDate"],
    },
  },
  {
    name: "focus_dashboard",
    description: "Opens a specific dashboard view on screen, optionally focused on one entity, while you keep speaking.",
    parameters: {
      type: "OBJECT",
      properties: {
        view: { type: "STRING", enum: ["control", "reconcile", "khata", "books"] },
        entityId: { type: "STRING" },
      },
      required: ["view"],
    },
  },
] as const;
