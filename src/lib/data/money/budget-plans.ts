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
import { readAll } from "@/lib/money/paging";
import {
  budgetWindow,
  shiftBudgetWindow,
  type BudgetClock,
  type BudgetWindow,
} from "@/lib/money/budget-periods";
import { amountAt, type AmountChange } from "@/lib/money/budget-amounts";
import { contributionOf } from "@/lib/money/budget-match";
import { boostFor, type Boost } from "@/lib/money/budget-boosts";
import type { BudgetPlanLine, MoneyBudgetBoost, MoneyBudgetPlan } from "@/lib/types";
import { ReadFailed } from "@/lib/data/must";

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

  const { data: plans, error: plansError } = await supabase
    .from("money_budget_plans")
    .select("*")
    .eq("user_id", uid)
    .eq("archived", false)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (plansError) throw new ReadFailed("your budgets", plansError.message);
  if (!plans || plans.length === 0) return [];

  const ids = plans.map((p) => p.id);
  const [catRes, accRes, boostRes, amountRes] = await Promise.all([
    supabase.from("money_budget_categories").select("budget_id, category_id").in("budget_id", ids),
    supabase.from("money_budget_accounts").select("budget_id, account_id").in("budget_id", ids),
    /*
      What a trip grants the monthly limits, for the months it falls in.

      Read with the plans rather than per card: the granting budget is one of the plans
      already in hand, so its dates and its name cost nothing extra, and a boost is a
      handful of rows even for somebody who travels constantly.
    */
    supabase
      .from("money_budget_boosts")
      .select("source_budget_id, target_budget_id, amount_rsd")
      .eq("user_id", uid),
    /*
      What each budget allowed, and from when.

      A plan's own `amount_rsd` is the current figure and stays that — every form reads it
      — but a finished window has to be judged by what it actually ran under. Reading the
      whole history costs one query for a handful of rows per budget, and it is the only
      thing standing between "you overspent July" and July quietly changing its mind the
      next time somebody edits the limit.
    */
    supabase
      .from("money_budget_amounts")
      .select("budget_id, starts_on, amount_rsd")
      .eq("user_id", uid),
  ]);

  /*
    Four reads that say what each budget is made of. Dropped errors here do not blank the
    screen — they change what the budgets mean: no category links reads as "this budget
    watches nothing", no amount history reads as "it has always been this figure", and
    both produce a card that is confidently wrong rather than obviously broken.
  */
  if (catRes.error) throw new ReadFailed("what your budgets watch", catRes.error.message);
  if (accRes.error) throw new ReadFailed("which accounts your budgets watch", accRes.error.message);
  if (boostRes.error) throw new ReadFailed("the extra room one budget grants another", boostRes.error.message);
  if (amountRes.error) throw new ReadFailed("what your budgets were set to", amountRes.error.message);
  const catLinks = catRes.data;
  const accLinks = accRes.data;
  const boostRows = boostRes.data;
  const amountRows = amountRes.data;

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

  /*
    Every boost, grouped by the budget that receives it, with the granting budget's own
    dates and name attached — which is all `boostFor` needs to decide.

    A boost whose granting budget has been archived or deleted is simply not here: the
    plans query is already filtered, so the join below finds nothing and the room quietly
    goes away with the trip it belonged to. That is the honest outcome — a raise nobody
    can point at the reason for is exactly what this design set out to avoid.
  */
  const changesFor = new Map<string, AmountChange[]>();
  for (const row of amountRows ?? []) {
    const list = changesFor.get(row.budget_id) ?? [];
    list.push({ starts_on: row.starts_on, amount: Number(row.amount_rsd) || 0 });
    changesFor.set(row.budget_id, list);
  }

  const byId = new Map(plans.map((p) => [p.id, p]));
  const boostsFor = new Map<string, Boost[]>();
  for (const row of boostRows ?? []) {
    const source = byId.get(row.source_budget_id);
    if (!source || !source.ends_on) continue;
    const list = boostsFor.get(row.target_budget_id) ?? [];
    list.push({
      from: source.starts_on,
      to: source.ends_on,
      amount: Number(row.amount_rsd) || 0,
      source: source.name,
    });
    boostsFor.set(row.target_budget_id, list);
  }

  // The one span that covers every window on the screen. Fetching per budget would be
  // exact and would also be a query per card.
  let from = "9999-12-31";
  let to = "0001-01-01";
  for (const w of windows.values()) {
    if (w.from < from) from = w.from;
    if (w.to > to) to = w.to;
  }

  /*
    One span covering every card, and therefore as wide as the widest budget on the screen.
    Three yearly budgets make that a full year: 878 rows today against PostgREST's stop at
    1.000, which at the rate this ledger is filled is a few weeks of headroom. Past it,
    every card would read "on track" off a subset of its own spending, with nothing on the
    screen to say a subset is what it was.
  */
  const rows = await readAll<{
    kind: string;
    amount_rsd: number | null;
    category_id: string | null;
    account_id: string | null;
    budget_id: string | null;
    occurred_on: string;
  }>(
    (lo, hi) =>
      supabase
        .from("money_transactions")
        .select("kind, amount_rsd, category_id, account_id, budget_id, occurred_on")
        .eq("user_id", uid)
        .in("kind", ["expense", "income"])
        .gte("occurred_on", from)
        .lte("occurred_on", to)
        .order("id")
        .range(lo, hi),
    "what the budgets have counted",
  );

  return plans.map((plan) => {
    const window = windows.get(plan.id)!;
    const categoryIds = [...(categoriesOf.get(plan.id) ?? [])];
    const accountIds = [...(accountsOf.get(plan.id) ?? [])];
    const cats = categoriesOf.get(plan.id);
    const accs = accountsOf.get(plan.id);

    let used = 0;
    let entries = 0;
    /*
      How much of `used` is money that also belongs to a budget kept by hand.

      An entry counts in every budget it belongs to — the category it was on and the trip
      it was filed into — which is what the person entering it means and is two true
      statements about one dinar. The one thing that must not happen is the reader adding
      the two cards together and believing the total. So the overlap is measured here and
      named on the card: "54.895 also in na moru", under the bar it explains.

      Only on a sweeping expense budget. On a hand-kept one everything is filed into it by
      definition, and on a savings budget the figure is a balance rather than a ceiling.
    */
    let filed = 0;
    const filedIn = new Set<string>();

    for (const row of rows ?? []) {
      if (row.occurred_on < window.from || row.occurred_on > window.to) continue;
      // Whether it belongs here, and for how much, lives in `budget-match` — three rules
      // that have to agree, kept in one readable place and tested without a database.
      const contribution = contributionOf(plan, row, cats, accs);
      if (contribution === null) continue;
      used += contribution;
      entries += 1;

      if (plan.membership === "all" && plan.kind === "expense" && row.budget_id) {
        filed += contribution;
        const owner = byId.get(row.budget_id);
        if (owner) filedIn.add(owner.name);
      }
    }

    const baseRsd = amountAt(window, changesFor.get(plan.id) ?? [], Number(plan.amount_rsd) || 0);
    const { extra, sources } = boostFor(window, boostsFor.get(plan.id) ?? []);

    /*
      Money that came out of a budget you keep by hand pays for itself.

      The figure above counts it, because it is real spending on this category and hiding
      it made the app say he had spent nothing on eating out in a month he spent 14.737 on
      it. But it was already budgeted once — the trip has its own ceiling and that ceiling
      is what allowed it — so charging it a second time against the ordinary monthly
      allowance is asking the same dinar to fit under two lids.

      So the allowance rises by exactly what was filed. Eating out on 300 a month with
      14.737 filed into `na moru` reads `14.737 of 15.037`: the spending is visible, the
      300 for ordinary dinners is untouched, and when the trip is over both numbers fall
      back on their own.

      This is the automatic half of the same idea `boostFor` does by hand. A hand-set
      raise is for what stays ordinary during a trip — the fuel, the shopping before you
      go — money that never went into the trip's own budget and so is not covered here.
    */
    const covered = Math.round(filed * 100) / 100;

    return {
      plan,
      window,
      categoryIds,
      accountIds,
      used: Math.round(used * 100) / 100,
      entries,
      filed: covered,
      filedIn: [...filedIn],
      baseRsd,
      extra,
      boostedBy: sources,
      limitRsd: baseRsd + extra + covered,
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

  const { data, error } = await supabase
    .from("money_budget_plans")
    .select("*")
    .eq("user_id", uid)
    .eq("archived", false)
    .eq("membership", "added")
    .order("sort", { ascending: true });
  if (error) throw new ReadFailed("this budget", error.message);

  return (data ?? []).filter((plan) => {
    const w = budgetWindow(clockOf(plan), today);
    return today >= w.from && today <= w.to;
  });
});

/**
 * The per-category cap a month should be judged against, from the budgets that exist.
 *
 * The spending breakdown wants one figure per category — "you are 867 over on
 * Groceries" — and a budget does not owe it one: a budget can watch four categories, or
 * none, and run in fortnights. Only one shape answers the question the breakdown asks,
 * and it is exactly the shape the old per-category limits became: one monthly expense
 * budget watching one category. Anything else is left alone, and its own card on the
 * Budgets screen is where it is read.
 *
 * `counted` is the figure to judge against, not the category's total. They differ by the
 * entries you put in a budget by hand: a lunch filed under a holiday is real spending on
 * Eating out and belongs in the breakdown, and is not an overspend against the monthly
 * Eating out budget, because it was never that budget's money.
 */
export async function getCategoryBudgetCaps(
  month: string,
): Promise<Record<string, { limit: number; counted: number }>> {
  // A day inside the month being read, so each budget's own window lands on that month
  // rather than on today's.
  const anchor = `${month}-28`;
  const lines = await getBudgetPlanLines(anchor);

  const caps: Record<string, { limit: number; counted: number }> = {};
  for (const line of lines) {
    const { plan } = line;
    if (plan.membership !== "all" || plan.kind !== "expense") continue;
    if (plan.period !== "month" || plan.period_count !== 1) continue;
    if (line.categoryIds.length !== 1) continue;

    const id = line.categoryIds[0];
    // Two budgets on one category is unusual and adding them is the honest reading:
    // between them that is what you allowed yourself.
    const at = caps[id] ?? { limit: 0, counted: 0 };
    caps[id] = {
      // `limitRsd`, not the plan's own amount: a month with a trip in it is allowed more,
      // and the breakdown has to judge it against the same figure the budget card does.
      limit: at.limit + line.limitRsd,
      counted: at.counted + line.used,
    };
  }
  return caps;
}

/**
 * Every grant on the profile, for the form that edits them.
 *
 * The screen reads these by the budget that *gives* the room, which is the opposite of
 * how `getBudgetPlanLines` uses them — there they are grouped by the budget that
 * receives it. One small table, read whole, rather than two shapes of the same query.
 */
export const getBudgetBoosts = cache(async (): Promise<MoneyBudgetBoost[]> => {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];

  const { data, error } = await supabase
    .from("money_budget_boosts")
    .select("*")
    .eq("user_id", uid);
  if (error) throw new ReadFailed("the extra room one budget grants another", error.message);
  return data ?? [];
});

