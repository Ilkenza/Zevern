/**
 * Savings goals, and the movements that put money into them or take it back out.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { GoalEntry, GoalLine, MoneyGoal } from "@/lib/types";
import { GOAL_MOVE_KINDS, goalKinds, walkGoal } from "@/lib/money/goal-progress";
import { getAccounts, readAll } from "./core";
import { ReadFailed } from "@/lib/data/must";

/** How many movements a goal card shows before it starts saying "and N more". */
const GOAL_HISTORY_LIMIT = 30;

/*
  Which entries move a goal, and which way, is in `@/lib/money/goal-progress` — it is the
  rule every figure on the Goals screen rests on, and it belongs somewhere it can be
  tested without a database.
*/

/**
 * Every goal with its own movements attached — deposits and withdrawals, newest first.
 *
 * Archived and closed goals come back too; which ones a screen shows is the screen's
 * decision, and the Overview and the Goals page want different answers. The order is
 * the one the owner chose: `sort` first, `created_at` to break a tie.
 */
export const getGoalLines = cache(async (): Promise<GoalLine[]> => {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const [goalsRes, movements, accounts] = await Promise.all([
    supabase
      .from("money_goals")
      .select("*")
      .eq("user_id", uid)
      .order("sort")
      .order("created_at"),
    /*
      Paged, for the same reason the balances are. This one is narrower — only movements
      that name a goal — so it survives far longer than the account read did, which is
      exactly what makes it worse to leave: it would come apart years in, on a screen
      whose whole promise is that money put aside is still counted.

      The ordering ends on `id` because the two keys above it are not unique, and `range`
      over a result set with ties can hand the same row to two pages.
    */
    readAll(
      (from, to) =>
        supabase
          .from("money_transactions")
          .select("id, goal_id, kind, amount_rsd, occurred_on, title, note, account_id, recurring_id")
          .eq("user_id", uid)
          .not("goal_id", "is", null)
          .in("kind", [...GOAL_MOVE_KINDS])
          .order("occurred_on", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id")
          .range(from, to),
      "what your goals have collected",
    ),
    // Archived accounts still name the money that came off them, so include them.
    getAccounts(true),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const byGoal = new Map<string, GoalEntry[]>();
  const lastAccount = new Map<string, string>();

  // The rows arrive oldest first, so the last account seen for a goal is the one it
  // last used — that is what the deposit box should offer without being asked.
  for (const m of movements) {
    if (!m.goal_id) continue; // the goal was deleted; the entry stays in the ledger
    const list = byGoal.get(m.goal_id) ?? [];
    list.push({
      id: m.id,
      kind: m.kind,
      amount: Number(m.amount_rsd) || 0,
      occurred_on: m.occurred_on,
      // What the movement was called; the note stays a fallback for older entries.
      note: m.title ?? m.note,
      account: m.account_id ? (accountName.get(m.account_id) ?? null) : null,
      recurring: m.recurring_id != null,
    });
    byGoal.set(m.goal_id, list);
    if (m.account_id) lastAccount.set(m.goal_id, m.account_id);
  }

  if (goalsRes.error) throw new ReadFailed("your goals", goalsRes.error.message);
  return (goalsRes.data ?? []).map((g: MoneyGoal) => {
    const paying = g.direction === "expense";
    const own = goalKinds(paying);

    // Walked oldest first, so `peak` is the most the goal ever actually stood at rather
    // than the sum of everything that ever counted toward it.
    const ordered = (byGoal.get(g.id) ?? []).filter((e) => own.includes(e.kind));
    const { progress, peak, deposited, withdrawn } = walkGoal(ordered, paying);

    return {
      ...g,
      paying,
      progress,
      /*
        What the goal is holding — which is money only when it is a saving goal. A
        paying-off goal's figure has already left the account, so it reserves nothing;
        saying otherwise here would take the same dinars out of `free` twice.
      */
      saved: paying ? 0 : progress,
      deposited,
      withdrawn,
      peak,
      movements: ordered.length,
      // Newest first for reading; the walk above needed the other order.
      entries: ordered.slice().reverse().slice(0, GOAL_HISTORY_LIMIT),
      lastAccountId: lastAccount.get(g.id) ?? null,
    };
  });
});


/**
 * The goals money can still be moved into — open, not archived, in the owner's order.
 * A closed goal is history: it no longer reserves anything, so letting an entry land
 * on one would put money somewhere nothing is watching.
 */
export async function getGoals(): Promise<MoneyGoal[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase
    .from("money_goals")
    .select("*")
    .eq("user_id", uid)
    .eq("archived", false)
    .is("completed_at", null)
    .order("sort")
    .order("created_at");
  if (error) throw new ReadFailed("your goals", error.message);
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

/**
 * How much each goal still has room for, by id.
 *
 * The one figure a rule that "stops when the goal is full" needs, and the reason it is
 * derived rather than stored: the goal fills from standing orders, from money put in by
 * hand, and empties when you take some back out. A stored "remaining" would be a fourth
 * thing to keep in step with three others, and the day it fell behind the rule would
 * either stop early or overfill — both silently.
 */
export const getGoalRemaining = cache(async (): Promise<Map<string, number>> => {
  const lines = await getGoalLines();
  return new Map(
    lines.map((g) => [g.id, Math.max(0, (Number(g.target_rsd) || 0) - (g.progress ?? 0))]),
  );
});

