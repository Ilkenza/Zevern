/**
 * Named budgets, each measured against the window of its own clock that today falls in.
 *
 * The whole screen is one question asked once per budget — "of the money this one is
 * allowed, how much is gone" — but the budgets disagree about almost everything else:
 * one is a fortnight, one is a fixed holiday, one counts only what you put in it, one
 * counts what is left over rather than what went out. So the work is done here, once,
 * and the screen is handed figures rather than rules.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { todayISO } from "@/lib/format";
import { budgetWindow, type BudgetClock, type BudgetWindow } from "@/lib/money/budget-periods";
import type { BudgetPlanLine, MoneyBudgetPlan } from "@/lib/types";

/** The clock a plan keeps, in the shape the date arithmetic wants. */
export function clockOf(plan: MoneyBudgetPlan): BudgetClock {
  return {
    period: plan.period as BudgetClock["period"],
    period_count: plan.period_count,
    starts_on: plan.starts_on,
    ends_on: plan.ends_on,
  };
}

/**
 * Every budget, with its current window and what has happened inside it.
 *
 * One pass over the ledger rather than one query per budget. The windows are worked out
 * first, the widest span across all of them is fetched once, and each entry is then
 * offered to every budget that could want it. A dozen budgets over the same month is
 * the normal case, and a dozen round trips for it would be a dozen round trips for one
 * screen.
 */
export const getBudgetPlanLines = cache(async (on?: string): Promise<BudgetPlanLine[]> => {
  const today = on ?? todayISO();
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];

  const { data: plans, error } = await supabase
    .from("money_budget_plans")
    .select("*")
    .eq("user_id", uid)
    .eq("archived", false)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) console.error("getBudgetPlanLines:", error.message);
  if (!plans || plans.length === 0) return [];

  const ids = plans.map((p) => p.id);
  const [{ data: catLinks }, { data: accLinks }] = await Promise.all([
    supabase.from("money_budget_categories").select("budget_id, category_id").in("budget_id", ids),
    supabase.from("money_budget_accounts").select("budget_id, account_id").in("budget_id", ids),
  ]);

  const categoriesOf = new Map<string, Set<string>>();
  for (const l of catLinks ?? []) {
    (categoriesOf.get(l.budget_id) ?? categoriesOf.set(l.budget_id, new Set()).get(l.budget_id)!).add(
      l.category_id,
    );
  }
  const accountsOf = new Map<string, Set<string>>();
  for (const l of accLinks ?? []) {
    (accountsOf.get(l.budget_id) ?? accountsOf.set(l.budget_id, new Set()).get(l.budget_id)!).add(
      l.account_id,
    );
  }

  const windows = new Map<string, BudgetWindow>(
    plans.map((p) => [p.id, budgetWindow(clockOf(p), today)]),
  );

  // The one span that covers every window on the screen. Fetching per budget would be
  // exact and would also be a query per card.
  let from = "9999-12-31";
  let to = "0001-01-01";
  for (const w of windows.values()) {
    if (w.from < from) from = w.from;
    if (w.to > to) to = w.to;
  }

  const { data: rows } = await supabase
    .from("money_transactions")
    .select("kind, amount_rsd, category_id, account_id, budget_id, occurred_on")
    .eq("user_id", uid)
    .in("kind", ["expense", "income"])
    .gte("occurred_on", from)
    .lte("occurred_on", to);

  return plans.map((plan) => {
    const window = windows.get(plan.id)!;
    const categoryIds = [...(categoriesOf.get(plan.id) ?? [])];
    const accountIds = [...(accountsOf.get(plan.id) ?? [])];
    const cats = categoriesOf.get(plan.id);
    const accs = accountsOf.get(plan.id);

    let used = 0;
    let entries = 0;

    for (const row of rows ?? []) {
      if (row.occurred_on < window.from || row.occurred_on > window.to) continue;

      if (plan.membership === "added") {
        // You chose these by hand, so no filter gets a say — that is the entire point of
        // a budget you add to. A holiday's flights, hotel and dinners live in three
        // different categories and no filter would ever gather exactly those.
        if (row.budget_id !== plan.id) continue;
      } else {
        // Empty means "everything on this axis". A budget with no categories named
        // watches them all, which is what somebody typing "Monthly spending" means.
        if (cats && cats.size > 0 && (!row.category_id || !cats.has(row.category_id))) continue;
        if (accs && accs.size > 0 && (!row.account_id || !accs.has(row.account_id))) continue;
      }

      const value = Number(row.amount_rsd) || 0;

      if (plan.kind === "savings") {
        // What is left over, which is the only figure that answers "am I actually
        // saving": money in less money out. A month of no income and no spending
        // saves nothing, and this says so rather than reporting a full budget.
        used += row.kind === "income" ? value : -value;
      } else {
        if (row.kind !== "expense") continue;
        used += value;
      }
      entries += 1;
    }

    return {
      plan,
      window,
      categoryIds,
      accountIds,
      used: Math.round(used * 100) / 100,
      entries,
    };
  });
});

/**
 * The budgets an entry can be added to by hand — the 'added only' ones, whose windows
 * cover the day it happened.
 *
 * Offering a budget whose window the entry falls outside would be offering to file
 * something where it will never be counted, and the form has no way to explain that.
 */
export const getAddableBudgets = cache(async (on?: string): Promise<MoneyBudgetPlan[]> => {
  const today = on ?? todayISO();
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];

  const { data } = await supabase
    .from("money_budget_plans")
    .select("*")
    .eq("user_id", uid)
    .eq("archived", false)
    .eq("membership", "added")
    .order("sort", { ascending: true });

  return (data ?? []).filter((plan) => {
    const w = budgetWindow(clockOf(plan), today);
    return today >= w.from && today <= w.to;
  });
});
