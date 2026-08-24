import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { DEFAULT_RATES, monthKey, monthRange, nextDate, toRsd, type Rates } from "@/lib/money";
import type {
  BudgetLine,
  GoalLine,
  MoneyAccount,
  MoneyBudget,
  MoneyCategory,
  MoneyGoal,
  RecurringRow,
  TransactionRow,
} from "@/lib/types";

/**
 * money_transactions points at money_accounts twice (account_id and to_account_id),
 * so the embed has to name the constraint or PostgREST refuses the whole query.
 * Keep this as ONE string literal — split it and the generated types stop parsing it
 * (tsc then fails with TS2352 / GenericStringError).
 */
const TX_SELECT =
  "*, category:money_categories(name, color, kind), account:money_accounts!money_transactions_account_id_fkey(name, currency), goal:money_goals(name)";

export async function getRates(): Promise<Rates> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_RATES;
  const { data } = await supabase
    .from("profiles")
    .select("rate_eur, rate_usd")
    .eq("id", user.id)
    .maybeSingle();
  return {
    EUR: Number(data?.rate_eur ?? DEFAULT_RATES.EUR) || DEFAULT_RATES.EUR,
    USD: Number(data?.rate_usd ?? DEFAULT_RATES.USD) || DEFAULT_RATES.USD,
  };
}

export async function getAccounts(includeArchived = false): Promise<MoneyAccount[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  let q = supabase
    .from("money_accounts")
    .select("*")
    .eq("user_id", uid)
    .order("sort")
    .order("created_at");
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return data ?? [];
}

export async function getCategories(includeArchived = false): Promise<MoneyCategory[]> {
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
  const { data } = await q;
  return data ?? [];
}

export async function getBudgets(): Promise<MoneyBudget[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data } = await supabase.from("money_budgets").select("*").eq("user_id", uid);
  return data ?? [];
}

export async function getRecurring(): Promise<RecurringRow[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase
    .from("money_recurring")
    .select("*, category:money_categories(name, color), account:money_accounts!money_recurring_account_id_fkey(name)")
    .eq("user_id", uid)
    .order("next_on");
  if (error) console.error("getRecurring:", error.message);
  return (data ?? []) as RecurringRow[];
}

/** Active recurring items that are due today or overdue — and not past their end date. */
export async function getDueRecurring(): Promise<RecurringRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const all = await getRecurring();
  return all.filter(
    (r) =>
      r.active &&
      r.next_on <= today &&
      (r.ends_on == null || r.next_on <= r.ends_on) &&
      (r.installments_total == null || r.installments_done < r.installments_total),
  );
}

export type RecurringTotals = {
  /** RSD in an average month — weekly and yearly items normalised. */
  expense: number;
  income: number;
  net: number;
  /** Variable items counted from their own past bookings rather than a set amount. */
  estimated: number;
  /** Variable items with no history yet — nothing to estimate from, so they are left out. */
  unknown: number;
  /** RSD actually falling due in the next 12 months, occurrence by occurrence. */
  yearExpense: number;
  yearIncome: number;
  yearCount: number;
  /** The date that window closes on — computed server-side so the UI never disagrees. */
  yearHorizon: string;
};

/** Weekly and yearly items normalised to a month so one number can be compared. */
const PER_MONTH: Record<string, number> = { week: 52 / 12, month: 1, year: 1 / 12 };

export type Occurrence = {
  id: string;
  name: string;
  kind: string;
  on: string;
  /** RSD. */
  amount: number;
  /** True when the amount is the average of past bookings rather than a set figure. */
  estimated: boolean;
  category: string | null;
  color: string | null;
};

/** Guard against a runaway walk if an item ever ends up with a nonsense date. */
const MAX_STEPS = 400;

/**
 * Every date a recurring item actually falls due between today and `days` ahead,
 * respecting the instalments left and the end date. This is what makes a four-month
 * credit count four times in a yearly total instead of twelve.
 */
