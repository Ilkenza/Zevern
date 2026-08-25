/**
 * Everyday spending — the part of a month nobody enters as a plan or a rule, and the
 * part the forecast would be a fantasy without.
 */

import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { monthKey, monthRange, shiftMonth } from "@/lib/money";
import { PER_MONTH, feedsGoal, median } from "@/lib/money/occurrences";
import type { SpendingBasis } from "@/lib/types";
import {
  estimateFor,
  getBudgets,
  getCategories,
  getRates,
  getRecurring,
  recentBookings,
} from "./core";

/** How many complete months the median is taken over. */
const HISTORY_MONTHS = 6;

/** How the owner wants everyday spending projected. Anything unknown reads as history. */
export async function getSpendingBasis(): Promise<SpendingBasis> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return "off";
  const { data } = await supabase
    .from("profiles")
    .select("spending_basis")
    .eq("id", uid)
    .maybeSingle();
  const value = String(data?.spending_basis ?? "history");
  return value === "off" || value === "budgets" ? value : "history";
}

export type SpendingProjection = {
  basis: SpendingBasis;
  /** RSD a whole month is expected to take. Zero when there is nothing to say. */
  monthly: number;
  /** How much of that this month has already seen — real entries, not projection. */
  spentThisMonth: number;
  /** False when the chosen basis needs data that does not exist yet. */
  ready: boolean;
  /** history: the months the median was taken over, oldest first. */
  months: { month: string; spent: number }[];
  /** budgets: every limit, and what recurring rules already book into that category. */
  categories: { id: string; name: string; limit: number; recurring: number }[];
  /**
   * Categories carrying a limit. A planned item in one of them is already counted by
   * that limit, so the forecast takes it off the month rather than adding it twice.
   */
  budgeted: string[];
};

export const NO_SPENDING: SpendingProjection = {
  basis: "off",
  monthly: 0,
  spentThisMonth: 0,
  ready: true,
  months: [],
  categories: [],
  budgeted: [],
};

/**
 * Everyday spending is what is left of the expenses once the timeline's own items are
 * taken out: an entry a recurring rule booked, and an entry that settled a planned
 * item, are both already on the line in their own right. Counting them here as well is
 * exactly the double count this projection exists to avoid.
 */
async function everydayByMonth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  uid: string,
  from: string,
  to: string,
): Promise<{ spent: Map<string, number>; active: Set<string> }> {
  const [{ data: rows }, { data: settled }] = await Promise.all([
    supabase
      .from("money_transactions")
      .select("id, kind, recurring_id, amount_rsd, occurred_on")
      .eq("user_id", uid)
      .gte("occurred_on", from)
      .lte("occurred_on", to),
    supabase
      .from("money_planned")
      .select("transaction_id")
      .eq("user_id", uid)
      .not("transaction_id", "is", null),
  ]);

  const fromPlan = new Set((settled ?? []).map((p) => p.transaction_id));
  const spent = new Map<string, number>();
  const active = new Set<string>();

  for (const row of rows ?? []) {
    const month = String(row.occurred_on).slice(0, 7);
    // A month with entries of any kind is a month that was actually being used; one
    // with none is a month with no data, which is not the same as a month of zero.
    active.add(month);
    if (row.kind !== "expense") continue;
    if (row.recurring_id != null) continue;
    if (fromPlan.has(row.id)) continue;
    spent.set(month, (spent.get(month) ?? 0) + (Number(row.amount_rsd) || 0));
  }

  return { spent, active };
}

/**
 * What a month of everyday spending is expected to come to, and where that figure
 * comes from.
 *
 * `budgets` believes the limits: it adds up the monthly limit of every expense
 * category, less whatever recurring rules already book into that same category —
 * a limit of 20.000 on bills with 14.000 of standing rules against it leaves 6.000
 * of everyday room, not 20.000 on top of the bills.
 *
 * `history` believes the ledger: the median of the last complete months of everyday
 * spending. The median rather than the mean, because one month with a new laptop in
 * it should not raise the line for the rest of the year.
 */
export async function getSpendingProjection(): Promise<SpendingProjection> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return NO_SPENDING;

  const basis = await getSpendingBasis();
  if (basis === "off") return { ...NO_SPENDING, basis };

  const now = new Date();
  const thisMonth = monthKey(now);
  const first = monthRange(shiftMonth(thisMonth, -HISTORY_MONTHS)).from;
  const last = monthRange(thisMonth).to;
  const { spent, active } = await everydayByMonth(supabase, uid, first, last);
  const spentThisMonth = spent.get(thisMonth) ?? 0;

  if (basis === "budgets") {
    const [budgets, categories, items, rates, past] = await Promise.all([
      getBudgets(),
      getCategories(true),
      getRecurring(),
      getRates(),
      recentBookings(supabase, uid),
    ]);

    // What the rules already take out of each category in an average month.
    const booked = new Map<string, number>();
    for (const item of items) {
      if (!item.active || item.kind === "income" || feedsGoal(item)) continue;
      if (!item.category_id) continue;
      if (item.installments_total != null && item.installments_done >= item.installments_total)
        continue;
      if (item.ends_on != null && item.next_on > item.ends_on) continue;
      const reading = estimateFor(item, past, rates);
      if (reading === null) continue;
      const monthly = reading.each * (PER_MONTH[item.every] ?? 1);
      booked.set(item.category_id, (booked.get(item.category_id) ?? 0) + monthly);
    }

    const nameBy = new Map(categories.map((c) => [c.id, c.name]));
    const lines = budgets
      .map((b) => ({
        id: b.category_id,
        name: nameBy.get(b.category_id) ?? "Category",
        limit: Number(b.amount_rsd) || 0,
        recurring: booked.get(b.category_id) ?? 0,
      }))
      .filter((line) => line.limit > 0)
      .sort((a, b) => b.limit - a.limit);

    const monthly = lines.reduce((sum, l) => sum + Math.max(l.limit - l.recurring, 0), 0);

    return {
      basis,
      monthly,
      spentThisMonth,
      ready: lines.length > 0,
      months: [],
      categories: lines,
      budgeted: lines.map((l) => l.id),
    };
  }

  // The complete months behind us, oldest first. This month is left out on purpose:
  // it is half over, and half a month would drag the middle down every time.
  const months: { month: string; spent: number }[] = [];
  for (let i = HISTORY_MONTHS; i >= 1; i--) {
    const month = shiftMonth(thisMonth, -i);
    if (!active.has(month)) continue; // no entries at all — no data, not a zero
    months.push({ month, spent: spent.get(month) ?? 0 });
  }

  return {
    basis,
    monthly: median(months.map((m) => m.spent)),
    spentThisMonth,
    ready: months.length > 0,
    months,
    categories: [],
    budgeted: [],
  };
}
