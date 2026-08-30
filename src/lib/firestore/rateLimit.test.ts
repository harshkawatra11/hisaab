import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertWriteAllowed, RateLimitExceededError, __resetRateLimitForTests } from "./rateLimit";

describe("assertWriteAllowed", () => {
  beforeEach(() => {
    vi.useRealTimers();
    __resetRateLimitForTests();
  });

  it("allows writes under the limit", () => {
    for (let i = 0; i < 30; i++) {
      expect(() => assertWriteAllowed()).not.toThrow();
    }
  });

  it("refuses the 31st write in the same window", () => {
    for (let i = 0; i < 30; i++) assertWriteAllowed();
    expect(() => assertWriteAllowed()).toThrow(RateLimitExceededError);
  });

  it("accounts for multi-write batches, refusing once the batch crosses the ceiling", () => {
    assertWriteAllowed(25);
    expect(() => assertWriteAllowed(6)).toThrow(RateLimitExceededError);
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    __resetRateLimitForTests();
    for (let i = 0; i < 30; i++) assertWriteAllowed();
    expect(() => assertWriteAllowed()).toThrow(RateLimitExceededError);
    vi.advanceTimersByTime(61_000);
    expect(() => assertWriteAllowed()).not.toThrow();
    vi.useRealTimers();
  });
});