export function occurrencesFor(
  item: RecurringRow,
  amount: number,
  estimated: boolean,
  horizon: string,
): Occurrence[] {
  if (!item.active) return [];

  const left =
    item.installments_total == null
      ? Infinity
      : Math.max(0, item.installments_total - (item.installments_done ?? 0));
  if (left === 0) return [];

  const out: Occurrence[] = [];
  let on = item.next_on;

  for (let step = 0; step < MAX_STEPS && out.length < left && on <= horizon; step++) {
    if (item.ends_on != null && on > item.ends_on) break;
    out.push({
      id: item.id,
      name: item.name,
      kind: item.kind,
      on,
      amount,
      estimated,
      category: item.category?.name ?? null,
      color: item.category?.color ?? null,
    });
    on = nextDate(on, item.every);
  }

  return out;
}

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
      net: 0,
      estimated: 0,
      unknown: 0,
      yearExpense: 0,
      yearIncome: 0,
      yearCount: 0,
      yearHorizon: horizon,
    };
  }

  const [items, rates, { data: history }] = await Promise.all([
    getRecurring(),
    getRates(),
    supabase
      .from("money_transactions")
      .select("recurring_id, amount_rsd, occurred_on")
      .eq("user_id", uid)
      .not("recurring_id", "is", null)
      .order("occurred_on", { ascending: false }),
  ]);

  const past = new Map<string, number[]>();
  for (const row of history ?? []) {
    if (!row.recurring_id) continue;
    const seen = past.get(row.recurring_id) ?? [];
    if (seen.length < 6) {
      seen.push(Number(row.amount_rsd) || 0);
      past.set(row.recurring_id, seen);
    }
  }

  let expense = 0;
  let income = 0;
  let estimated = 0;
  let unknown = 0;
  let yearExpense = 0;
  let yearIncome = 0;
  let yearCount = 0;

  for (const item of items) {
    if (!item.active) continue;
    if (item.installments_total != null && item.installments_done >= item.installments_total) continue;
    if (item.ends_on != null && item.next_on > item.ends_on) continue;

    const factor = PER_MONTH[item.every] ?? 1;
    let each: number;
    let isEstimate = false;

    if (item.variable || !(Number(item.amount) > 0)) {
      const seen = past.get(item.id) ?? [];
      if (seen.length === 0) {
        unknown++;
        continue;
      }
      estimated++;
      isEstimate = true;
      each = seen.reduce((sum, n) => sum + n, 0) / seen.length;
    } else {
      each = toRsd(Number(item.amount), item.currency, rates);
    }

    const monthly = each * factor;
    if (item.kind === "income") income += monthly;
    else expense += monthly;

    // The same item walked date by date — this is where a four-instalment credit
    // stops pretending it runs all year.
    const dates = occurrencesFor(item, each, isEstimate, horizon);
    yearCount += dates.length;
    const sum = each * dates.length;
    if (item.kind === "income") yearIncome += sum;
    else yearExpense += sum;
  }

  return {
    expense,
    income,
    net: income - expense,
    estimated,
    unknown,
    yearExpense,
    yearIncome,
    yearCount,
    yearHorizon: horizon,
  };
}

export type ForecastWindow = {
  days: number;
  expense: number;
  income: number;
  net: number;
  count: number;
};

export type ForecastLine = Occurrence & {
  /** What the accounts hold after this one is paid, starting from today's balance. */
  balance: number;
};

export type Forecast = {
  from: string;
  startingBalance: number;
  windows: ForecastWindow[];
  lines: ForecastLine[];
  estimated: number;
  unknown: number;
};

/**
 * What is coming and what it leaves behind. Every recurring item is walked date by
 * date over the longest window, sorted into one timeline, and the account balance is
 * carried down it — the point being to see the week where the credit, the electricity
 * and the hosting all land together, before it happens rather than after.
 */
