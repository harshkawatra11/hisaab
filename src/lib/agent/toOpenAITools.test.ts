import { describe, expect, it } from "vitest";
import { TOOL_DECLARATIONS } from "@/lib/agent/dispatch";
import { toOpenAITools } from "@/lib/agent/toOpenAITools";

describe("toOpenAITools", () => {
  it("converts every declared tool", () => {
    const converted = toOpenAITools(TOOL_DECLARATIONS as never);
    expect(converted).toHaveLength(TOOL_DECLARATIONS.length);
    for (const t of converted) {
      expect(t.type).toBe("function");
      expect(typeof t.function.name).toBe("string");
      expect(typeof t.function.description).toBe("string");
    }
  });

  it("lowercases every type recursively, including nested array items", () => {
    const converted = toOpenAITools(TOOL_DECLARATIONS as never);
    const recordEvents = converted.find((t) => t.function.name === "record_business_events");
    expect(recordEvents).toBeDefined();
    const params = recordEvents!.function.parameters as {
      type: string;
      properties: { events: { type: string; items: { type: string; properties: Record<string, unknown> } } };
    };
    expect(params.type).toBe("object");
    expect(params.properties.events.type).toBe("array");
    expect(params.properties.events.items.type).toBe("object");
  });

  it("preserves a nested string-typed property (qty) through the conversion", () => {
    const converted = toOpenAITools(TOOL_DECLARATIONS as never);
    const recordEvents = converted.find((t) => t.function.name === "record_business_events");
    const params = recordEvents!.function.parameters as {
      properties: {
        events: {
          items: {
            properties: {
              items: { items: { properties: { qty: { type: string } } } };
            };
          };
        };
      };
    };
    const qtySchema = params.properties.events.items.properties.items.items.properties.qty;
    expect(qtySchema.type).toBe("string");
  });
});
