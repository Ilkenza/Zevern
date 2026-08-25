import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import {
  DEFAULT_RATES,
  monthKey,
  monthRange,
  nextDate,
  shiftMonth,
  toRsd,
  type Rates,
} from "@/lib/money";
import type {
  BudgetLine,
  GoalEntry,
  GoalLine,
  MoneyAccount,
  MoneyBudget,
  MoneyCategory,
  MoneyGoal,
  PlannedRow,
  RecurringRow,
  SpendingBasis,
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
  // money_recurring.goal_id has no declared relationship in the generated types, so the
  // goal is looked up separately rather than embedded — an embed the types do not know
  // about is what makes PostgREST hand back an error object instead of rows.
  const [{ data, error }, { data: goals }] = await Promise.all([
    supabase
      .from("money_recurring")
      .select(
        "*, category:money_categories(name, color), account:money_accounts!money_recurring_account_id_fkey(name)",
      )
      .eq("user_id", uid)
      .order("next_on"),
    supabase.from("money_goals").select("id, name, color").eq("user_id", uid),
  ]);
  if (error) console.error("getRecurring:", error.message);

  const goalBy = new Map((goals ?? []).map((g) => [g.id, { name: g.name, color: g.color }]));
  return (data ?? []).map((row) => ({
    ...row,
    goal: row.goal_id ? (goalBy.get(row.goal_id) ?? null) : null,
  })) as RecurringRow[];
}

/** True when this rule puts money aside rather than paying a bill. */
export function feedsGoal(item: { goal_id: string | null }): boolean {
  return item.goal_id != null;
}

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
  if (error) console.error("getPlanned:", error.message);
  return (data ?? []) as PlannedRow[];
}

/** Planned items that have come due and have not been dealt with either way. */
export async function getPlannedDue(): Promise<PlannedRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const all = await getPlanned();
  return all.filter((p) => p.due_on <= today);
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

/** Weekly and yearly items normalised to a month so one number can be compared. */
const PER_MONTH: Record<string, number> = { week: 52 / 12, month: 1, year: 1 / 12 };

/** How many past bookings a variable rule is estimated from. */
export const ESTIMATE_FROM = 6;

/** One past booking of a rule — what an estimate is actually made of. */
export type Booking = { on: string; amount: number };

/**
 * What each line of the timeline is: a rule falling due, a one-off that was planned,
 * or the everyday spending nobody enters one by one. The first two are dated facts;
 * the third is a projection, and the screen has to be able to tell them apart.
 */
export type OccurrenceSource = "recurring" | "planned" | "everyday";

export type Occurrence = {
  /** The row this came from: a rule, a planned item, or the projection itself. */
  id: string;
  source: OccurrenceSource;
  name: string;
  /** "expense" or "income" — what the rule books. A goal rule books a saving. */
  kind: string;
  on: string;
  /** RSD. */
  amount: number;
  /** True when the amount is the average of past bookings rather than a set figure. */
  estimated: boolean;
  category: string | null;
  color: string | null;
  /** The goal this one feeds, when it is a standing order rather than a bill. */
  goal: string | null;
  /**
   * The bookings an estimate was averaged from, newest first — empty for anything
   * that is not an estimate. Carried down to the row so an average can be checked
   * against the readings behind it rather than taken on trust.
   */
  samples: Booking[];
  /** Everyday lines only: how many days of spending this one stands for. */
  days: number;
};

type PastBookings = Map<string, Booking[]>;