export async function getForecast(windows: number[] = [30, 60, 90]): Promise<Forecast> {
  const supabase = await createClient();

  const longest = Math.max(...windows);
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const from = today.toISOString().slice(0, 10);
  const horizonDate = new Date(today);
  horizonDate.setUTCDate(horizonDate.getUTCDate() + longest);
  const horizon = horizonDate.toISOString().slice(0, 10);

  const uid = await userId(supabase);
  if (!uid) {
    return {
      from,
      startingBalance: 0,
      windows: windows
        .slice()
        .sort((a, b) => a - b)
        .map((days) => ({ days, expense: 0, income: 0, net: 0, count: 0 })),
      lines: [],
      estimated: 0,
      unknown: 0,
    };
  }

  const [items, rates, balances, { data: history }] = await Promise.all([
    getRecurring(),
    getRates(),
    getAccountBalances(),
    supabase
      .from("money_transactions")
      .select("recurring_id, amount_rsd, occurred_on")
      .eq("user_id", uid)
      .not("recurring_id", "is", null)
      .order("occurred_on", { ascending: false }),
  ]);

  const past = new Map<string, number[]>();
  for (const row of history ?? []) {
    if (!row.recurring_id) continue;
    const seen = past.get(row.recurring_id) ?? [];
    if (seen.length < 6) {
      seen.push(Number(row.amount_rsd) || 0);
      past.set(row.recurring_id, seen);
    }
  }

  const dayOf = (iso: string) =>
    Math.round((Date.parse(`${iso}T00:00:00Z`) - today.getTime()) / 86_400_000);

  let estimated = 0;
  let unknown = 0;
  const all: Occurrence[] = [];

  for (const item of items) {
    if (!item.active) continue;

    let each: number;
    let isEstimate = false;

    if (item.variable || !(Number(item.amount) > 0)) {
      const seen = past.get(item.id) ?? [];
      if (seen.length === 0) {
        unknown++;
        continue;
      }
      estimated++;
      isEstimate = true;
      each = seen.reduce((sum, n) => sum + n, 0) / seen.length;
    } else {
      each = toRsd(Number(item.amount), item.currency, rates);
    }

    all.push(...occurrencesFor(item, each, isEstimate, horizon));
  }

  all.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.name.localeCompare(b.name)));

  const startingBalance = balances.reduce((sum, a) => sum + a.balance, 0);
  let running = startingBalance;
  const lines: ForecastLine[] = all.map((o) => {
    running += o.kind === "income" ? o.amount : -o.amount;
    return { ...o, balance: running };
  });

  const totals = windows
    .slice()
    .sort((a, b) => a - b)
    .map((days) => {
      const inWindow = all.filter((o) => dayOf(o.on) <= days);
      const expense = inWindow
        .filter((o) => o.kind !== "income")
        .reduce((sum, o) => sum + o.amount, 0);
      const income = inWindow
        .filter((o) => o.kind === "income")
        .reduce((sum, o) => sum + o.amount, 0);
      return { days, expense, income, net: income - expense, count: inWindow.length };
    });

  return { from, startingBalance, windows: totals, lines, estimated, unknown };
}

export type TxFilter = {
  month?: string;
  categoryId?: string;
  accountId?: string;
  kind?: string;
  limit?: number;
};

export async function getTransactions(filter: TxFilter = {}): Promise<TransactionRow[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  let q = supabase.from("money_transactions").select(TX_SELECT).eq("user_id", uid);

  if (filter.month) {
    const { from, to } = monthRange(filter.month);
    q = q.gte("occurred_on", from).lte("occurred_on", to);
  }
  if (filter.categoryId) q = q.eq("category_id", filter.categoryId);
  if (filter.accountId) q = q.eq("account_id", filter.accountId);
  if (filter.kind) q = q.eq("kind", filter.kind);

  q = q.order("occurred_on", { ascending: false }).order("created_at", { ascending: false });
  if (filter.limit) q = q.limit(filter.limit);

  const { data, error } = await q;
  if (error) console.error("getTransactions:", error.message);
  return (data ?? []) as TransactionRow[];
}

export async function getTransaction(id: string): Promise<TransactionRow | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data, error } = await supabase
    .from("money_transactions")
    .select(TX_SELECT)
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) console.error("getTransaction:", error.message);
  return (data as TransactionRow | null) ?? null;
}

export type MonthSummary = {
  month: string;
  expense: number;
  income: number;
  saved: number;
  net: number;
  byCategory: { id: string; spent: number }[];
};

export async function getMonthSummary(month = monthKey()): Promise<MonthSummary> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) {
    return { month, expense: 0, income: 0, saved: 0, net: 0, byCategory: [] };
  }

  const { from, to } = monthRange(month);
  const { data } = await supabase
    .from("money_transactions")
    .select("kind, amount_rsd, category_id")
    .eq("user_id", uid)
    .gte("occurred_on", from)
    .lte("occurred_on", to);

  const rows = data ?? [];
  const spentBy = new Map<string, number>();
  let expense = 0;
  let income = 0;
  let saved = 0;

  for (const r of rows) {
    const value = Number(r.amount_rsd) || 0;
    if (r.kind === "expense") {
      expense += value;
      if (r.category_id) spentBy.set(r.category_id, (spentBy.get(r.category_id) ?? 0) + value);
    } else if (r.kind === "income") {
      income += value;
    } else if (r.kind === "saving") {
      saved += value;
    }
  }

  return {
    month,
    expense,
    income,
    saved,
    net: income - expense - saved,
    byCategory: [...spentBy].map(([id, spent]) => ({ id, spent })),
  };
}

