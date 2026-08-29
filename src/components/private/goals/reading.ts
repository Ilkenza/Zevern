/**
 * What a goal card says, worked out from what a goal actually carries: where it stands,
 * the target, the target date and the day it started — and whether it is collecting
 * money or clearing it, which changes every sentence and none of the arithmetic.
 *
 * Separated from the card that draws it because it is arithmetic over dates and
 * money and nothing else — no hooks, no markup — which is what lets the pace verdict,
 * the badge and the "days left" wording be tested directly rather than through a
 * rendered component.
 */

import type { BadgeStatus } from "@/components/ui/Badge";
import type { GoalLine } from "@/lib/types";

const MS_DAY = 86_400_000;

/**
 * Whole days between two dates, read in UTC so the answer never depends on which
 * side of the wire it was computed. `created_at` arrives as a timestamp, so both
 * ends are cut back to a plain date first.
 */
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / MS_DAY);
}

/** Average days in a month — only ever used to say what a month has to look like. */
const DAYS_PER_MONTH = 30.44;

/** With less history than this there is nothing honest to say about pace. */
const MIN_HISTORY_DAYS = 14;

/**
 * The suggested opening deposit for a goal nothing has gone into yet.
 *
 * A tenth of the target, rounded to a figure a person would actually type — 5.000
 * rather than 4.783. Ten percent is chosen because it is the smallest step that still
 * reads as a real start; below that the progress bar does not visibly move and the
 * suggestion feels like a token.
 *
 * Returns 0 when there is nothing to suggest: money is already in, there is no
 * target, or the rounded step would be the whole goal.
 *
 * Lives here rather than in the form that used it because the card offers the same
 * figure now, and two copies of this arithmetic would drift the day the rounding
 * changes.
 */
export function firstStepFor(target: number, saved: number): number {
  if (saved > 0 || target <= 0) return 0;
  const tenth = target / 10;
  const step = tenth >= 10000 ? 5000 : tenth >= 2000 ? 1000 : tenth >= 500 ? 500 : 100;
  const rounded = Math.max(Math.round(tenth / step) * step, step);
  return rounded < target ? rounded : 0;
}

/** A goal is open while it has not been closed — the same test the accounts apply. */
export function isOpen(goal: GoalLine): boolean {
  return goal.completed_at === null;
}

export type Reading = {
  /** null when no target is set — there is no progress then, only a running total. */
  pct: number | null;
  done: boolean;
  badge: { status: BadgeStatus; label: string } | null;
  /** The money sentence. */
  note: string;
  /** The phrase that follows the target date. Null when there is no date. */
  pace: string | null;
  /*
    What happens if nothing changes.

    "Behind pace" is a verdict, and a verdict is easy to nod at and ignore. The same
    fact said as an outcome — the date it actually lands on at this rate — is the one
    people act on, because it names what is being lost rather than grading effort.
  */
  consequence: string | null;
};

/**
 * Everything a card says about one goal, derived from the facts a goal actually
 * carries: what it holds now, what ever went in, the target, the target date and when
 * it started.
 *
 * The pace verdict is deliberately shy. It shows up only once there is a fortnight of
 * history and something actually moved — before that, a rate worked out from two days
 * and one entry would be a guess wearing a badge.
 */
/**
 * `fmt` is passed in rather than imported.
 *
 * This module turns a goal into sentences, and the sentences carry money — which means
 * they carry a currency, and the currency is a per-reader setting that lives in a React
 * context this file cannot reach. Taking the formatter as an argument keeps the module
 * pure, keeps it testable without a provider, and makes it impossible for a card and
 * the note under it to disagree about what currency they are in.
 */
/*
  The same arithmetic, said two ways.

  A goal that collects and a goal that clears run on one calculation — a figure against
  a target, a date, a rate — and differ only in what the figure is called. Keeping the
  words in one table rather than branching through the function is what stops the two
  readings from drifting: every sentence a card can print is on this page, side by side,
  where a change to one is read against its opposite.
*/
const WORDS = {
  saving: {
    reached: "Reached",
    /** Said when the target is met. */
    full: (target: string) => `The full ${target} is there`,
    over: (target: string, over: string) => `The full ${target} is there, and ${over} over`,
    none: "No target set — this only counts what goes in.",
    left: (left: string, target: string) => `${left} to go of ${target}`,
    /** The rate needed from here, in whichever unit fits the time left. */
    rate: (amount: string, unit: string) => `${amount} a ${unit} to make it`,
  },
  paying: {
    reached: "Paid off",
    full: (target: string) => `All ${target} is paid`,
    over: (target: string, over: string) => `All ${target} is paid, and ${over} over`,
    none: "No amount set — this only counts what goes out.",
    left: (left: string, target: string) => `${left} left to pay of ${target}`,
    rate: (amount: string, unit: string) => `${amount} a ${unit} to clear it`,
  },
} as const;

