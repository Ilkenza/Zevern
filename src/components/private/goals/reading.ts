/**
 * What a goal card says, worked out from what a goal actually carries: the amount
 * held, the target, the target date and the day it started.
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
 * history and something actually put aside — before that, a rate worked out from two
 * days and one deposit would be a guess wearing a badge.
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
export function read(goal: GoalLine, today: string, fmt: (n: number) => string): Reading {
  const target = Number(goal.target_rsd) || 0;
  const saved = goal.saved;
  const date = goal.target_date;
  const daysLeft = date ? daysBetween(today, date) : null;

  if (target > 0 && saved >= target) {
    const over = saved - target;
    return {
      pct: 1,
      done: true,
      badge: { status: "ok", label: "Reached" },
      note:
        over > 0
          ? `The full ${fmt(target)} is there, and ${fmt(over)} over`
          : `The full ${fmt(target)} is there`,
      pace: date ? "the date you aimed at" : null,
      consequence: null,
    };
  }

  if (target <= 0) {
    return {
      pct: null,
      done: false,
      badge: null,
      note: "No target set — this only counts what goes in.",
      pace: date ? "no target amount to work towards" : null,
      consequence: null,
    };
  }

  const left = target - saved;
  const pct = Math.min(saved / target, 1);
  const note = `${fmt(left)} to go of ${fmt(target)}`;

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

  // What has to go in from here, said in whichever unit fits the time left.
  const pace =
    daysLeft >= 60
      ? `${fmt(Math.ceil(left / (daysLeft / DAYS_PER_MONTH)))} a month to make it`
      : daysLeft >= MIN_HISTORY_DAYS
        ? `${fmt(Math.ceil(left / (daysLeft / 7)))} a week to make it`
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

