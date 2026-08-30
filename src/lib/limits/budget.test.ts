import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetBudgetForTests,
  canSpend,
  checkSessionDuration,
  estimateAudioTokens,
  HARD_CLOSE_MS,
  recordUsage,
  reconcileUsage,
  selectSessionRung,
  SOFT_WARNING_MS,
  tpmCeiling,
} from "./budget";
import { LIVE_MODEL_FALLBACK, LIVE_MODEL_PRIMARY, LIVE_MODEL_TRANSCRIBE_ONLY } from "@/lib/gemini/client";

beforeEach(() => {
  __resetBudgetForTests();
});

describe("tpmCeiling", () => {
  it("applies the 70% headroom factor to the real account TPM figures", () => {
    expect(tpmCeiling(LIVE_MODEL_PRIMARY)).toBe(105_000); // 150K * 0.7
    expect(tpmCeiling(LIVE_MODEL_FALLBACK)).toBe(700_000); // 1M * 0.7
  });
});

describe("canSpend / recordUsage", () => {
  it("allows spending under the ceiling", () => {
    expect(canSpend(LIVE_MODEL_PRIMARY, 50_000)).toBe(true);
  });

  it("refuses spending that would cross the ceiling in the current window", () => {
    recordUsage(LIVE_MODEL_PRIMARY, 100_000);
    expect(canSpend(LIVE_MODEL_PRIMARY, 10_000)).toBe(false); // 100K + 10K = 110K > 105K ceiling
  });

  it("blocks once cumulative usage in the window reaches the ceiling", () => {
    recordUsage(LIVE_MODEL_PRIMARY, 100_000);
    expect(canSpend(LIVE_MODEL_PRIMARY, 6_000)).toBe(false); // 106K > 105K
  });

  it("resets the window after 60 seconds", () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    recordUsage(LIVE_MODEL_PRIMARY, 100_000, t0);
    expect(canSpend(LIVE_MODEL_PRIMARY, 6_000, t0)).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(canSpend(LIVE_MODEL_PRIMARY, 6_000, Date.now())).toBe(true);
    vi.useRealTimers();
  });
});

describe("reconcileUsage", () => {
  it("overwrites the estimate with the real usageMetadata figure", () => {
    recordUsage(LIVE_MODEL_PRIMARY, 50_000);
    reconcileUsage(LIVE_MODEL_PRIMARY, 10_000); // server says actual usage is lower
    expect(canSpend(LIVE_MODEL_PRIMARY, 90_000)).toBe(true); // 10K + 90K = 100K < 105K
  });
});

describe("estimateAudioTokens", () => {
  it("estimates at 25 tokens per second", () => {
    expect(estimateAudioTokens(60)).toBe(1500);
    expect(estimateAudioTokens(1)).toBe(25);
  });
});

describe("selectSessionRung, the degradation ladder", () => {
  it("selects full_duplex when the primary model has budget", () => {
    const result = selectSessionRung(1000);
    expect(result.rung).toBe("full_duplex");
    expect(result.model).toBe(LIVE_MODEL_PRIMARY);
  });

  it("falls to fallback_duplex once the primary model's budget is exhausted", () => {
    recordUsage(LIVE_MODEL_PRIMARY, tpmCeiling(LIVE_MODEL_PRIMARY));
    const result = selectSessionRung(1000);
    expect(result.rung).toBe("fallback_duplex");
    expect(result.model).toBe(LIVE_MODEL_FALLBACK);
  });

  it("falls to transcribe_only once both dialog models are exhausted", () => {
    recordUsage(LIVE_MODEL_PRIMARY, tpmCeiling(LIVE_MODEL_PRIMARY));
    recordUsage(LIVE_MODEL_FALLBACK, tpmCeiling(LIVE_MODEL_FALLBACK));
    const result = selectSessionRung(1000);
    expect(result.rung).toBe("transcribe_only");
    expect(result.model).toBe(LIVE_MODEL_TRANSCRIBE_ONLY);
  });

  it("falls all the way to typed when every voice model is exhausted, and never throws", () => {
    recordUsage(LIVE_MODEL_PRIMARY, tpmCeiling(LIVE_MODEL_PRIMARY));
    recordUsage(LIVE_MODEL_FALLBACK, tpmCeiling(LIVE_MODEL_FALLBACK));
    recordUsage(LIVE_MODEL_TRANSCRIBE_ONLY, tpmCeiling(LIVE_MODEL_TRANSCRIBE_ONLY));
    const result = selectSessionRung(1000);
    expect(result.rung).toBe("typed");
    expect(result.model).toBeNull();
  });

  it("carries a human-readable status label for every rung", () => {
    expect(selectSessionRung(100).statusLabel).toContain("voice");
  });
});

describe("checkSessionDuration, the primary defense against a long session burning TPM", () => {
  it("does not warn or close early in a session", () => {
    const state = checkSessionDuration(0, 60_000);
    expect(state.shouldWarn).toBe(false);
    expect(state.shouldClose).toBe(false);
  });

  it("warns at the 6 minute mark", () => {
    const state = checkSessionDuration(0, SOFT_WARNING_MS);
    expect(state.shouldWarn).toBe(true);
    expect(state.shouldClose).toBe(false);
  });

  it("closes at the 8 minute hard cap", () => {
    const state = checkSessionDuration(0, HARD_CLOSE_MS);
    expect(state.shouldClose).toBe(true);
  });
});
