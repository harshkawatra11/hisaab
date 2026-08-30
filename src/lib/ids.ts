import { nanoid } from "nanoid";

export type IdPrefix = "txn" | "ext" | "mch" | "exc" | "pty" | "prd" | "run" | "led";

export function makeId(prefix: IdPrefix): string {
  return `${prefix}_${nanoid(12)}`;
}

/** Today's calendar day in IST, yyyy-MM-dd. Every transaction date in
 *  this domain is a calendar day, not a timestamp, since reconciliation
 *  reasons about "which day" rather than "which instant". */
export function todayIST(): string {
  return istDateString(new Date());
}

export function istDateString(date: Date): string {
  // IST is UTC+5:30, no DST. Shift, then read UTC fields to avoid
  // relying on the host machine's local timezone.
  const shifted = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return istDateString(d);
}
