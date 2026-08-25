/**
 * What a rule row says about one rule, and the wording it says it in.
 *
 * Pure on purpose: the monthly figure worked out here has to match the KPI above the
 * list to the dinar, and the only way to be sure of that is to compute both from the
 * same `PER_MONTH` and be able to test this half on its own.
 */

import { toRsd, type Rates } from "@/lib/money";
import { PER_MONTH } from "@/lib/money/occurrences";
import type { RecurringRow } from "@/lib/types";
import { isRunning } from "./index";

const EVERY_LABEL: Record<string, string> = {
  week: "Every week",
  month: "Every month",
  year: "Every year",
};

const EVERY_SHORT: Record<string, string> = { week: "a week", month: "a month", year: "a year" };

export { EVERY_LABEL, EVERY_SHORT };

/**
 * One column template, shared by the head strip and every row — they only line up if
 * both are measured the same way. Under 760px a rule stacks: name and controls, then
 * where and how often, then the two figures side by side under their own labels.
 */
export const ruleCols =
  "grid grid-cols-2 gap-x-3 gap-y-2 min-[760px]:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem_6.5rem] min-[760px]:items-center";

export type Reading = {
  running: boolean;
  settled: boolean;
  /** Dinars in an average month. Null when the amount is not known in advance. */
  monthly: number | null;
  /** The instalment countdown, when the rule keeps one. */
  countdown: { status: "ok" | "draft"; label: string } | null;
  /** True when this one puts money aside instead of paying for something. */
  toGoal: boolean;
};

/**
 * Dinars in an average month, or null when there is no honest figure — a variable rule
 * has no per-item amount here, and guessing one would put a number in the column that
 * nothing behind it supports.
 *
 * Its own function because the row prints it and the "costs most" sort ranks by it:
 * two readings of the same thing would eventually disagree, and a list sorted by a
 * figure other than the one it shows is worse than no sort at all.
 */
export function monthlyFor(item: RecurringRow, rates: Rates): number | null {
  const amount = Number(item.amount);
  if (item.variable || !(amount > 0)) return null;
  return toRsd(amount, item.currency, rates) * (PER_MONTH[item.every] ?? 1);
}

/**
 * Everything a row says, worked out from what a rule actually carries: its amount and
 * currency, how often it repeats, the instalments booked so far and its end date.
 * A variable rule has no per-item amount to show — there is no honest monthly figure
 * for it here, so the column says so rather than guessing one.
 */
export function read(item: RecurringRow, rates: Rates): Reading {
  const total = item.installments_total;
  const done = item.installments_done ?? 0;
  const settled = total != null && done >= total;

  const monthly = monthlyFor(item, rates);

  const left = total != null ? Math.max(total - done, 0) : null;
  const countdown = settled
    ? { status: "ok" as const, label: `Paid off · ${total} of ${total}` }
    : left != null
      ? { status: "draft" as const, label: `${left} of ${total} left` }
      : null;

  return { running: isRunning(item), settled, monthly, countdown, toGoal: item.goal != null };
}

