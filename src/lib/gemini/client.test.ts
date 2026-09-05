import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock } = vi.hoisted(() => ({ generateContentMock: vi.fn() }));

vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    models = { generateContent: generateContentMock };
  }
  return { GoogleGenAI: MockGoogleGenAI, ThinkingLevel: { LOW: "LOW" } };
});

describe("generateWithFallback", () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;

  beforeEach(async () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
    generateContentMock.mockReset();
    const mod = await import("./client");
    mod.__resetGeminiClientForTests();
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalKey;
    if (originalModel) process.env.GEMINI_MODEL = originalModel;
    else delete process.env.GEMINI_MODEL;
  });

  it("returns the first model's response when it succeeds", async () => {
    generateContentMock.mockResolvedValueOnce({ text: "hello" });
    const { generateWithFallback, getTextModelChain } = await import("./client");
    const result = await generateWithFallback([{ role: "user", parts: [{ text: "hi" }] }]);
    expect(result.model).toBe(getTextModelChain()[0]);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the second model when the first throws", async () => {
    generateContentMock.mockRejectedValueOnce(new Error("model retired")).mockResolvedValueOnce({ text: "ok" });
    const { generateWithFallback, getTextModelChain } = await import("./client");
    const result = await generateWithFallback([{ role: "user", parts: [{ text: "hi" }] }]);
    expect(result.model).toBe(getTextModelChain()[1]);
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it("falls back on an empty response, not just a thrown error", async () => {
    generateContentMock.mockResolvedValueOnce({ text: "" }).mockResolvedValueOnce({ text: "ok" });
    const { generateWithFallback } = await import("./client");
    const result = await generateWithFallback([{ role: "user", parts: [{ text: "hi" }] }]);
    expect(result.response.text).toBe("ok");
  });

  it("throws GeminiAllModelsFailedError when every model in the chain fails", async () => {
    generateContentMock.mockRejectedValue(new Error("down"));
    const { generateWithFallback, GeminiAllModelsFailedError } = await import("./client");
    await expect(generateWithFallback([{ role: "user", parts: [{ text: "hi" }] }])).rejects.toThrow(
      GeminiAllModelsFailedError
    );
  });

  it("tries an explicit GEMINI_MODEL override first, ahead of the built-in chain", async () => {
    process.env.GEMINI_MODEL = "gemini-custom-override";
    generateContentMock.mockResolvedValueOnce({ text: "custom" });
    const { generateWithFallback } = await import("./client");
    const result = await generateWithFallback([{ role: "user", parts: [{ text: "hi" }] }]);
    expect(result.model).toBe("gemini-custom-override");
  });

  it("throws GeminiNotConfiguredError when no API key is set", async () => {
    delete process.env.GEMINI_API_KEY;
    const { generateWithFallback, GeminiNotConfiguredError } = await import("./client");
    await expect(generateWithFallback([{ role: "user", parts: [{ text: "hi" }] }])).rejects.toThrow(
      GeminiNotConfiguredError
    );
  });

  describe("OpenRouter fallback tier", () => {
    const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      process.env.OPENROUTER_API_KEY = "or-test-key";
      fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
      if (originalOpenRouterKey) process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
      else delete process.env.OPENROUTER_API_KEY;
      vi.unstubAllGlobals();
    });

    it("only fires after every Gemini model has already failed", async () => {
      generateContentMock.mockRejectedValue(new Error("all Gemini models down"));
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "fallback reply" } }] }),
      });

      const { generateWithFallback } = await import("./client");
      const result = await generateWithFallback([{ role: "user", parts: [{ text: "hi" }] }]);

      expect(generateContentMock).toHaveBeenCalledTimes(2); // both Gemini chain entries tried first
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.response.text).toBe("fallback reply");
      expect(result.model).toContain("nemotron");
    });

    it("converts a tool call in the OpenRouter response back to Gemini's functionCalls shape", async () => {
      generateContentMock.mockRejectedValue(new Error("down"));
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                tool_calls: [
                  { function: { name: "get_cash_position", arguments: "{}" } },
                ],
              },
            },
          ],
        }),
      });

      const { generateWithFallback } = await import("./client");
      const result = await generateWithFallback([{ role: "user", parts: [{ text: "hi" }] }], {
        tools: [
          {
            functionDeclarations: [
              { name: "get_cash_position", description: "d", parameters: { type: "OBJECT", properties: {} } },
            ] as never,
          },
        ],
      });

      expect(result.response.functionCalls?.[0]?.name).toBe("get_cash_position");
    });

    it("does not attempt OpenRouter at all when no key is configured", async () => {
      delete process.env.OPENROUTER_API_KEY;
      generateContentMock.mockRejectedValue(new Error("down"));
      const { generateWithFallback, GeminiAllModelsFailedError } = await import("./client");
      await expect(generateWithFallback([{ role: "user", parts: [{ text: "hi" }] }])).rejects.toThrow(
        GeminiAllModelsFailedError
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
