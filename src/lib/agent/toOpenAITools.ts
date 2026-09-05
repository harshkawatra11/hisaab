// Converts the app's Gemini-native TOOL_DECLARATIONS (uppercase JSON Schema
// types: "OBJECT", "STRING", "ARRAY", "NUMBER") into the OpenAI-compatible
// tool shape OpenRouter expects. Used in exactly one place: the last-resort
// OpenRouter fallback in src/lib/gemini/client.ts, when every Gemini text
// model has failed. There is deliberately no fork of TOOL_DECLARATIONS
// itself, only a runtime transform, so a tool added later cannot drift
// between the two providers' schemas.

interface GeminiSchema {
  type?: string;
  description?: string;
  enum?: string[];
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  [key: string]: unknown;
}

interface GeminiToolDeclaration {
  name: string;
  description: string;
  parameters?: GeminiSchema;
}

export interface OpenAIToolDeclaration {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function lowercaseSchema(schema: GeminiSchema | undefined): Record<string, unknown> {
  if (!schema) return { type: "object", properties: {} };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") {
      out.type = value.toLowerCase();
    } else if (key === "properties" && value && typeof value === "object") {
      const props: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value as Record<string, GeminiSchema>)) {
        props[propName] = lowercaseSchema(propSchema);
      }
      out.properties = props;
    } else if (key === "items" && value) {
      out.items = lowercaseSchema(value as GeminiSchema);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function toOpenAITools(declarations: GeminiToolDeclaration[]): OpenAIToolDeclaration[] {
  return declarations.map((d) => ({
    type: "function",
    function: {
      name: d.name,
      description: d.description,
      parameters: lowercaseSchema(d.parameters),
    },
  }));
}
