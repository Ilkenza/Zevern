/**
 * When a recurring rule actually falls due, and what one line of the timeline is.
 *
 * Kept apart from `@/lib/data/money` deliberately: this is arithmetic over dates and
 * nothing else — no Supabase client, no `next/headers`, no session. That matters
 * twice. The calendar feed runs it for an anonymous caller and must not drag a server
 * client in behind it, and every edge case here (the month-end trap, an instalment
 * plan running out mid-window, an end date landing between two occurrences) can be
 * put under test without a database.
 */

import { nextDate } from "@/lib/money";
import type { RecurringRow } from "@/lib/types";

/** One past booking of a rule — what an estimate is actually made of. */
export type Booking = { on: string; amount: number };

/**
 * What each line of the timeline is: a rule falling due, a one-off that was planned,
 * or the everyday spending nobody enters one by one. The first two are dated facts;
 * the third is a projection, and the screen has to be able to tell them apart.
 */
export type OccurrenceSource = "recurring" | "planned" | "everyday";

export type Occurrence = {
  /** The row this came from: a rule, a planned item, or the projection itself. */
  id: string;
  source: OccurrenceSource;
  name: string;
  /** "expense" or "income" — what the rule books. A goal rule books a saving. */
  kind: string;
  on: string;
  /** RSD. */
  amount: number;
  /** True when the amount is the average of past bookings rather than a set figure. */
  estimated: boolean;
  category: string | null;
  color: string | null;
  /** The goal this one feeds, when it is a standing order rather than a bill. */
  goal: string | null;
  /**
   * The bookings an estimate was averaged from, newest first — empty for anything
   * that is not an estimate. Carried down to the row so an average can be checked
   * against the readings behind it rather than taken on trust.
   */
  samples: Booking[];
  /** Everyday lines only: how many days of spending this one stands for. */
  days: number;
};

/** True when this rule puts money aside rather than paying a bill. */
export function feedsGoal(item: { goal_id: string | null }): boolean {
  return item.goal_id != null;
}

/** Weekly and yearly items normalised to a month so one number can be compared. */
export const PER_MONTH: Record<string, number> = { week: 52 / 12, month: 1, year: 1 / 12 };

/** Guard against a runaway walk if an item ever ends up with a nonsense date. */
const MAX_STEPS = 400;

/**
 * Every date a recurring item actually falls due between today and `horizon`,
 * respecting the instalments left and the end date. This is what makes a four-month
 * credit count four times in a yearly total instead of twelve.
 */
export function occurrencesFor(
  item: RecurringRow,
  amount: number,
  estimated: boolean,
  horizon: string,
  samples: Booking[] = [],
): Occurrence[] {
  if (!item.active) return [];

  const left =
    item.installments_total == null
      ? Infinity
      : Math.max(0, item.installments_total - (item.installments_done ?? 0));
  if (left === 0) return [];

  const out: Occurrence[] = [];
  let on = item.next_on;

  for (let step = 0; step < MAX_STEPS && out.length < left && on <= horizon; step++) {
    if (item.ends_on != null && on > item.ends_on) break;
    out.push({
      id: item.id,
      source: "recurring",
      name: item.name,
      kind: item.kind,
      on,
      amount,
      estimated,
      category: item.category?.name ?? null,
      // A goal rule has no category — its colour is the goal's, so it reads on the
      // timeline the same way it reads on the goals screen.
      color: item.goal?.color ?? item.category?.color ?? null,
      goal: item.goal?.name ?? null,
      samples,
      days: 0,
    });
    on = nextDate(on, item.every, item.anchor_day ?? null);
  }

  return out;
}

/** The middle of a list — the mean of the two middles when there is no single one. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** One day on from a plain date, in UTC — the walk the everyday line is spread over. */
export function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
