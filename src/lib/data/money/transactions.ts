/**
 * The ledger itself: reading entries back, and adding a month of them up.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { todayISO } from "@/lib/format";
import { monthKey, monthRange, UNCATEGORIZED_CATEGORY_ID } from "@/lib/money";
import type { TransactionRow } from "@/lib/types";
import { TX_SELECT } from "./core";

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
  if (filter.categoryId === UNCATEGORIZED_CATEGORY_ID) {
    q = q.is("category_id", null).eq("kind", "expense");
  } else if (filter.categoryId) {
    q = q.eq("category_id", filter.categoryId);
  }
  if (filter.accountId) q = q.eq("account_id", filter.accountId);
  if (filter.kind) q = q.eq("kind", filter.kind);

  q = q.order("occurred_on", { ascending: false }).order("created_at", { ascending: false });
  if (filter.limit) q = q.limit(filter.limit);

  const { data, error } = await q;
  if (error) console.error("getTransactions:", error.message);
  return (data ?? []) as TransactionRow[];
}

/**
 * Everything logged without a price, oldest first.
 *
 * Oldest first on purpose, and it is the only list in the money module ordered that
 * way. Every other screen answers "what just happened", where the newest row is the one
 * you came for. This one answers "what is still open", and the entry most at risk of
 * never being finished is the one furthest from the day you can still remember it.
 *
 * Not scoped to a month either: an entry from three weeks ago is exactly the one that
 * falls through, and a month-scoped panel would hide it on the 1st.
 */
export async function getUnpricedTransactions(limit = 25): Promise<TransactionRow[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase
    .from("money_transactions")
    .select(TX_SELECT)
    .eq("user_id", uid)
    .is("amount", null)
    .order("occurred_on", { ascending: true })
    .limit(limit);
  if (error) console.error("getUnpricedTransactions:", error.message);
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
      const categoryId = r.category_id ?? UNCATEGORIZED_CATEGORY_ID;
      spentBy.set(categoryId, (spentBy.get(categoryId) ?? 0) + value);
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

  /*
    Net is income less what was actually spent, and nothing else.

    It used to subtract what had been put aside as well, which made a month with one
    small purchase and one big deposit read as −6.720 — a figure that looks exactly
    like a spending spree and is nothing of the kind. Money moved into a goal has not
    left the accounts; it is sitting on the same bank account it was on this morning,
    with a label on it. "Free to spend" is the figure that accounts for the label, and
    it says so on the same screen.

    `saved` is still reported, so the card beside this one can say what was set aside
    without this one pretending it was gone.
  */
  return {
    month,
    expense,
    income,
    saved,
    withdrawn,
    net: income - expense,
    byCategory: [...spentBy].map(([id, spent]) => ({ id, spent })),
  };
}


/**
 * Whether this profile has ever said what money comes in.
 *
 * Not "did anything arrive this month" — that is a different question with a different
 * answer, and conflating the two is what made a screen shout at someone on the 3rd for
 * a salary that lands on the 10th.
 *
 * A standing rule counts even before it has ever booked. Writing down that the pay is
 * 90.000 on the 5th is telling the app what comes in; making it wait for the first
 * posting would keep the setup prompt on screen for up to a month after the setting up
 * was actually done.
 */
export const hasIncomeOnFile = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return false;

  const [booked, rules] = await Promise.all([
    supabase
      .from("money_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("kind", "income"),
    supabase
      .from("money_recurring")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("kind", "income")
      .eq("active", true),
  ]);

  return (booked.count ?? 0) > 0 || (rules.count ?? 0) > 0;
});

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

export type DaySpend = {
  /** 1-based day of the month. */
  day: number;
  date: string;
  expense: number;
  /** Saturdays and Sundays — the rhythm of a month is mostly weekends. */
  weekend: boolean;
  future: boolean;
};

/**
 * A month of spending, day by day.
 *
 * A monthly total tells you how much; it never tells you *when*. Two people who spent
 * the same amount can have had a completely different month — one steady, one three
 * bad days — and only the shape says which you had.
 */
export async function getDailySpend(month: string): Promise<DaySpend[]> {
  const { from, to } = monthRange(month);
  const days = Number(to.slice(8));
  const today = todayISO();

  const blank = Array.from({ length: days }, (_, i) => {
    const date = `${from.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    return { day: i + 1, date, expense: 0, weekend: dow === 0 || dow === 6, future: date > today };
  });

  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return blank;

  const { data, error } = await supabase
    .from("money_transactions")
    .select("occurred_on, amount_rsd")
    .eq("user_id", uid)
    .eq("kind", "expense")
    .gte("occurred_on", from)
    .lte("occurred_on", to);
  if (error) console.error("getDailySpend:", error.message);

  for (const r of data ?? []) {
    const i = Number(String(r.occurred_on).slice(8, 10)) - 1;
    if (i >= 0 && i < blank.length) blank[i].expense += Number(r.amount_rsd) || 0;
  }
  return blank;
}
