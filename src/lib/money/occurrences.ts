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
  /** The debt this one pays down, when it is an instalment rather than a bill. */
  loan: string | null;
  /**
   * The bookings an estimate was averaged from, newest first — empty for anything
   * that is not an estimate. Carried down to the row so an average can be checked
   * against the readings behind it rather than taken on trust.
   */
  samples: Booking[];
  /** Everyday lines only: how many days of spending this one stands for. */
  days: number;
};

/**
 * The money a goal-ending rule may still book, or `undefined` for every other rule.
 *
 * Separated from `occurrencesFor` because that function has no database in it and is
 * tested without one: the caller looks the figure up, this decides whether it applies.
 * A rule pointing at a goal that no longer exists caps at zero rather than running
 * forever — the safer of the two wrong answers.
 */
export function goalCapFor(
  item: { ends_when?: string | null; goal_id: string | null },
  remaining: Map<string, number>,
): number | undefined {
  if (item.ends_when !== "goal") return undefined;
  if (!item.goal_id) return 0;
  return remaining.get(item.goal_id) ?? 0;
}

/**
 * The money an instalment plan may still book: what is left on the debt it pays.
 *
 * A goal-ending rule had this and a debt-paying rule did not, which made the countdown
 * on a debt the one figure in this app that was arithmetic on a counter rather than on
 * the ledger. Pay 35.000 one month against a 30.776,48 rate and the counter still says
 * three payments left — three payments that now come to more than is owed, and a last
 * booking that overpays a settled debt.
 *
 * Every rule carrying a `loan_id` is capped, whatever its `ends_when` says. A debt is
 * finished when it is paid, and that is true of the rule that pays it whether or not
 * somebody also wrote down how many payments they expected it to take.
 *
 * A rule pointing at a debt that no longer exists caps at zero rather than running
 * forever — the safer of the two wrong answers, the same choice `goalCapFor` makes.
 */
export function loanCapFor(
  item: { loan_id?: string | null },
  remaining: Map<string, number>,
): number | undefined {
  if (!item.loan_id) return undefined;
  return remaining.get(item.loan_id) ?? 0;
}

/**
 * The one cap that applies, whichever it is.
 *
 * A rule is never both a standing order into a goal and the instalment plan of a debt —
 * `saveRecurring` clears the debt the moment a goal is chosen — so at most one of these
 * answers is a number and taking the smaller of the two is a decision that never has to
 * be made.
 */
export function capFor(
  item: { ends_when?: string | null; goal_id: string | null; loan_id?: string | null },
  goalRoom: Map<string, number>,
  loanRoom: Map<string, number>,
): number | undefined {
  return goalCapFor(item, goalRoom) ?? loanCapFor(item, loanRoom);
}

/** True when this rule puts money aside rather than paying a bill. */
export function feedsGoal(item: { goal_id: string | null }): boolean {
  return item.goal_id != null;
}

/** Weekly and yearly items normalised to a month so one number can be compared. */
export const PER_MONTH: Record<string, number> = {
  day: 365.25 / 12,
  week: 52 / 12,
  month: 1,
  year: 1 / 12,
};

/**
 * How many times a month a rule fires, cadence included.
 *
 * A count divides: every two weeks is half as often as every week, every three months a
 * third as often as monthly. Without this, a quarterly insurance bill of 30.000 was
 * being counted as 30.000 a month in every "what do the standing charges cost" figure
 * on the app — four times its real weight, in the one number people set budgets from.
 */
export function perMonth(every: string, count: number | null | undefined): number {
  const base = PER_MONTH[every] ?? 1;
  return base / Math.max(1, Math.floor(count ?? 1) || 1);
}

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
  /**
   * Money this rule may still book before it stops — what is left to fill on the goal
   * it feeds, for a rule that ends when that goal is full.
   *
   * Passed in rather than read here because this file has no database in it and is
   * tested without one. `undefined` means no cap, which is every other kind of rule.
   */
  cap?: number,
): Occurrence[] {
  if (!item.active) return [];

  /*
    The counter, and the one thing that outranks it.

    `installments_total` is a plan: four payments, written down when the plan was made.
    A cap is a fact read off the ledger — what is actually left to pay — and when there
    is one it is the authority, because the plan can be wrong in both directions and the
    fact cannot.

    Pay more than the rate one month and the plan is too long: three payments left that
    come to more than is owed, the last of them overpaying a debt already settled. Pay
    less and it is too short: the counter runs out with money still owed and switches off
    the rule that was paying it, which is the worse of the two — a debt quietly left open
    with nothing pointing at it any more.

    This costs a goal rule nothing. `saveRecurring` clears the columns that do not belong
    to the chosen end condition, so a rule that stops when its goal is full carries no
    count to begin with.
  */
  const left =
    cap != null || item.installments_total == null
      ? Infinity
      : Math.max(0, item.installments_total - (item.installments_done ?? 0));
  if (left === 0) return [];
  // A goal already full, or a debt already paid, stops the rule now rather than at the
  // next due date. Anything else would project money into somewhere that cannot take it.
  if (cap != null && cap <= 0) return [];

  const out: Occurrence[] = [];
  let on = item.next_on;
  let booked = 0;

  for (let step = 0; step < MAX_STEPS && out.length < left && on <= horizon; step++) {
    if (item.ends_on != null && on > item.ends_on) break;
    /*
      The last deposit into a goal is usually smaller than the rest, and it is the one
      people actually want the date of — "when am I done" is the whole question a goal
      asks. So the walk stops the moment the cap is covered, and the occurrence that
      covers it carries only what is left rather than a full instalment.
    */
    if (cap != null && booked >= cap) break;
    out.push({
      id: item.id,
      source: "recurring",
      name: item.name,
      kind: item.kind,
      on,
      amount: cap != null ? Math.min(amount, cap - booked) : amount,
      estimated,
      category: item.category?.name ?? null,
      // A goal rule has no category — its colour is the goal's, so it reads on the
      // timeline the same way it reads on the goals screen.
      color: item.goal?.color ?? item.category?.color ?? null,
      goal: item.goal?.name ?? null,
      loan: item.loan?.name ?? null,
      samples,
      days: 0,
    });
    booked += cap != null ? Math.min(amount, cap - booked) : amount;
    on = nextDate(on, item.every, item.anchor_day ?? null, item.every_count ?? 1);
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