/** Categories joined with their monthly limit and this month's spend. */
export async function getBudgetLines(month = monthKey()): Promise<BudgetLine[]> {
  const [categories, budgets, summary] = await Promise.all([
    getCategories(),
    getBudgets(),
    getMonthSummary(month),
  ]);
  const limitBy = new Map(budgets.map((b) => [b.category_id, Number(b.amount_rsd) || 0]));
  const spentBy = new Map(summary.byCategory.map((c) => [c.id, c.spent]));

  return categories
    .filter((c) => c.kind === "expense")
    .map((category) => ({
      category,
      limit: limitBy.get(category.id) ?? 0,
      spent: spentBy.get(category.id) ?? 0,
    }));
}

export async function getGoalLines(): Promise<GoalLine[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const [{ data: goals }, { data: contributions }] = await Promise.all([
    supabase
      .from("money_goals")
      .select("*")
      .eq("user_id", uid)
      .eq("archived", false)
      .order("created_at"),
    supabase
      .from("money_transactions")
      .select("goal_id, amount_rsd")
      .eq("user_id", uid)
      .eq("kind", "saving"),
  ]);

  const savedBy = new Map<string, number>();
  for (const c of contributions ?? []) {
    if (!c.goal_id) continue;
    savedBy.set(c.goal_id, (savedBy.get(c.goal_id) ?? 0) + (Number(c.amount_rsd) || 0));
  }

  return (goals ?? []).map((g: MoneyGoal) => ({ ...g, saved: savedBy.get(g.id) ?? 0 }));
}

export type AccountBalance = MoneyAccount & { balance: number };

/** Balances in RSD: opening balance converted at today's rate, then every movement. */
export async function getAccountBalances(): Promise<AccountBalance[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const [accounts, rates, { data: rows }] = await Promise.all([
    getAccounts(),
    getRates(),
    supabase
      .from("money_transactions")
      .select("kind, amount_rsd, account_id, to_account_id")
      .eq("user_id", uid),
  ]);

  const delta = new Map<string, number>();
  const bump = (id: string | null, value: number) => {
    if (!id) return;
    delta.set(id, (delta.get(id) ?? 0) + value);
  };

  for (const r of rows ?? []) {
    const value = Number(r.amount_rsd) || 0;
    if (r.kind === "income") bump(r.account_id, value);
    else if (r.kind === "transfer") {
      bump(r.account_id, -value);
      bump(r.to_account_id, value);
    } else bump(r.account_id, -value); // expense, saving
  }

  return accounts.map((a) => ({
    ...a,
    balance: toRsd(Number(a.opening_balance) || 0, a.currency, rates) + (delta.get(a.id) ?? 0),
  }));
}

/** Last 6 months of expense totals — the little trend bar on the overview. */
export async function getExpenseTrend(months = 6): Promise<{ month: string; expense: number }[]> {
  const supabase = await createClient();
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - (months - 1), 1))
    .toISOString()
    .slice(0, 10);

  const totals = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    totals.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, 0);
  }

  const uid = await userId(supabase);
  // Same shape this returns when the window holds no expenses: every month at zero.
  if (!uid) return [...totals].map(([month, expense]) => ({ month, expense }));

  const { data } = await supabase
    .from("money_transactions")
    .select("occurred_on, amount_rsd, kind")
    .eq("user_id", uid)
    .gte("occurred_on", start)
    .eq("kind", "expense");

  for (const r of data ?? []) {
    const key = String(r.occurred_on).slice(0, 7);
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + (Number(r.amount_rsd) || 0));
  }
  return [...totals].map(([month, expense]) => ({ month, expense }));
}

export async function getGoals(): Promise<MoneyGoal[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data } = await supabase
    .from("money_goals")
    .select("*")
    .eq("user_id", uid)
    .eq("archived", false)
    .order("created_at");
  return data ?? [];
}
