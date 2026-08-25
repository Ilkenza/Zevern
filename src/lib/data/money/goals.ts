/**
 * Savings goals, and the movements that put money into them or take it back out.
 */

import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { GoalEntry, GoalLine, MoneyGoal } from "@/lib/types";
import { getAccounts } from "./core";

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
      .select("id, goal_id, kind, amount_rsd, occurred_on, title, note, account_id, recurring_id")
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
      // What the movement was called; the note stays a fallback for older entries.
      note: m.title ?? m.note,
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
