/**
 * The plain reads the rest of the money module is built on: rates, accounts,
 * categories, budgets, rules, planned items — plus the two helpers that turn a rule
 * into an amount.
 *
 * Everything here is one query and no arithmetic worth the name. The modules beside
 * it do the thinking; this one only fetches.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { todayISO } from "@/lib/format";
import { DEFAULT_RATES, toRsd, type Rates } from "@/lib/money";
import type { Booking } from "@/lib/money/occurrences";
import type {
  MoneyAccount,
  MoneyBudget,
  MoneyCategory,
  PlannedRow,
  RecurringRow,
} from "@/lib/types";

/**
 * money_transactions points at money_accounts twice (account_id and to_account_id),
 * so the embed has to name the constraint or PostgREST refuses the whole query.
 * Keep this as ONE string literal — split it and the generated types stop parsing it
 * (tsc then fails with TS2352 / GenericStringError).
 */
/*
  What every screen that lists an entry needs to know about it.

  `budget` joined last, and it is the one that was missing. An entry filed into a budget
  by hand is deliberately kept out of every standing budget — that is what makes a
  holiday a holiday — and no list in the app said so. So 54.895 sat under Eating out in
  the breakdown while the monthly Eating out budget read `0 of 3`, and the two together
  look exactly like a screen putting the money somewhere else. The filing is a fact about
  the entry; the row it lives on is where it belongs.
*/
export const TX_SELECT =
  "*, category:money_categories(name, color, kind), account:money_accounts!money_transactions_account_id_fkey(name, currency), goal:money_goals(name), budget:money_budget_plans!money_transactions_budget_id_fkey(name)";

export const getRates = cache(async (): Promise<Rates> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_RATES;
  const { data, error } = await supabase
    .from("profiles")
    .select("rate_eur, rate_usd")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new ReadFailed("your exchange rates", error.message);
  return {
    EUR: Number(data?.rate_eur ?? DEFAULT_RATES.EUR) || DEFAULT_RATES.EUR,
    USD: Number(data?.rate_usd ?? DEFAULT_RATES.USD) || DEFAULT_RATES.USD,
  };
});

export const getAccounts = cache(async (includeArchived = false): Promise<MoneyAccount[]> => {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  // The default first, and every form that reaches for `accounts[0]` gets it without
  // having to know the flag exists.
  let q = supabase
    .from("money_accounts")
    .select("*")
    .eq("user_id", uid)
    .order("is_default", { ascending: false })
    .order("sort")
    .order("created_at");
  if (!includeArchived) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) throw new ReadFailed("your accounts", error.message);
  return data ?? [];
});

export const getCategories = cache(async (includeArchived = false): Promise<MoneyCategory[]> => {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  let q = supabase
    .from("money_categories")
    .select("*")
    .eq("user_id", uid)
    .order("kind")
    .order("sort")
    .order("name");
  if (!includeArchived) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) throw new ReadFailed("your categories", error.message);
  return data ?? [];
});

export async function getBudgets(): Promise<MoneyBudget[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase.from("money_budgets").select("*").eq("user_id", uid);
  if (error) throw new ReadFailed("your budgets", error.message);
  return data ?? [];
}

/*
  Cached for the length of one request.

  Three separate readers on the overview ask for the rules — what is due, what is due
  soon, and what the forecast needs — and each was fetching the same rows plus the same
  goals lookup behind them. React's `cache` collapses that to one round trip without
  any caller having to know the others exist.
*/
export const getRecurring = cache(async (): Promise<RecurringRow[]> => {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  // money_recurring.goal_id has no declared relationship in the generated types, so the
  // goal is looked up separately rather than embedded — an embed the types do not know
  // about is what makes PostgREST hand back an error object instead of rows.
  const [{ data, error }, { data: goals, error: goalsError }] = await Promise.all([
    supabase
      .from("money_recurring")
      .select(
        "*, category:money_categories(name, color), account:money_accounts!money_recurring_account_id_fkey(name)",
      )
      .eq("user_id", uid)
      .order("next_on"),
    supabase.from("money_goals").select("id, name, color").eq("user_id", uid),
  ]);
  if (error) throw new ReadFailed("your repeating entries", error.message);
  if (goalsError) throw new ReadFailed("your goals", goalsError.message);

  const goalBy = new Map((goals ?? []).map((g) => [g.id, { name: g.name, color: g.color }]));
  return (data ?? []).map((row) => ({
    ...row,
    goal: row.goal_id ? (goalBy.get(row.goal_id) ?? null) : null,
  })) as RecurringRow[];
});