/** The last few bookings of every rule, newest first — what an estimate is made of. */
async function recentBookings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  uid: string,
): Promise<PastBookings> {
  const { data } = await supabase
    .from("money_transactions")
    .select("recurring_id, amount_rsd, occurred_on")
    .eq("user_id", uid)
    .not("recurring_id", "is", null)
    .order("occurred_on", { ascending: false });

  const past: PastBookings = new Map();
  for (const row of data ?? []) {
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
function estimateFor(
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
  samples: Booking[] = [],
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
      source: "recurring",
      name: item.name,
      kind: item.kind,
      on,
      amount,
      estimated,
      category: item.category?.name ?? null,
      // A goal rule has no category — its colour is the goal's, so it reads on the
      // timeline the same way it reads on the goals screen.
      color: item.goal?.color ?? item.category?.color ?? null,
      goal: item.goal?.name ?? null,
      samples,
      days: 0,
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

  const [items, rates, past] = await Promise.all([
    getRecurring(),
    getRates(),
    recentBookings(supabase, uid),
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

    const factor = PER_MONTH[item.every] ?? 1;
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
    const dates = occurrencesFor(item, each, isEstimate, horizon);
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

/* -------------------------------------------------------- everyday spending */

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

const NO_SPENDING: SpendingProjection = {
  basis: "off",
  monthly: 0,
  spentThisMonth: 0,
  ready: true,
  months: [],
  categories: [],
  budgeted: [],
};

/** The middle of a list — the mean of the two middles when there is no single one. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

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

export type ForecastWindow = {
  days: number;
  /** Bills only. What goes into goals is counted on its own. */
  expense: number;
  income: number;
  saving: number;
  /** Everyday spending projected over the window — not a dated fact, an estimate. */
  everyday: number;
  /** What the window does to the free balance: income less bills, savings and living. */
  net: number;
  count: number;
};

export type ForecastLine = Occurrence & {
  /** What is left free after this one lands, starting from today's free balance. */
  balance: number;
};

export type Forecast = {
  from: string;
  /**
   * Where the running balance starts: the free money, not the total. Money already
   * put aside for a goal cannot pay a bill, so a forecast that started from the total
   * would promise headroom that is spoken for.
   */
  startingBalance: number;
  /** The two halves of that, so the screen can show the split and have it add up. */
  onAccounts: number;
  reserved: number;
  windows: ForecastWindow[];
  lines: ForecastLine[];
  estimated: number;
  unknown: number;
  /** How the everyday line was worked out — the screen shows it and can change it. */
  spending: SpendingProjection;
  /** How many one-off planned items fall inside the window. */
  planned: number;
};

/** One day on from a plain date, in UTC — the walk the everyday line is spread over. */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Guard against a runaway month walk if a horizon ever comes back nonsense. */
const MAX_MONTHS = 24;

/**
 * What is coming and what it leaves behind. Three things land on one line: every
 * recurring rule walked date by date, every one-off that has been planned and not yet
 * dealt with, and the everyday spending nobody enters one item at a time. The free
 * balance is carried down the lot — the point being to see the week where the credit,
 * the electricity and the hosting all land together, before it happens rather than
 * after.
 *
 * A standing order into a goal counts as an outflow here even though the money stays
 * on the account: from the day it books, it is reserved, and this line is about what
 * can still be spent.
 *
 * The everyday figure is spread across the days it covers rather than dropped as one
 * lump, so the balance beside a bill on the 12th already carries the twelve days of
 * living that came before it. Every one of those lines is marked as a projection; the
 * other two kinds are dated facts.
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
      onAccounts: 0,
      reserved: 0,
      windows: windows
        .slice()
        .sort((a, b) => a - b)
        .map((days) => ({
          days,
          expense: 0,
          income: 0,
          saving: 0,
          everyday: 0,
          net: 0,
          count: 0,
        })),
      lines: [],
      estimated: 0,
      unknown: 0,
      spending: NO_SPENDING,
      planned: 0,
    };
  }

  const [items, planned, rates, onHand, past, spending] = await Promise.all([
    getRecurring(),
    getPlanned(),
    getRates(),
    getOnHand(),
    recentBookings(supabase, uid),
    getSpendingProjection(),
  ]);

  const dayOf = (iso: string) =>
    Math.round((Date.parse(`${iso}T00:00:00Z`) - today.getTime()) / 86_400_000);

  let estimated = 0;
  let unknown = 0;
  const all: Occurrence[] = [];

  for (const item of items) {
    if (!item.active) continue;

    const reading = estimateFor(item, past, rates);
    if (reading === null) {
      unknown++;
      continue;
    }
    if (reading.estimated) estimated++;

    all.push(
      ...occurrencesFor(item, reading.each, reading.estimated, horizon, reading.samples),
    );
  }

  // A planned item is a dated fact that has not happened yet. Once it settles it is
  // an entry in the ledger and leaves this list, so it is never counted twice.
  // How much everyday room each budgeted category still has after its standing rules.
  // A planned item can only take back what its own category was actually contributing.
  const roomBy = new Map(
    spending.categories.map((c) => [c.id, Math.max(c.limit - c.recurring, 0)]),
  );
  const budgeted = new Set(spending.budgeted);
  const plannedInBudget = new Map<string, Map<string, number>>();
  let plannedCount = 0;

  for (const p of planned) {
    if (p.due_on > horizon) continue;
    plannedCount++;
    const amount = toRsd(Number(p.amount) || 0, p.currency, rates);
    all.push({
      id: p.id,
      source: "planned",
      name: p.name,
      kind: p.kind === "income" ? "income" : "expense",
      on: p.due_on,
      amount,
      estimated: false,
      category: p.category?.name ?? null,
      color: p.category?.color ?? null,
      goal: null,
      samples: [],
      days: 0,
    });

    // Its category already carries a limit, and the everyday figure is built out of
    // those limits — so this month's projection has to give the amount back.
    if (p.kind !== "income" && p.category_id && budgeted.has(p.category_id)) {
      const month = p.due_on.slice(0, 7);
      const per = plannedInBudget.get(month) ?? new Map<string, number>();
      per.set(p.category_id, (per.get(p.category_id) ?? 0) + amount);
      plannedInBudget.set(month, per);
    }
  }

  /** What a month's projection owes back to the planned items already on the line. */
  const givenBack = (month: string): number => {
    const per = plannedInBudget.get(month);
    if (!per) return 0;
    let total = 0;
    // Never more than the category was contributing: a 30.000 dentist bill against a
    // 5.000 health limit takes 5.000 off the projection, not 30.000.
    for (const [category, amount] of per) total += Math.min(amount, roomBy.get(category) ?? 0);
    return total;
  };

  // What a day of ordinary living costs, month by month. The current month counts
  // only the days still to come, and only what is left of its figure — the part
  // already spent is on the accounts the balance starts from.
  const dailyRate = new Map<string, number>();
  if (spending.monthly > 0) {
    let month = from.slice(0, 7);
    const lastMonth = horizon.slice(0, 7);
    for (let step = 0; step <= MAX_MONTHS && month <= lastMonth; step++) {
      const daysInMonth = Number(monthRange(month).to.slice(8, 10));
      let figure = Math.max(spending.monthly - givenBack(month), 0);
      let over = daysInMonth;
      if (month === from.slice(0, 7)) {
        figure = Math.max(figure - spending.spentThisMonth, 0);
        over = daysInMonth - Number(from.slice(8, 10));
      }
      dailyRate.set(month, over > 0 ? figure / over : 0);
      month = shiftMonth(month, 1);
    }
  }

  // Running total of everyday spending from today up to and including each day, so
  // the spend between any two dates is one subtraction.
  const upTo = new Map<string, number>();
  let accrued = 0;
  for (let day = nextDay(from); day <= horizon; day = nextDay(day)) {
    accrued += dailyRate.get(day.slice(0, 7)) ?? 0;
    upTo.set(day, accrued);
  }

  // The everyday line is cut at every date that has to be right: where something real
  // falls due, where a month ends, and where each window closes. Nothing straddles a
  // boundary, so every total on the screen is the sum of the lines above it.
  if (accrued > 0) {
    const stops = new Set<string>();
    for (const o of all) if (o.on > from && o.on <= horizon) stops.add(o.on);
    for (const day of upTo.keys()) {
      if (day === horizon || day.slice(0, 7) !== nextDay(day).slice(0, 7)) stops.add(day);
    }
    for (const days of windows) {
      const edge = [...upTo.keys()][days - 1];
      if (edge) stops.add(edge);
    }

    let previous = from;
    for (const stop of [...stops].sort()) {
      const amount = (upTo.get(stop) ?? 0) - (upTo.get(previous) ?? 0);
      const days = Math.round(
        (Date.parse(`${stop}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / 86_400_000,
      );
      if (amount > 0 && days > 0) {
        all.push({
          id: `everyday-${stop}`,
          source: "everyday",
          name: "Everyday spending",
          kind: "expense",
          on: stop,
          amount,
          estimated: true,
          category: null,
          color: null,
          goal: null,
          samples: [],
          days,
        });
      }
      previous = stop;
    }
  }

  // Same date: the days of living come before the bill they lead up to, so the
  // balance printed beside the bill is what is actually left after paying it.
  const rank = (o: Occurrence) => (o.source === "everyday" ? 0 : 1);
  all.sort((a, b) =>
    a.on < b.on
      ? -1
      : a.on > b.on
        ? 1
        : rank(a) - rank(b) || a.name.localeCompare(b.name),
  );

  const startingBalance = onHand.free;
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
      const real = inWindow.filter((o) => o.source !== "everyday");
      const expense = real
        .filter((o) => o.kind !== "income" && o.goal === null)
        .reduce((sum, o) => sum + o.amount, 0);
      const income = real
        .filter((o) => o.kind === "income")
        .reduce((sum, o) => sum + o.amount, 0);
      const saving = real
        .filter((o) => o.goal !== null)
        .reduce((sum, o) => sum + o.amount, 0);
      const everyday = inWindow
        .filter((o) => o.source === "everyday")
        .reduce((sum, o) => sum + o.amount, 0);
      return {
        days,
        expense,
        income,
        saving,
        everyday,
        net: income - expense - saving - everyday,
        count: real.length,
      };
    });

  return {
    from,
    startingBalance,
    onAccounts: onHand.total,
    reserved: onHand.reserved,
    windows: totals,
    lines,
    estimated,
    unknown,
    spending,
    planned: plannedCount,
  };
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
  /** What went into goals this month, less what came back out — the net earmarked. */
  saved: number;
  /** The gross of what came back out, so "put aside" can explain a small figure. */
  withdrawn: number;
  net: number;
  byCategory: { id: string; spent: number }[];
};

export async function getMonthSummary(month = monthKey()): Promise<MonthSummary> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) {
    return { month, expense: 0, income: 0, saved: 0, withdrawn: 0, net: 0, byCategory: [] };
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
  let putIn = 0;
  let withdrawn = 0;

  for (const r of rows) {
    const value = Number(r.amount_rsd) || 0;
    if (r.kind === "expense") {
      expense += value;
      if (r.category_id) spentBy.set(r.category_id, (spentBy.get(r.category_id) ?? 0) + value);
    } else if (r.kind === "income") {
      income += value;
    } else if (r.kind === "saving") {
      putIn += value;
    } else if (r.kind === "withdraw") {
      // Money coming back out of a goal was never spent, so it is not income — it
      // simply undoes part of what this month put aside.
      withdrawn += value;
    }
  }

  const saved = putIn - withdrawn;

  return {
    month,
    expense,
    income,
    saved,
    withdrawn,
    net: income - expense - saved,
    byCategory: [...spentBy].map(([id, spent]) => ({ id, spent })),
  };
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

/** How many movements a goal card shows before it starts saying "and N more". */
const GOAL_HISTORY_LIMIT = 30;

/**
 * Every goal with its own movements attached — deposits and withdrawals, newest first.
 *
 * Archived and closed goals come back too; which ones a screen shows is the screen's
 * decision, and the Overview and the Goals page want different answers. The order is
 * the one the owner chose: `sort` first, `created_at` to break a tie.
 */
export async function getGoalLines(): Promise<GoalLine[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const [{ data: goals }, { data: movements }, accounts] = await Promise.all([
    supabase
      .from("money_goals")
      .select("*")
      .eq("user_id", uid)
      .order("sort")
      .order("created_at"),
    supabase
      .from("money_transactions")
      .select("id, goal_id, kind, amount_rsd, occurred_on, note, account_id, recurring_id")
      .eq("user_id", uid)
      .in("kind", ["saving", "withdraw"])
      .order("occurred_on", { ascending: true })
      .order("created_at", { ascending: true }),
    // Archived accounts still name the money that came off them, so include them.
    getAccounts(true),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const byGoal = new Map<string, GoalEntry[]>();
  const lastAccount = new Map<string, string>();

  // The rows arrive oldest first, so the last account seen for a goal is the one it
  // last used — that is what the deposit box should offer without being asked.
  for (const m of movements ?? []) {
    if (!m.goal_id) continue; // the goal was deleted; the entry stays in the ledger
    const list = byGoal.get(m.goal_id) ?? [];
    list.push({
      id: m.id,
      kind: m.kind,
      amount: Number(m.amount_rsd) || 0,
      occurred_on: m.occurred_on,
      note: m.note,
      account: m.account_id ? (accountName.get(m.account_id) ?? null) : null,
      recurring: m.recurring_id != null,
    });
    byGoal.set(m.goal_id, list);
    if (m.account_id) lastAccount.set(m.goal_id, m.account_id);
  }

  return (goals ?? []).map((g: MoneyGoal) => {
    // Walked oldest first, so `peak` is the most the goal ever actually held rather
    // than the sum of everything that ever went in.
    const ordered = byGoal.get(g.id) ?? [];
    let saved = 0;
    let peak = 0;
    let deposited = 0;
    let withdrawn = 0;

    for (const e of ordered) {
      if (e.kind === "saving") {
        saved += e.amount;
        deposited += e.amount;
      } else {
        saved -= e.amount;
        withdrawn += e.amount;
      }
      if (saved > peak) peak = saved;
    }

    return {
      ...g,
      saved,
      deposited,
      withdrawn,
      peak,
      movements: ordered.length,
      // Newest first for reading; the walk above needed the other order.
      entries: ordered.slice().reverse().slice(0, GOAL_HISTORY_LIMIT),
      lastAccountId: lastAccount.get(g.id) ?? null,
    };
  });
}

export type AccountBalance = MoneyAccount & {
  /** Everything on the account, whether it is spoken for or not. */
  balance: number;
  /** The part of `balance` an open goal has a claim on. */
  reserved: number;
  /** What is left to spend: `balance` less `reserved`. */
  free: number;
};

/** The three figures for the accounts taken together. They always add up. */
export type OnHand = { total: number; reserved: number; free: number };

/**
 * Balances in RSD: opening balance converted at today's rate, then every movement.
 *
 * Putting money aside is not spending it. The dinars are still in the account — what
 * changes is that a goal has a claim on them, so they leave `free` and show up under
 * `reserved` instead, and `balance` still matches what the bank says. A withdrawal
 * hands the claim back: the total does not move, the free part goes up.
 *
 * Only goals that are still open reserve anything. Close a goal, delete it, and the
 * money it was holding is spendable again — which is exactly what closing means.
 *
 * A withdrawal that names a different account from the deposits shifts `reserved`
 * between the two accounts, so one of them can read as a small negative. The figures
 * for the accounts taken together are unaffected, and that is what the screens show.
 */
export async function getAccountBalances(): Promise<AccountBalance[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const [accounts, rates, { data: rows }, { data: openGoals }] = await Promise.all([
    getAccounts(),
    getRates(),
    supabase
      .from("money_transactions")
      .select("kind, amount_rsd, account_id, to_account_id, goal_id")
      .eq("user_id", uid),
    supabase.from("money_goals").select("id").eq("user_id", uid).is("completed_at", null),
  ]);

  const open = new Set((openGoals ?? []).map((g) => g.id));

  const delta = new Map<string, number>();
  const claimed = new Map<string, number>();
  const add = (map: Map<string, number>, id: string | null, value: number) => {
    if (!id) return;
    map.set(id, (map.get(id) ?? 0) + value);
  };

  for (const r of rows ?? []) {
    const value = Number(r.amount_rsd) || 0;
    if (r.kind === "income") add(delta, r.account_id, value);
    else if (r.kind === "transfer") {
      add(delta, r.account_id, -value);
      add(delta, r.to_account_id, value);
    } else if (r.kind === "saving") {
      if (r.goal_id && open.has(r.goal_id)) add(claimed, r.account_id, value);
    } else if (r.kind === "withdraw") {
      if (r.goal_id && open.has(r.goal_id)) add(claimed, r.account_id, -value);
    } else add(delta, r.account_id, -value); // expense
  }

  return accounts.map((a) => {
    const balance =
      toRsd(Number(a.opening_balance) || 0, a.currency, rates) + (delta.get(a.id) ?? 0);
    const reserved = claimed.get(a.id) ?? 0;
    return { ...a, balance, reserved, free: balance - reserved };
  });
}

/**
 * The one sentence every screen has to agree on: this much money exists, this much of
 * it is spoken for, this much can actually be spent. Total less reserved is free, by
 * construction — there is no arrangement of the data that makes these three disagree.
 *
 * `reserved` is read off the goals rather than added up from the accounts. Both routes
 * give the same answer for anything entered now, since an entry against a goal has to
 * name an account; taking it from the goals means an older entry that never named one
 * still holds its money back instead of quietly becoming spendable.
 */
export async function getOnHand(): Promise<OnHand> {
  const [accounts, goals] = await Promise.all([getAccountBalances(), getGoalLines()]);
  const total = accounts.reduce((sum, a) => sum + a.balance, 0);
  const reserved = goals.filter(isGoalOpen).reduce((sum, g) => sum + g.saved, 0);
  return { total, reserved, free: total - reserved };
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

/**
 * The goals money can still be moved into — open, not archived, in the owner's order.
 * A closed goal is history: it no longer reserves anything, so letting an entry land
 * on one would put money somewhere nothing is watching.
 */
export async function getGoals(): Promise<MoneyGoal[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data } = await supabase
    .from("money_goals")
    .select("*")
    .eq("user_id", uid)
    .eq("archived", false)
    .is("completed_at", null)
    .order("sort")
    .order("created_at");
  return data ?? [];
}

/**
 * Open means: still collecting, and still holding a claim on the money. Exactly the
 * test `getAccountBalances` applies, so what the goals screen calls open and what the
 * accounts call reserved can never drift apart. Archiving is only offered once a goal
 * is closed, which is what keeps a reservation from being tidied out of sight.
 */
export function isGoalOpen(goal: { completed_at: string | null }): boolean {
  return goal.completed_at === null;
}
