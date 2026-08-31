/**
 * The ledger itself: reading entries back, and adding a month of them up.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { todayISO } from "@/lib/format";
import { monthKey, monthRange, UNCATEGORIZED_CATEGORY_ID } from "@/lib/money";
import { sumEntries } from "@/lib/money/summary";
import type { TransactionRow } from "@/lib/types";
import { readAll, TX_SELECT } from "./core";

export type TxFilter = {
  month?: string;
  /**
   * An explicit span, inclusive at both ends, and either end may be left empty.
   *
   * Takes precedence over `month`, because a caller that asks for both has asked for a
   * span and named the month it started in. Either end empty means unbounded that way,
   * which is how "all time" arrives here: both ends empty and nothing to add to the
   * query at all.
   */
  from?: string;
  to?: string;
  categoryId?: string;
  /**
   * Several categories at once. `categoryId` still works and is the one-category case.
   *
   * `Uncategorised` may be among them, and it is not a category — it is the absence of
   * one, which in a query is a different clause entirely. Mixed with real ids that makes
   * the filter an `or`, and the `or` is the reason this cannot just be an `in`.
   */
  categoryIds?: readonly string[];
  accountId?: string;
  kind?: string;
  limit?: number;
};

export async function getTransactions(filter: TxFilter = {}): Promise<TransactionRow[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];

  const span =
    filter.from !== undefined || filter.to !== undefined
      ? { from: filter.from ?? "", to: filter.to ?? "" }
      : filter.month
        ? monthRange(filter.month)
        : { from: "", to: "" };

  /*
    Built fresh for each page rather than once and reused.

    A PostgREST builder carries the request it is going to send; calling `.range()` on
    the same object twice would walk the second page with the first page's window still
    attached. One function, called per page, is the version that cannot do that.
  */
  const build = () => {
    let q = supabase.from("money_transactions").select(TX_SELECT).eq("user_id", uid);
    if (span.from) q = q.gte("occurred_on", span.from);
    if (span.to) q = q.lte("occurred_on", span.to);
    const wanted = filter.categoryIds?.length
      ? filter.categoryIds
      : filter.categoryId
        ? [filter.categoryId]
        : [];
    if (wanted.length > 0) {
      const none = wanted.includes(UNCATEGORIZED_CATEGORY_ID);
      const real = wanted.filter((id) => id !== UNCATEGORIZED_CATEGORY_ID);
      if (none && real.length === 0) {
        q = q.is("category_id", null).eq("kind", "expense");
      } else if (!none) {
        q = q.in("category_id", [...real]);
      } else {
        /*
          Both at once: some named categories, plus the entries that have none.

          Written as one `or` rather than two queries because the two halves have to be
          paged together — two reads merged in memory would each take their own thousand
          rows and hand back a list with a hole in the middle of it.

          `Uncategorised` keeps the `kind` clause it has in the branch above: an entry
          with no category that is not spending is a transfer or a deposit, and those were
          never what that option meant.
        */
        q = q.or(
          `category_id.in.(${real.join(",")}),and(category_id.is.null,kind.eq.expense)`,
        );
      }
    }
    if (filter.accountId) q = q.eq("account_id", filter.accountId);
    if (filter.kind) q = q.eq("kind", filter.kind);

    /*
      Day, then time of day, then the order they were typed.

      The time is optional, and `nullsFirst: false` is what makes the fallback honest: an
      entry with no time sorts after the ones that have one on the same day, because a
      known 18:40 is later in the afternoon than "sometime that Tuesday". Reversed, every
      untimed entry would jump to the top of its day and the list would reorder itself the
      first time somebody filled the field in.

      `id` last, and it is not cosmetic: `range` is an offset, and Postgres promises no
      order for rows the other three keys cannot separate. Two entries typed in the same
      second, on the same day, with no time — that is a real shape, and unordered it can
      land on page one and page two both, or on neither.
    */
    return q
      .order("occurred_on", { ascending: false })
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id");
  };

  // A bounded read is already bounded: it asks for n rows and gets them.
  if (filter.limit) {
    const { data, error } = await build().limit(filter.limit);
    if (error) console.error("getTransactions:", error.message);
    return (data ?? []) as TransactionRow[];
  }

  /*
    Every row in the span, in pages.

    A month is a hundred entries and this never mattered. A span is not: `All time` on a
    ledger that has been running two years is past PostgREST's thousand-row ceiling, and
    that ceiling is silent — the list would simply stop partway through 2025 with no
    error and nothing on screen to say so. The same fault that had the accounts screen
    reporting more money than existed.
  */
  return (await readAll(
    (from, to) => build().range(from, to),
    "getTransactions",
  )) as TransactionRow[];
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
    .order("occurred_at", { ascending: true, nullsFirst: false })
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