/* ----------------------------------------------------------------- planned */

/** money_planned points at money_accounts once, so the embed needs no constraint name. */
const PLANNED_SELECT = "*, category:money_categories(name, color), account:money_accounts(name)";

/**
 * One-off dated things that are known about: the dentist bill, the tax payment, the
 * invoice landing on the 20th. Settled ones are left out by default — from the moment
 * a plan becomes a real entry, the entry is what carries the money.
 */
export async function getPlanned(includeSettled = false): Promise<PlannedRow[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  let q = supabase.from("money_planned").select(PLANNED_SELECT).eq("user_id", uid);
  if (!includeSettled) q = q.is("settled_at", null);
  const { data, error } = await q.order("due_on").order("created_at");
  if (error) throw new ReadFailed("what you have planned", error.message);
  return (data ?? []) as PlannedRow[];
}

/** Planned items that have come due and have not been dealt with either way. */
export async function getPlannedDue(): Promise<PlannedRow[]> {
  const today = todayISO();
  const all = await getPlanned();
  return all.filter((p) => p.due_on <= today);
}

/** Active recurring items that are due today or overdue — and not past their end date. */
export async function getDueRecurring(): Promise<RecurringRow[]> {
  const today = todayISO();
  const all = await getRecurring();
  return all.filter(
    (r) =>
      r.active &&
      r.next_on <= today &&
      (r.ends_on == null || r.next_on <= r.ends_on) &&
      (r.installments_total == null || r.installments_done < r.installments_total),
  );
}

/* ------------------------------------------------------------- estimating */

/** How many past bookings a variable rule is estimated from. */
export const ESTIMATE_FROM = 6;

/*
  The paging rule lives in `@/lib/money/paging`, not here.

  This file's own header says it "only fetches" and the vitest config says the tests
  cover pure logic because "everything that talks to Supabase is one query and a ?? []".
  Both were true and together they are how the 1.000-row cap went unnoticed: the bug was
  inside the one thing nobody thought was logic. Reading every page IS arithmetic — an
  offset, a stop condition, an ordering requirement — so it sits where arithmetic is
  tested, and this module just uses it.
*/
// Imported as well as re-exported: a bare `export ... from` forwards the name without
// binding it in this module, and `recentBookings` below is one of its callers.
import { readAll } from "@/lib/money/paging";
import { ReadFailed } from "@/lib/data/must";
export { readAll };

export type PastBookings = Map<string, Booking[]>;

/** The last few bookings of every rule, newest first — what an estimate is made of. */
export async function recentBookings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  uid: string,
): Promise<PastBookings> {
  const data = await readAll(
    (from, to) =>
      supabase
        .from("money_transactions")
        .select("recurring_id, amount_rsd, occurred_on")
        .eq("user_id", uid)
        .not("recurring_id", "is", null)
        .order("occurred_on", { ascending: false })
        .order("id")
        .range(from, to),
    "the entries booked recently",
  );

  const past: PastBookings = new Map();
  for (const row of data) {
    if (!row.recurring_id) continue;
    const seen = past.get(row.recurring_id) ?? [];
    if (seen.length < ESTIMATE_FROM) {
      seen.push({ on: String(row.occurred_on), amount: Number(row.amount_rsd) || 0 });
      past.set(row.recurring_id, seen);
    }
  }
  return past;
}

/**
 * What one occurrence of a rule costs, in RSD. A fixed rule contributes its amount;
 * a variable one the average of its last bookings, which is the only honest guess
 * available — and it carries those bookings with it so the guess can be inspected.
 * Null means there is nothing to go on, so the rule is left out entirely.
 */
export function estimateFor(
  item: RecurringRow,
  past: PastBookings,
  rates: Rates,
): { each: number; estimated: boolean; samples: Booking[] } | null {
  if (item.variable || !(Number(item.amount) > 0)) {
    const seen = past.get(item.id) ?? [];
    if (seen.length === 0) return null;
    return {
      each: seen.reduce((sum, b) => sum + b.amount, 0) / seen.length,
      estimated: true,
      samples: seen,
    };
  }
  return { each: toRsd(Number(item.amount), item.currency, rates), estimated: false, samples: [] };
}

