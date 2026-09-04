/**
 * Adding a pile of entries up. One implementation, used at both ends.
 *
 * The figures at the top of the money screen are computed twice, and they have to be: the
 * server sums the whole span so the page arrives with them, and the browser sums again the
 * moment a filter narrows what is being looked at, because asking the server for four
 * numbers on every keystroke is not a screen anybody wants to use. What is not allowed is
 * two *versions* of that arithmetic. They were written out separately — the same four
 * accumulators, the same four `kind` branches, the same uncategorised fallback, in two
 * files that nothing kept in step — and a rule changed in one of them would have shown up
 * as the top of the screen disagreeing with the bottom, in a screen about money.
 *
 * So the sum lives here, both callers use it, and it is the thing the tests can hold.
 */

import { UNCATEGORIZED_CATEGORY_ID } from "./index";

/** As little of an entry as adding it up requires. */
export type SummableEntry = {
  kind: string;
  amount_rsd: number | string | null;
  category_id?: string | null;
};

export type EntryTotals = {
  expense: number;
  income: number;
  /** What went into goals, less what came back out — the net earmarked. */
  saved: number;
  /** The gross of what came back out, so "put aside" can explain a small figure. */
  withdrawn: number;
  net: number;
  /**
   * Per category: what it cost, and how many purchases that was.
   *
   * The count is not decoration. A sum on its own cannot tell one weekly shop from
   * thirty coffees, and every judgement about pace depends on knowing which of the two
   * it is looking at — see `remedyFor`.
   */
  byCategory: { id: string; spent: number; entries: number }[];
};

export function sumEntries(entries: Iterable<SummableEntry>): EntryTotals {
  const spentBy = new Map<string, number>();
  const countBy = new Map<string, number>();
  let expense = 0;
  let income = 0;
  let putIn = 0;
  let withdrawn = 0;

  for (const entry of entries) {
    // An entry with no price yet counts as nothing rather than as `NaN`, which would
    // poison every figure it touched and print as nothing at all.
    const value = Number(entry.amount_rsd) || 0;
    if (entry.kind === "expense") {
      expense += value;
      const id = entry.category_id ?? UNCATEGORIZED_CATEGORY_ID;
      spentBy.set(id, (spentBy.get(id) ?? 0) + value);
      /* Counted whatever it cost — an entry with no price yet is still a purchase. */
      countBy.set(id, (countBy.get(id) ?? 0) + 1);
    } else if (entry.kind === "income") {
      income += value;
    } else if (entry.kind === "saving") {
      putIn += value;
    } else if (entry.kind === "withdraw") {
      // Money coming back out of a goal was never spent, so it is not income — it simply
      // undoes part of what was put aside.
      withdrawn += value;
    }
  }

  /*
    Net is income less what was actually spent, and nothing else.

    It used to subtract what had been put aside as well, which made a month with one small
    purchase and one big deposit read as −6.720 — a figure that looks exactly like a
    spending spree and is nothing of the kind. Money moved into a goal has not left the
    accounts; it is sitting on the same bank account it was on this morning, with a label
    on it.
  */
  return {
    expense,
    income,
    saved: putIn - withdrawn,
    withdrawn,
    net: income - expense,
    byCategory: [...spentBy].map(([id, spent]) => ({
      id,
      spent,
      entries: countBy.get(id) ?? 0,
    })),
  };
}