/**
 * The figures at the top of the money screen, over a month or over any span.
 *
 * `span` overrides the month's own dates and leaves `month` alone as the label, so every
 * existing caller keeps the call it had and the screen that browses by range gets the
 * same four figures without a second implementation of them. Two functions adding up the
 * same ledger is two functions that will one day disagree about it.
 */
export async function getMonthSummary(
  month = monthKey(),
  span?: { from: string; to: string },
): Promise<MonthSummary> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) {
    return { month, expense: 0, income: 0, saved: 0, withdrawn: 0, net: 0, byCategory: [] };
  }

  const { from, to } = span ?? monthRange(month);

  /*
    Paged, for the same reason the ledger read above is.

    Over a month this is a hundred rows and one request. Over `All time` it is the whole
    ledger, and a plain select would hand back PostgREST's first thousand and no error —
    so the total at the top of the screen would be a real sum of a made-up subset. Wrong
    quietly, and wrong low, which is the one direction that reads as plausible.

    Ordered by `id` because `range` is an offset and needs a total order to page over.
  */
  const rows = await readAll<{ kind: string; amount_rsd: number | null; category_id: string | null }>(
    (lo, hi) => {
      let q = supabase
        .from("money_transactions")
        .select("kind, amount_rsd, category_id")
        .eq("user_id", uid);
      if (from) q = q.gte("occurred_on", from);
      if (to) q = q.lte("occurred_on", to);
      return q.order("id").range(lo, hi);
    },
    "getMonthSummary",
  );
  /*
    The sum itself lives in `lib/money/summary`, because the browser has to do it again
    the moment a filter narrows the screen and two hand-written copies of one arithmetic
    is how the top of a money screen starts disagreeing with the bottom.
  */
  return { month, ...sumEntries(rows) };
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
export async function getExpenseTrend(
  months = 6,
  /**
   * The month the window ends at, `YYYY-MM`. Defaults to this one.
   *
   * It used to be fixed to the current month, so the strip on a page showing February
   * drew March to August — six months that did not include the month the page was about,
   * with nothing highlighted and nothing to say. Ending at the month being read makes the
   * bars the six months *up to here*, and walking to another month walks the window with
   * it: the months either side of the strip are one click away in the bars themselves.
   */
  through?: string,
): Promise<{ month: string; expense: number }[]> {
  const supabase = await createClient();
  const now = new Date();
  const end = /^\d{4}-\d{2}$/.test(through ?? "")
    ? new Date(Date.UTC(Number(through!.slice(0, 4)), Number(through!.slice(5, 7)) - 1, 1))
    : new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

  /*
    The window reaches two months past the one being read, and stops at the month we are
    actually in.

    Ending it exactly on the month being read made the strip a one-way street: every bar
    was in the past, so clicking one walked backwards and there was never a bar to walk
    forward with. Two months of headroom puts the month you are on near the right of the
    strip with somewhere to go on both sides — and the clamp keeps it honest, because a
    bar for a month that has not happened is a bar that can only ever say nothing.
  */
  const current = Date.UTC(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(
    Math.min(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 2, 1), current),
  );

  const first = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() - (months - 1), 1));
  const start = first.toISOString().slice(0, 10);
  // One day past the end of the last month in the window, so the read stops there too.
  const stop = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);

  const totals = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() - i, 1));
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
    .lt("occurred_on", stop)
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
