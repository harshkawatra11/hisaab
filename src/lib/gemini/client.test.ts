import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock } = vi.hoisted(() => ({ generateContentMock: vi.fn() }));

vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    models = { generateContent: generateContentMock };
  }
  return { GoogleGenAI: MockGoogleGenAI };
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
});
