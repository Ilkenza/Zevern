/**
 * Budgets: a limit per category, this month against it, and what a normal month
 * actually costs — which is the figure that makes a limit possible to set.
 */

import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { todayISO } from "@/lib/format";
import { monthKey, monthRange, shiftMonth } from "@/lib/money";
import { goalCapFor, median, occurrencesFor } from "@/lib/money/occurrences";
import type { BudgetLine } from "@/lib/types";
import {
  estimateFor,
  getCategories,
  getRates,
  getRecurring,
  recentBookings,
} from "./core";
import { getMonthSummary } from "./transactions";
import { getGoalRemaining } from "./goals";
import { getCategoryBudgetCaps } from "./budget-plans";
import { ReadFailed } from "@/lib/data/must";
import { readAll } from "@/lib/money/paging";

/**
 * The dated charges in a month, per category: what has already booked, and what is
 * still to come.
 *
 * This is the figure the pace model is built on. Everyday spending accrues with the
 * days, so a few days of it honestly predict the rest; a bill does not accrue at all.
 * It is one date and one amount, and both are known before the month starts. Told
 * apart, the two can each be treated correctly. Left together, the linear
 * extrapolation runs over the top of every fixed charge and the screen shouts on the
 * 3rd of every month.
 *
 * What has booked is read from the entries rather than inferred: `postRecurring`
 * writes `recurring_id` onto the transaction it creates, so the join is exact. What is
 * still to come is walked out of the rules with the same `occurrencesFor` the forecast
 * uses, which is what keeps a four-instalment credit from counting twelve times.
 */
async function fixedByCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  uid: string,
  month: string,
): Promise<{ paid: Map<string, number>; due: Map<string, number> }> {
  const { from, to } = monthRange(month);
  const today = todayISO();
  const paid = new Map<string, number>();
  const due = new Map<string, number>();

  const { data: booked, error } = await supabase
    .from("money_transactions")
    .select("category_id, amount_rsd")
    .eq("user_id", uid)
    .eq("kind", "expense")
    .not("recurring_id", "is", null)
    .gte("occurred_on", from)
    .lte("occurred_on", to);
  if (error) throw new ReadFailed("this month's fixed costs", error.message);

  for (const row of booked ?? []) {
    if (!row.category_id) continue;
    paid.set(row.category_id, (paid.get(row.category_id) ?? 0) + (Number(row.amount_rsd) || 0));
  }

  // A finished month has nothing still to land in it.
  if (to < today) return { paid, due };

  const [rules, rates, past] = await Promise.all([
    getRecurring(),
    getRates(),
    recentBookings(supabase, uid),
  ]);

  /*
    A month still ahead counts only the charges dated inside it. The month being lived
    also counts anything overdue: a bill whose date has passed unpaid has not stopped
    being money that leaves this month, and dropping it would understate the ceiling by
    exactly the amount most likely to break it.
  */
  const floor = from > today ? from : null;
  const goalRoom = await getGoalRemaining();

  for (const rule of rules) {
    // A goal rule reserves money rather than spending it, and a rule with no category
    // cannot be measured against a limit that hangs off one.
    if (rule.goal_id != null || rule.kind !== "expense" || !rule.category_id) continue;
    const estimate = estimateFor(rule, past, rates);
    if (!estimate) continue;

    for (const occ of occurrencesFor(
      rule,
      estimate.each,
      estimate.estimated,
      to,
      estimate.samples,
      goalCapFor(rule, goalRoom),
    )) {
      if (floor && occ.on < floor) continue;
      due.set(rule.category_id, (due.get(rule.category_id) ?? 0) + occ.amount);
    }
  }

  return { paid, due };
}

/** How many completed months a "typical month" is read from. */
const BUDGET_HISTORY_MONTHS = 6;

/**
 * Categories joined with their limit, this month's spend, and what a normal month
 * costs them.
 *
 * `typical` is the median of the six completed months before this one, and median
 * rather than average on purpose: one December, one plane ticket, one dentist would
 * drag an average up and hand back a limit nobody can live inside. Months where the
 * category cost nothing count as zeros, so a category used twice a year honestly
 * reports that it has no typical month — the screen then offers no suggestion, which
 * is the right answer rather than a made-up one.
 *
 * The month being viewed is excluded whether or not it is finished: half of August is
 * not what August costs.
 */
export async function getBudgetLines(month = monthKey()): Promise<BudgetLine[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);

  const from = monthRange(shiftMonth(month, -BUDGET_HISTORY_MONTHS)).from;
  const to = monthRange(shiftMonth(month, -1)).to;

  const [categories, caps, summary, history, fixed] = await Promise.all([
    getCategories(),
    /*
      The caps come from the budgets you keep now, not from the retired per-category
      table. That table still holds the figures it held the day the budgets screen was
      rewritten, and reading it meant this screen printed a red "over limit" against a
      number nothing could change — and printed it for money that had been deliberately
      filed somewhere else.
    */
    getCategoryBudgetCaps(month),
    getMonthSummary(month),
    // Six months of expenses: 366 rows on this ledger today, and climbing at the rate it
    // is being used. Paged now, while the fix is a change of shape rather than a bug
    // report about a bar chart that quietly stopped counting one of its months.
    uid
      ? readAll<{ category_id: string | null; amount_rsd: number | string | null; occurred_on: string }>(
          (lo, hi) =>
            supabase
              .from("money_transactions")
              .select("category_id, amount_rsd, occurred_on")
              .eq("user_id", uid)
              .eq("kind", "expense")
              .gte("occurred_on", from)
              .lte("occurred_on", to)
              .order("id")
              .range(lo, hi),
          "what each category cost in the months before",
        )
      : Promise.resolve([] as { category_id: string | null; amount_rsd: number | string | null; occurred_on: string }[]),
    uid
      ? fixedByCategory(supabase, uid, month)
      : Promise.resolve({ paid: new Map<string, number>(), due: new Map<string, number>() }),
  ]);

  const spentBy = new Map(summary.byCategory.map((c) => [c.id, c.spent]));

  // category -> month -> total
  const byCategoryMonth = new Map<string, Map<string, number>>();
  for (const row of history) {
    if (!row.category_id) continue;
    const key = row.occurred_on.slice(0, 7);
    const months = byCategoryMonth.get(row.category_id) ?? new Map<string, number>();
    months.set(key, (months.get(key) ?? 0) + (Number(row.amount_rsd) || 0));
    byCategoryMonth.set(row.category_id, months);
  }

  const window: string[] = [];
  for (let i = BUDGET_HISTORY_MONTHS; i >= 1; i -= 1) window.push(shiftMonth(month, -i));

  return categories
    .filter((c) => c.kind === "expense")
    .map((category) => {
      const months = byCategoryMonth.get(category.id);
      const typical = months
        ? Math.round(median(window.map((m) => months.get(m) ?? 0)))
        : 0;
      return {
        category,
        limit: caps[category.id]?.limit ?? 0,
        spent: spentBy.get(category.id) ?? 0,
        counted: caps[category.id]?.counted ?? spentBy.get(category.id) ?? 0,
        typical,
        fixedPaid: Math.round(fixed.paid.get(category.id) ?? 0),
        fixedDue: Math.round(fixed.due.get(category.id) ?? 0),
      };
    });
}