/** One finished window of a budget, judged by what it actually ran under. */
export type BudgetPast = {
  window: BudgetWindow;
  /** Dinars: spent, for an expense budget; kept, for a savings one. */
  used: number;
  /** What that window was allowed — the amount in force then, plus anything granted to it. */
  limitRsd: number;
  /** The plan's own amount at the time, before any grant. */
  baseRsd: number;
  /** Budgets that raised it, if any. */
  boostedBy: string[];
  /**
   * The window still running.
   *
   * Drawn brighter than the rest and left out of the count, because a month you are three
   * days into is not a month that kept its budget — it is a month that has not finished
   * losing. It is on the strip at all so the comparison has a "you are here": five bars of
   * history with today missing is a chart you have to hold the current figure in your head
   * to read.
   */
  current: boolean;
};

/**
 * How far back the record goes: a year of finished windows plus the one still running.
 *
 * The strip on the card shows the last six of these; the history panel shows all of them.
 * Twelve because the question a record answers is seasonal — "is December always like
 * this" — and six months cannot answer it.
 */
const PAST_WINDOWS = 13;

/**
 * The windows behind the current one, for every budget, each measured by its own rules.
 *
 * The point of showing them is to answer a question one card cannot: is this month
 * unusual, or is this simply what this budget always does. Four of the last six over the
 * line is not an overspend, it is a limit set too low — opposite problems with opposite
 * fixes, and identical on a card that only knows about today.
 *
 * Every figure is worked out the way the current window is: the same membership rules,
 * the same category and account filters, the same exclusivity for entries filed into a
 * budget by hand — and against the amount that was in force at the time rather than
 * today's. A history drawn against today's limit rearranges itself every time you edit
 * the budget, which is worse than no history at all.
 *
 * All budgets in one pass. Six windows for six budgets is thirty-six figures, and doing
 * it per card would be five queries per card for a screen that already had its data.
 */
