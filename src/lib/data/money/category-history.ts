/**
 * One category across time: what it has cost month by month, and every entry behind it.
 *
 * The ledger can already be filtered to a category, but only inside one month — which
 * answers "what did I buy" and cannot answer "is this normal". Those are different
 * questions and the second one is the reason anybody looks twice at a category: 14.737 on
 * eating out is either an unusual month or simply what eating out costs here, and the
 * only way to tell is to see the months either side of it.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { todayISO } from "@/lib/format";
import { monthRange, shiftMonth, UNCATEGORIZED_CATEGORY_ID } from "@/lib/money";
import type { TransactionRow } from "@/lib/types";
import { TX_SELECT } from "./core";
import { ReadFailed } from "@/lib/data/must";

/** A year, so a season can be compared with the same season. */
const MONTHS_BACK = 12;

export type CategoryMonth = {
  /** `YYYY-MM`. */
  month: string;
  spent: number;
  /** How many entries make it up — a single 16.000 shop is a different month from ten. */
  entries: number;
  /** The month still running. Left out of the average; a month you are three days into is not a month. */
  current: boolean;
};

export type CategoryHistory = {
  months: CategoryMonth[];
  /** Dinars in an average finished month. Zero until one has finished. */
  typical: number;
  /** Every entry in the span, newest first. */
  entries: TransactionRow[];
  /** Where the span starts, so the panel can say how far back it is looking. */
  from: string;
};

/**
 * The last year of a category, in one query.
 *
 * The monthly totals and the entry list are the same rows read twice rather than two
 * trips — a year of one category is a few dozen entries even for somebody who eats out
 * constantly, and splitting it would mean the bars and the list could disagree.
 *
 * `null` for a category with nothing in the whole span: the panel then says so instead of
 * drawing twelve empty bars, which look like a chart that failed rather than a category
 * you have not used.
 */
export const getCategoryHistory = cache(
  async (categoryId: string, on?: string): Promise<CategoryHistory | null> => {
    const today = on ?? todayISO();
    const supabase = await createClient();
    const uid = await userId(supabase);
    if (!uid) return null;

    // `today` is a wall-clock ISO date, and its first seven characters are the month.
    // Going through a Date here would put a timezone into a string that deliberately
    // has none.
    const thisMonth = today.slice(0, 7);
    const months: string[] = [];
    for (let back = MONTHS_BACK - 1; back >= 0; back -= 1) {
      months.push(shiftMonth(thisMonth, -back));
    }
    const from = monthRange(months[0]).from;
    const to = monthRange(months[months.length - 1]).to;

    let query = supabase
      .from(
        // Read through the same view the ledger uses, so an entry looks the same here as
        // it does on the Money screen — same category, account and goal names attached.
        "money_transactions",
      )
      .select(TX_SELECT)
      .eq("user_id", uid)
      .gte("occurred_on", from)
      .lte("occurred_on", to);

    /*
      Uncategorised is not a category, it is the absence of one, and it only means anything
      for spending — an income with no category is not money that needs filing.
    */
    if (categoryId === UNCATEGORIZED_CATEGORY_ID) {
      query = query.is("category_id", null).eq("kind", "expense");
    } else {
      query = query.eq("category_id", categoryId);
    }

    const { data, error } = await query
      .order("occurred_on", { ascending: false })
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) throw new ReadFailed("this category's history", error.message);
    const rows = (data ?? []) as unknown as TransactionRow[];
    if (rows.length === 0) return null;

    const totals = new Map<string, { spent: number; entries: number }>();
    for (const row of rows) {
      /*
        An entry with no price yet counts as an entry and adds nothing to the total. It is
        real — you bought the thing — and pretending it cost zero in the bars while hiding
        it from the count would make the two disagree about the same afternoon.
      */
      const key = row.occurred_on.slice(0, 7);
      const at = totals.get(key) ?? { spent: 0, entries: 0 };
      at.spent += Number(row.amount_rsd) || 0;
      at.entries += 1;
      totals.set(key, at);
    }

    const byMonth: CategoryMonth[] = months.map((month) => ({
      month,
      spent: Math.round((totals.get(month)?.spent ?? 0) * 100) / 100,
      entries: totals.get(month)?.entries ?? 0,
      current: month === thisMonth,
    }));

    /*
      The average of the months that both finished and had something in them.

      Counting empty months would answer a different question — "how much does this cost
      me on average across the year" — and would tell somebody who eats out twice a year
      that dinner costs 1.200. The figure this panel wants is what a month with this
      category in it looks like.
    */
    const lived = byMonth.filter((m) => !m.current && m.entries > 0);
    const typical = lived.length
      ? Math.round(lived.reduce((sum, m) => sum + m.spent, 0) / lived.length)
      : 0;

    return { months: byMonth, typical, entries: rows, from };
  },
);
