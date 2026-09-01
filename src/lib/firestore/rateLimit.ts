// A deliberately simple backstop, not the primary cost control. The
// primary controls are the Firestore free-tier ceiling itself and a GCP
// billing budget alert. This module stops a bug, a retry storm, or a
// scripted loop from burning quota in-process before a human notices a
// billing email. It matters more here than in a typical CRUD app
// because one spoken sentence can post several transactions at once
// through record_business_events, each a handful of writes.
//
// Fixed-window counter held in memory: resets on cold start, per
// instance, not global. Accepted limitation for a hackathon prototype.

const WRITE_LIMIT = 30;
const WINDOW_MS = 60_000;

let windowStart = Date.now();
let writesInWindow = 0;

export class RateLimitExceededError extends Error {
  constructor() {
    super(
      "Too many write operations in a short period. This is a safety limit to keep Firestore usage inside its free tier, not a sign anything is wrong with your data. Wait a minute and try again."
    );
    this.name = "RateLimitExceededError";
  }
}

export function assertWriteAllowed(count = 1): void {
  // The seed script sets HISAAB_SEED=true to legitimately write a large
  // synthetic dataset in one go. The rate limiter guards interactive
  // voice-agent writes, not intentional bulk loads.
  if (process.env.HISAAB_SEED === "true") return;
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    writesInWindow = 0;
  }
  writesInWindow += count;
  if (writesInWindow > WRITE_LIMIT) {
    throw new RateLimitExceededError();
  }
}

/** Test-only: forces the window to reset immediately. */
export function __resetRateLimitForTests(): void {
  windowStart = Date.now();
  writesInWindow = 0;
}
