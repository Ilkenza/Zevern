/**
 * Budgets: a limit per category, this month against it, and what a normal month
 * actually costs — which is the figure that makes a limit possible to set.
 */

import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { monthKey, monthRange, shiftMonth } from "@/lib/money";
import { median } from "@/lib/money/occurrences";
import type { BudgetLine } from "@/lib/types";
import { getBudgets, getCategories } from "./core";
import { getMonthSummary } from "./transactions";

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

  const [categories, budgets, summary, history] = await Promise.all([
    getCategories(),
    getBudgets(),
    getMonthSummary(month),
    uid
      ? supabase
          .from("money_transactions")
          .select("category_id, amount_rsd, occurred_on")
          .eq("user_id", uid)
          .eq("kind", "expense")
          .gte("occurred_on", from)
          .lte("occurred_on", to)
      : Promise.resolve({ data: [] as { category_id: string | null; amount_rsd: number | string | null; occurred_on: string }[] }),
  ]);

  const limitBy = new Map(budgets.map((b) => [b.category_id, Number(b.amount_rsd) || 0]));
  const spentBy = new Map(summary.byCategory.map((c) => [c.id, c.spent]));

  // category -> month -> total
  const byCategoryMonth = new Map<string, Map<string, number>>();
  for (const row of history.data ?? []) {
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
        limit: limitBy.get(category.id) ?? 0,
        spent: spentBy.get(category.id) ?? 0,
        typical,
      };
    });
}

