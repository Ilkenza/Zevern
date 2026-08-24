import type { MoneyRecurring } from "@/lib/types";

/**
 * One screen, two views. Both are real URLs, so each is shareable, the back button
 * moves between them, and a link can point straight at the register.
 */
export const TIMELINE_HREF = "/private/upcoming";
export const RULES_HREF = "/private/upcoming?view=rules";
export const NEW_RULE_HREF = `${RULES_HREF}&new=1`;

export type UpcomingViewKey = "timeline" | "rules";

/** The slide-over is the same form either way: create a rule, or edit one. */
export type UpcomingPanel = { mode: "new" } | { mode: "edit"; item: MoneyRecurring } | null;

const MS_DAY = 86_400_000;

/**
 * Whole days between two plain dates, read in UTC on both sides so the answer never
 * depends on which side of the wire it was worked out — same reading Goals uses.
 */
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / MS_DAY);
}

export function addDays(from: string, days: number): string {
  const d = new Date(`${from.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return from;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** How far off a date is, in the words a person would use. */
export function whenLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "1 day overdue";
  return days > 0 ? `in ${days} days` : `${-days} days overdue`;
}

/**
 * A rule counts towards the totals — and turns up on the timeline — only while it is
 * active, has instalments left and has not run past its end date. Same three tests
 * `getRecurringTotals` applies, so the list and the figures never disagree.
 */
export function isRunning(item: {
  active: boolean;
  next_on: string;
  ends_on: string | null;
  installments_total: number | null;
  installments_done: number | null;
}): boolean {
  const total = item.installments_total;
  const done = item.installments_done ?? 0;
  if (total != null && done >= total) return false;
  if (item.ends_on != null && item.next_on > item.ends_on) return false;
  return item.active;
}
