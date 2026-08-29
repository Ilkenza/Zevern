/**
 * What is on the accounts, how much of it a goal has a claim on, and what is therefore
 * left to spend. Every screen that shows money leans on these three figures adding up.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { toRsd } from "@/lib/money";
import type { MoneyAccount } from "@/lib/types";
import { getAccounts, getRates, readAll } from "./core";
import { getGoalLines, isGoalOpen } from "./goals";

export type AccountBalance = MoneyAccount & {
  /** Everything on the account, whether it is spoken for or not. */
  balance: number;
  /** The part of `balance` an open goal has a claim on. */
  reserved: number;
  /** What is left to spend: `balance` less `reserved`. */
  free: number;
  /**
   * How many entries have touched this account.
   *
   * Zero means the balance is still exactly what was typed at setup, and the screen
   * can say so with one figure instead of two. It counts rows rather than summing
   * them, because an account whose entries happen to cancel out has still been used —
   * and editing its opening balance would still rewrite that history.
   */
  entries: number;
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
export const getAccountBalances = cache(async (): Promise<AccountBalance[]> => {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  /*
    Every row, in pages — not the first thousand.

    This read has no date window and no natural bound: a balance is the whole ledger by
    definition. Left as a plain select it quietly returned PostgREST's first 1.000 rows,
    and on a 1.384-row ledger the screen showed 615.076 where the books said 563.600 —
    to the dinar the sum of exactly those first thousand. Nothing errored; the number was
    simply wrong, and wrong upward, which is the one direction a money app must not be.

    Ordered by `id` because `range` is an offset and Postgres does not promise an order
    without one: unordered, page two could repeat or skip what page one already counted.
  */
  const [accounts, rates, rows, { data: openGoals }] = await Promise.all([
    getAccounts(),
    getRates(),
    readAll(
      (from, to) =>
        supabase
          .from("money_transactions")
          .select("kind, amount_rsd, account_id, to_account_id, goal_id")
          .eq("user_id", uid)
          .order("id")
          .range(from, to),
      "getAccountBalances",
    ),
    supabase.from("money_goals").select("id").eq("user_id", uid).is("completed_at", null),
  ]);

  const open = new Set((openGoals ?? []).map((g) => g.id));

  const delta = new Map<string, number>();
  const claimed = new Map<string, number>();
  const touched = new Map<string, number>();
  const add = (map: Map<string, number>, id: string | null, value: number) => {
    if (!id) return;
    map.set(id, (map.get(id) ?? 0) + value);
  };

  for (const r of rows) {
    const value = Number(r.amount_rsd) || 0;
    add(touched, r.account_id, 1);
    if (r.kind === "transfer") add(touched, r.to_account_id, 1);
    if (r.kind === "income") add(delta, r.account_id, value);
    else if (r.kind === "transfer") {
      add(delta, r.account_id, -value);
      add(delta, r.to_account_id, value);
    } else if (r.kind === "saving") {
      if (r.goal_id && open.has(r.goal_id)) add(claimed, r.account_id, value);
    } else if (r.kind === "withdraw") {
      if (r.goal_id && open.has(r.goal_id)) add(claimed, r.account_id, -value);
    } else if (r.kind === "loan_in") {
      /*
        Money arriving from a debt is money on the account like any other — a credit
        can be spent the day it lands. It is only not *income*, which is a different
        question, answered where income is counted rather than here.

        It needs its own branch because the fall-through below treats everything it
        does not recognise as money leaving, which for this one is backwards.
      */
      add(delta, r.account_id, value);
    } else if (r.kind === "correction") {
      /*
        The one kind whose figure carries its own sign, so it is added as it stands.
        It also has to be named here rather than left to the fall-through below, which
        treats anything it does not recognise as money leaving — and would turn every
        upward correction into a second, larger error.
      */
      add(delta, r.account_id, value);
    } else add(delta, r.account_id, -value); // expense, loan_out
  }

  return accounts.map((a) => {
    const balance =
      toRsd(Number(a.opening_balance) || 0, a.currency, rates) + (delta.get(a.id) ?? 0);
    const reserved = claimed.get(a.id) ?? 0;
    return { ...a, balance, reserved, free: balance - reserved, entries: touched.get(a.id) ?? 0 };
  });
});

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
export const getOnHand = cache(async (): Promise<OnHand> => {
  const [accounts, goals] = await Promise.all([getAccountBalances(), getGoalLines()]);
  const total = accounts.reduce((sum, a) => sum + a.balance, 0);
  const reserved = goals.filter(isGoalOpen).reduce((sum, g) => sum + g.saved, 0);
  return { total, reserved, free: total - reserved };
});