export const getBudgetHistories = cache(
  async (on?: string): Promise<Record<string, BudgetPast[]>> => {
    const today = on ?? todayISO();
    const supabase = await createClient();
    const uid = await userId(supabase);
    if (!uid) return {};

    const { data: plans, error: capPlansError } = await supabase
      .from("money_budget_plans")
      .select("*")
      .eq("user_id", uid)
      .eq("archived", false);
    if (capPlansError) throw new ReadFailed("the budgets a category is capped by", capPlansError.message);
    if (!plans || plans.length === 0) return {};

    /*
      A budget with fixed dates has one window and therefore no history. Walking back from
      it returns the same window six times, which reads as six identical months.
    */
    const repeating = plans.filter((p) => p.period !== "custom");
    if (repeating.length === 0) return {};

    const windowsOf = new Map<string, BudgetWindow[]>();
    for (const plan of repeating) {
      const clock = clockOf(plan);
      const windows: BudgetWindow[] = [];
      for (let back = PAST_WINDOWS - 1; back >= 0; back -= 1) {
        const window = shiftBudgetWindow(clock, today, -back);
        // Before the budget existed. Nothing was allowed and nothing was measured.
        if (window.to < plan.starts_on) continue;
        if (!windows.some((w) => w.from === window.from)) windows.push(window);
      }
      if (windows.length) windowsOf.set(plan.id, windows);
    }
    if (windowsOf.size === 0) return {};

    const ids = [...windowsOf.keys()];
    const [catRes, accRes, amountRes, boostRes] = await Promise.all([
        supabase
          .from("money_budget_categories")
          .select("budget_id, category_id")
          .in("budget_id", ids),
        supabase.from("money_budget_accounts").select("budget_id, account_id").in("budget_id", ids),
        supabase
          .from("money_budget_amounts")
          .select("budget_id, starts_on, amount_rsd")
          .eq("user_id", uid),
        supabase
          .from("money_budget_boosts")
          .select("source_budget_id, target_budget_id, amount_rsd")
          .eq("user_id", uid),
      ]);
    if (catRes.error) throw new ReadFailed("what those budgets watch", catRes.error.message);
    if (accRes.error)
      throw new ReadFailed("which accounts those budgets watch", accRes.error.message);
    if (amountRes.error)
      throw new ReadFailed("what those budgets were set to", amountRes.error.message);
    if (boostRes.error)
      throw new ReadFailed("the extra room one budget grants another", boostRes.error.message);
    const catLinks = catRes.data;
    const accLinks = accRes.data;
    const amountRows = amountRes.data;
    const boostRows = boostRes.data;

    const catsOf = new Map<string, Set<string>>();
    for (const l of catLinks ?? []) {
      (catsOf.get(l.budget_id) ?? catsOf.set(l.budget_id, new Set()).get(l.budget_id)!).add(
        l.category_id,
      );
    }
    const accsOf = new Map<string, Set<string>>();
    for (const l of accLinks ?? []) {
      (accsOf.get(l.budget_id) ?? accsOf.set(l.budget_id, new Set()).get(l.budget_id)!).add(
        l.account_id,
      );
    }

    const changesOf = new Map<string, AmountChange[]>();
    for (const row of amountRows ?? []) {
      const list = changesOf.get(row.budget_id) ?? [];
      list.push({ starts_on: row.starts_on, amount: Number(row.amount_rsd) || 0 });
      changesOf.set(row.budget_id, list);
    }

    const byId = new Map(plans.map((p) => [p.id, p]));
    const boostsOf = new Map<string, Boost[]>();
    for (const row of boostRows ?? []) {
      const source = byId.get(row.source_budget_id);
      if (!source?.ends_on) continue;
      const list = boostsOf.get(row.target_budget_id) ?? [];
      list.push({
        from: source.starts_on,
        to: source.ends_on,
        amount: Number(row.amount_rsd) || 0,
        source: source.name,
      });
      boostsOf.set(row.target_budget_id, list);
    }

    // One span covering every bar on every strip, rather than a query per budget.
    let from = "9999-12-31";
    let to = "0001-01-01";
    for (const windows of windowsOf.values()) {
      if (windows[0].from < from) from = windows[0].from;
      if (windows[windows.length - 1].to > to) to = windows[windows.length - 1].to;
    }

    /*
      This is the one that was already wrong.

      The strips walk PAST_WINDOWS windows back, and on a yearly budget that is twelve
      years — so the span is the whole ledger: 1.675 entries, of which PostgREST was
      handing back 1.000 and reporting no error. Two entries in five never reached the
      arithmetic, in no defined order, and the strips drew "four of the last six over the
      line" out of whichever thousand arrived. Wrong low, which reads as a good month.
    */
    const rows = await readAll<{
      kind: string;
      amount_rsd: number | null;
      category_id: string | null;
      account_id: string | null;
      budget_id: string | null;
      occurred_on: string;
    }>(
      (lo, hi) =>
        supabase
          .from("money_transactions")
          .select("kind, amount_rsd, category_id, account_id, budget_id, occurred_on")
          .eq("user_id", uid)
          .in("kind", ["expense", "income"])
          .gte("occurred_on", from)
          .lte("occurred_on", to)
          .order("id")
          .range(lo, hi),
      "what those budgets have counted",
    );

    const out: Record<string, BudgetPast[]> = {};
    for (const [planId, windows] of windowsOf) {
      const plan = byId.get(planId)!;
      const cats = catsOf.get(planId);
      const accs = accsOf.get(planId);
      const changes = changesOf.get(planId) ?? [];
      const boosts = boostsOf.get(planId) ?? [];

      out[planId] = windows.map((window) => {
        let used = 0;
        /*
          Same rule as the card: what a hand-kept budget already paid for does not also
          eat the ordinary allowance. Without it here the strip would paint a month red
          that the card on the same screen calls on track.
        */
        let filed = 0;
        for (const row of rows ?? []) {
          if (row.occurred_on < window.from || row.occurred_on > window.to) continue;
          const contribution = contributionOf(plan, row, cats, accs);
          if (contribution === null) continue;
          used += contribution;
          if (plan.membership === "all" && plan.kind === "expense" && row.budget_id) {
            filed += contribution;
          }
        }

        const baseRsd = amountAt(window, changes, Number(plan.amount_rsd) || 0);
        const { extra, sources: boostedBy } = boostFor(window, boosts);
        const covered = Math.round(filed * 100) / 100;

        return {
          window,
          used: Math.round(used * 100) / 100,
          baseRsd,
          limitRsd: baseRsd + extra + covered,
          boostedBy,
          current: today >= window.from && today <= window.to,
        };
      });
    }

    return out;
  },
);



