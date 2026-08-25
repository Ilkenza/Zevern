/**
 * What a goal card says, worked out from what a goal actually carries: the amount
 * held, the target, the target date and the day it started.
 *
 * Separated from the card that draws it because it is arithmetic over dates and
 * money and nothing else — no hooks, no markup — which is what lets the pace verdict,
 * the badge and the "days left" wording be tested directly rather than through a
 * rendered component.
 */

import { formatRsd } from "@/lib/money";
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
export function read(goal: GoalLine, today: string): Reading {
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
          ? `The full ${formatRsd(target)} is there, and ${formatRsd(over)} over`
          : `The full ${formatRsd(target)} is there`,
      pace: date ? "the date you aimed at" : null,
    };
  }

  if (target <= 0) {
    return {
      pct: null,
      done: false,
      badge: null,
      note: "No target set — this only counts what goes in.",
      pace: date ? "no target amount to work towards" : null,
    };
  }

  const left = target - saved;
  const pct = Math.min(saved / target, 1);
  const note = `${formatRsd(left)} to go of ${formatRsd(target)}`;

  if (daysLeft === null) {
    return { pct, done: false, badge: null, note, pace: null };
  }

  if (daysLeft < 0) {
    const ago = -daysLeft;
    return {
      pct,
      done: false,
      badge: { status: "danger", label: "Date passed" },
      note,
      pace: `${ago} ${ago === 1 ? "day" : "days"} ago`,
    };
  }

  if (daysLeft === 0) {
    return {
      pct,
      done: false,
      badge: { status: "active", label: "Due today" },
      note,
      pace: "today",
    };
  }

  // What has to go in from here, said in whichever unit fits the time left.
  const pace =
    daysLeft >= 60
      ? `${formatRsd(Math.ceil(left / (daysLeft / DAYS_PER_MONTH)))} a month to make it`
      : daysLeft >= MIN_HISTORY_DAYS
        ? `${formatRsd(Math.ceil(left / (daysLeft / 7)))} a week to make it`
        : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;

  const elapsed = daysBetween(goal.created_at, today);
  const badge =
    elapsed !== null && elapsed >= MIN_HISTORY_DAYS && saved > 0
      ? saved / elapsed >= left / daysLeft
        ? { status: "ok" as const, label: "On track" }
        : { status: "active" as const, label: "Behind pace" }
      : null;

  return { pct, done: false, badge, note, pace };
}

