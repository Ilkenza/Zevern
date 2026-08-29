/**
 * The two figures about the standing rules that mean different things: what they cost
 * in an average month, and what they will actually take over the next year.
 */

import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { feedsGoal, goalCapFor, occurrencesFor, perMonth } from "@/lib/money/occurrences";
import { estimateFor, getRates, getRecurring, recentBookings } from "./core";
import { getGoalRemaining } from "./goals";

export type RecurringTotals = {
  /** RSD in an average month — weekly and yearly items normalised. Bills only. */
  expense: number;
  income: number;
  /**
   * Standing orders into goals, per average month. Kept apart from `expense` because
   * this money is not spent — it stops being spendable, which is a different sentence.
   * It still comes off what is free, so `net` counts it.
   */
  saving: number;
  net: number;
  /** Variable items counted from their own past bookings rather than a set amount. */
  estimated: number;
  /** Variable items with no history yet — nothing to estimate from, so they are left out. */
  unknown: number;
  /** RSD actually falling due in the next 12 months, occurrence by occurrence. */
  yearExpense: number;
  yearIncome: number;
  yearSaving: number;
  yearCount: number;
  /** The date that window closes on — computed server-side so the UI never disagrees. */
  yearHorizon: string;
};

/**
 * Two answers about the same list. The monthly figure is a run rate — weekly and
 * yearly items spread evenly so one number can be compared month to month. The
 * yearly figure is the opposite: the real dates walked one by one from today, so a
 * four-instalment credit counts four times and an annual domain counts once.
 *
 * Fixed items contribute their amount; variable ones (struja) contribute the average
 * of their last six bookings, which is the only honest guess available.
 */
export async function getRecurringTotals(): Promise<RecurringTotals> {
  const supabase = await createClient();

  const now = new Date();
  const horizon = new Date(
    Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);

  const uid = await userId(supabase);
  if (!uid) {
    return {
      expense: 0,
      income: 0,
      saving: 0,
      net: 0,
      estimated: 0,
      unknown: 0,
      yearExpense: 0,
      yearIncome: 0,
      yearSaving: 0,
      yearCount: 0,
      yearHorizon: horizon,
    };
  }

  const [items, rates, past, goalRoom] = await Promise.all([
    getRecurring(),
    getRates(),
    recentBookings(supabase, uid),
    getGoalRemaining(),
  ]);

  let expense = 0;
  let income = 0;
  let saving = 0;
  let estimated = 0;
  let unknown = 0;
  let yearExpense = 0;
  let yearIncome = 0;
  let yearSaving = 0;
  let yearCount = 0;

  for (const item of items) {
    if (!item.active) continue;
    if (item.installments_total != null && item.installments_done >= item.installments_total) continue;
    if (item.ends_on != null && item.next_on > item.ends_on) continue;

    const factor = perMonth(item.every, item.every_count);
    const reading = estimateFor(item, past, rates);
    if (reading === null) {
      unknown++;
      continue;
    }
    const { each, estimated: isEstimate } = reading;
    if (isEstimate) estimated++;

    const monthly = each * factor;
    const toGoal = feedsGoal(item);
    if (item.kind === "income") income += monthly;
    else if (toGoal) saving += monthly;
    else expense += monthly;

    // The same item walked date by date — this is where a four-instalment credit
    // stops pretending it runs all year.
    const dates = occurrencesFor(item, each, isEstimate, horizon, [], goalCapFor(item, goalRoom));
    yearCount += dates.length;
    const sum = each * dates.length;
    if (item.kind === "income") yearIncome += sum;
    else if (toGoal) yearSaving += sum;
    else yearExpense += sum;
  }

  return {
    expense,
    income,
    saving,
    // Money put aside is not spent, but it is not available either — so it comes off
    // what is left over, the same as a bill does.
    net: income - expense - saving,
    estimated,
    unknown,
    yearExpense,
    yearIncome,
    yearSaving,
    yearCount,
    yearHorizon: horizon,
  };
}