/** One entry a budget counted, in the shape the panel prints it. */
export type BudgetEntry = {
  id: string;
  on: string;
  title: string | null;
  category: string | null;
  /**
   * The budget this entry was filed into by hand, when that is a different budget.
   *
   * On a sweeping budget these are exactly the rows the card's note is about — "14.737
   * covered by na moru" is a claim about specific entries, and this is where you find
   * out which ones. On the hand-kept budget itself every row would carry its own name,
   * which says nothing, so it is left null there.
   */
  filedInto: string | null;
  /** What it contributed, already signed the way this plan reads money. */
  amount: number;
};

/**
 * The entries behind a budget's figure, for the window it is in now.
 *
 * The card says `5.237 of 20.000` and until this existed the app had no answer to
 * "which 5.237" — which is the first question anybody asks about a number they did not
 * expect. The period history answered a different one ("how does this month compare"),
 * and it is not reachable at all until a window has finished.
 *
 * The one rule here is that it must not compute anything. `contributionOf` decides what
 * belongs to a budget everywhere else in the app, so it decides it here too — a list
 * built from its own reading of the same intent is a list that will eventually disagree
 * with the figure above it, and a screen where the total and its own rows disagree is
 * worse than no list.
 */
export async function getBudgetEntries(
  planId: string,
  on?: string,
  /**
   * A span to read instead of the budget's own window.
   *
   * The panel used to be locked to the running period, which is the right default and
   * the wrong only option: "what has this budget actually held all year" is the question
   * the strip of past periods asks in aggregate, and there was no way to ask it entry by
   * entry. Membership is unchanged — the same categories and accounts decide what counts
   * — so widening the dates widens the answer without changing what the question means.
   *
   * Both ends may be empty, which is how "all time" arrives: no bound at all.
   */
  span?: { from: string; to: string },
): Promise<BudgetEntry[]> {
  const today = on ?? todayISO();
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];

  // Scoped by owner as well as by id: a plan id belonging to somebody else finds nothing
  // here rather than finding their ledger.
  const { data: plan, error } = await supabase
    .from("money_budget_plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw new ReadFailed("the entries in this budget", error.message);
  if (!plan) return [];

  const [catRes, accRes] = await Promise.all([
    supabase.from("money_budget_categories").select("category_id").eq("budget_id", plan.id),
    supabase.from("money_budget_accounts").select("account_id").eq("budget_id", plan.id),
  ]);
  if (catRes.error) throw new ReadFailed("what this budget watches", catRes.error.message);
  if (accRes.error) throw new ReadFailed("which accounts this budget watches", accRes.error.message);
  const categories = new Set((catRes.data ?? []).map((l) => l.category_id));
  const accounts = new Set((accRes.data ?? []).map((l) => l.account_id));

  const window = span ?? budgetWindow(clockOf(plan), today);

  /*
    Paged, because the span is no longer bounded by a month.

    Over one window this is a hundred rows and one request. Asked for `All time` on a
    two-year ledger it is the whole thing, and a plain select would hand back the first
    thousand with no error — a panel quietly showing part of a period while its heading
    counts them all.
  */
  const rows = await readAll((lo, hi) => {
    let q = supabase
      .from("money_transactions")
      .select(
        "id, kind, amount_rsd, category_id, account_id, budget_id, occurred_on, title, category:money_categories(name), budget:money_budget_plans!money_transactions_budget_id_fkey(name)",
      )
      .eq("user_id", uid)
      .in("kind", ["expense", "income"]);
    if (window.from) q = q.gte("occurred_on", window.from);
    if (window.to) q = q.lte("occurred_on", window.to);
    return q
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(lo, hi);
  }, "what this budget has counted");

  const out: BudgetEntry[] = [];
  for (const row of rows) {
    const amount = contributionOf(
      { id: plan.id, kind: plan.kind, membership: plan.membership },
      row,
      categories,
      accounts,
    );
    if (amount === null) continue;
    out.push({
      id: row.id,
      on: row.occurred_on,
      title: row.title,
      // PostgREST types an embedded one-to-one as an array; take whichever shape arrives.
      category: (Array.isArray(row.category) ? row.category[0] : row.category)?.name ?? null,
      filedInto:
        row.budget_id && row.budget_id !== plan.id
          ? ((Array.isArray(row.budget) ? row.budget[0] : row.budget)?.name ?? null)
          : null,
      amount,
    });
  }
  return out;
}