export function read(
  goal: GoalLine,
  today: string,
  fmt: (n: number) => string,
  /**
   * For the one figure on the card that is an instruction rather than a report.
   *
   * "Put this much aside every month" is meant to be acted on, so it is printed to the
   * para: rounding 30.776,48 up to 30.777 is the app quietly changing the answer, and
   * the difference compounds over the payments. Defaults to `fmt` so a caller that has
   * only the one formatter behaves exactly as before.
   */
  fmtExact: (n: number) => string = fmt,
): Reading {
  const w = goal.paying ? WORDS.paying : WORDS.saving;
  const target = Number(goal.target_rsd) || 0;
  const saved = goal.progress;
  const date = goal.target_date;
  const daysLeft = date ? daysBetween(today, date) : null;

  if (target > 0 && saved >= target) {
    const over = saved - target;
    return {
      pct: 1,
      done: true,
      badge: { status: "ok", label: w.reached },
      note: over > 0 ? w.over(fmt(target), fmt(over)) : w.full(fmt(target)),
      pace: date ? "the date you aimed at" : null,
      consequence: null,
    };
  }

  if (target <= 0) {
    return {
      pct: null,
      done: false,
      badge: null,
      note: w.none,
      pace: date ? "no target amount to work towards" : null,
      consequence: null,
    };
  }

  const left = target - saved;
  const pct = Math.min(saved / target, 1);
  const note = w.left(fmt(left), fmt(target));

  if (daysLeft === null) {
    return { pct, done: false, badge: null, note, pace: null, consequence: null };
  }

  if (daysLeft < 0) {
    const ago = -daysLeft;
    return {
      pct,
      done: false,
      badge: { status: "danger", label: "Date passed" },
      note,
      pace: `${ago} ${ago === 1 ? "day" : "days"} ago`,
      consequence: null,
    };
  }

  if (daysLeft === 0) {
    return {
      pct,
      done: false,
      badge: { status: "active", label: "Due today" },
      note,
      pace: "today",
      consequence: null,
    };
  }

  /*
    What has to go in from here, said in whichever unit fits the time left.

    Counted in whole payments, not in average months. Dividing by `daysLeft / 30.44`
    gives a fraction — 126 days is 4.14 "months" — and a fraction of a payment is one
    nobody makes. On a 123.105 goal due on 1 January that read "29.741 a month", and four
    payments of 29.741 leave you 4.000 short on the day it is due: the one number the
    line exists to give was the one number that did not work.

    Flooring counts the payments you can actually still make — four, here — and the
    figure goes up to 30.777, which is what genuinely clears it. Both branches are only
    reached above their own unit (60 days, 14 days), so the floor can never be zero.
  */
  // Up to the nearest para rather than the nearest dinar: enough to be sure the last
  // payment clears it, without inventing money that was never in the arithmetic.
  const per = (payments: number) => Math.ceil((left / payments) * 100) / 100;
  const pace =
    daysLeft >= 60
      ? w.rate(fmtExact(per(Math.floor(daysLeft / DAYS_PER_MONTH))), "month")
      : daysLeft >= MIN_HISTORY_DAYS
        ? w.rate(fmtExact(per(Math.floor(daysLeft / 7))), "week")
        : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;

  const elapsed = daysBetween(goal.created_at, today);
  const perDay = elapsed !== null && elapsed > 0 ? saved / elapsed : 0;
  const enoughHistory = elapsed !== null && elapsed >= MIN_HISTORY_DAYS && saved > 0;
  const onTrack = enoughHistory && perDay >= left / daysLeft;

  const badge = enoughHistory
    ? onTrack
      ? { status: "ok" as const, label: "On track" }
      : { status: "active" as const, label: "Behind pace" }
    : null;

  /*
    How late, at the rate money has actually been going in. Only said when there is
    enough history for the rate to mean anything and the answer is not absurd — a goal
    creeping in at a hundred dinars a week does not need "lands in 2039" written on it,
    because at that point the honest reading is that the date is the thing that is
    wrong, not the pace.
  */
  const behindBy = enoughHistory && !onTrack && perDay > 0 ? Math.ceil(left / perDay) - daysLeft : 0;
  const consequence =
    behindBy > 0
      ? behindBy > 400
        ? "at this rate the date is out of reach — move it, or put more in"
        : behindBy >= 60
          ? `at this rate it lands about ${Math.round(behindBy / 30)} months late`
          : `at this rate it lands about ${behindBy} ${behindBy === 1 ? "day" : "days"} late`
      : null;

  return { pct, done: false, badge, note, pace, consequence };
}


/**
 * The colour every goal is drawn in.
 *
 * Goals used to carry one each, chosen from a palette, and the rail down a card was
 * that choice. The picker is gone — the form now stamps every goal with a single hex
 * — so the colour has stopped being an identity and become a constant. Two things
 * follow, and this line is both of them.
 *
 * It is the token rather than a hex, because the hex it replaced was `#d9a441`: byte
 * for byte the value of `--color-gold`, copied into the form and then into every row
 * in the table. Change the brand gold in `@theme` and every goal ever created keeps
 * the old one, on a screen sitting next to buttons that moved. A stored copy of a
 * design token is drift with a delay on it.
 *
 * And it is one export rather than five call sites, because the card, the closed row
 * and the overall bar were each resolving it themselves — which is how a goal created
 * before the picker was removed still shows brown in one place and gold in another.
 */
export const GOAL_ACCENT = "var(--color-gold)";
