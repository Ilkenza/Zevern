import type { ForecastLine } from "@/lib/data/money";
import type { MoneyRecurring, PlannedRow } from "@/lib/types";

/**
 * One screen, two views. Both are real URLs, so each is shareable, the back button
 * moves between them, and a link can point straight at the register.
 */
export const TIMELINE_HREF = "/private/upcoming";
export const RULES_HREF = "/private/upcoming?view=rules";
export const NEW_RULE_HREF = `${RULES_HREF}&new=1`;

/** A planned one-off belongs to the timeline, so its form opens over the timeline. */
export const NEW_PLAN_HREF = `${TIMELINE_HREF}?plan=new`;
export const planHref = (id: string) => `${TIMELINE_HREF}?plan=${id}`;

export type UpcomingViewKey = "timeline" | "rules";

/** The slide-over is the same form either way: create a rule, or edit one. */
export type UpcomingPanel = { mode: "new" } | { mode: "edit"; item: MoneyRecurring } | null;

/** The same again for a one-off: plan something new, or change one already planned. */
export type PlanPanel = { mode: "new" } | { mode: "edit"; item: PlannedRow } | null;

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
/**
 * Something that can be moved to change the day the money runs out, and by how much.
 *
 * `after` is not a guess: moving a planned item past the shortfall date takes exactly
 * its amount off what falls due before then, and moving a rule's next date past it
 * takes off every occurrence of that rule that was landing before then — the later
 * dates are all worked out from the next one, so they move with it.
 */
export type Lever = {
  key: string;
  source: "planned" | "recurring";
  id: string;
  name: string;
  /** Which way this one helps: hold a payment back, or bring money in sooner. */
  direction: "later" | "earlier";
  /** RSD the move is worth on the shortfall date. */
  worth: number;
  /** How many dates of this rule move out of the way. Always 1 for a planned item. */
  hits: number;
  /** The date the move has to reach. */
  target: string;
  /** What the balance on the shortfall date becomes. */
  after: number;
  clears: boolean;
  /** Set when this one is a standing order into a goal rather than a bill. */
  goal: string | null;
};

/** As many levers as are worth reading before the card turns into a list. */
const MAX_LEVERS = 6;

/**
 * The moves that would actually change the outcome, worked out from the same lines the
 * shortfall was found in.
 *
 * Only two kinds qualify. Something that falls due on or before the shortfall and can
 * be held back until after it, and money that arrives after the shortfall and could be
 * brought forward. Everything else — everyday spending, anything already past, a bill
 * that lands after the day in question — would move without changing the answer, so it
 * is not offered.
 */
export function shortfallLevers(lines: ForecastLine[], index: number, from: string): Lever[] {
  const shortfall = lines[index];
  if (!shortfall) return [];

  const on = shortfall.on;
  const balance = shortfall.balance;
  const push = addDays(on, 1);
  // Bringing money in has to land before the day it is needed. When that day is today
  // there is no earlier date left, so today is the best it can do.
  const pull = addDays(on, -1) >= from ? addDays(on, -1) : from;

  const held = new Map<string, Lever>();

  for (let i = 0; i <= index; i++) {
    const line = lines[i];
    if (line.source === "everyday" || line.kind === "income") continue;

    const key = `${line.source}:${line.id}`;
    const seen = held.get(key);
    if (seen) {
      seen.worth += line.amount;
      seen.hits += 1;
      seen.after = balance + seen.worth;
      seen.clears = seen.after >= 0;
      continue;
    }
    held.set(key, {
      key,
      source: line.source,
      id: line.id,
      name: line.name,
      direction: "later",
      worth: line.amount,
      hits: 1,
      target: push,
      after: balance + line.amount,
      clears: balance + line.amount >= 0,
      goal: line.goal,
    });
  }

  for (let i = index + 1; i < lines.length; i++) {
    const line = lines[i];
    // Only a one-off can be pulled forward with a single date: a rule's earlier dates
    // are behind it, and moving the next one back would rewrite the whole run.
    if (line.source !== "planned" || line.kind !== "income") continue;
    const key = `planned:${line.id}`;
    if (held.has(key)) continue;
    held.set(key, {
      key,
      source: "planned",
      id: line.id,
      name: line.name,
      direction: "earlier",
      worth: line.amount,
      hits: 1,
      target: pull,
      after: balance + line.amount,
      clears: balance + line.amount >= 0,
      goal: null,
    });
  }

  return [...held.values()]
    .filter((lever) => lever.worth > 0)
    .sort((a, b) => Number(b.clears) - Number(a.clears) || b.worth - a.worth)
    .slice(0, MAX_LEVERS);
}

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
