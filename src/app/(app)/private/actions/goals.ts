"use server";

import {
getMoney,getRates
} from "@/lib/data/money";
import {
rateFor
} from "@/lib/money";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage, deleteErrorMessage } from "@/lib/supabase/errors";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
currencyOf,
goalBalance,
hexColor,
MAX_AMOUNT,
MoneyState,
num,
ownsMoneyRow,
PENNY,
refresh,
today
} from "./shared";
import { unreadable } from "@/lib/data/must";

/* ------------------------------------------------------------------- goals */

export async function saveGoal(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const targetAmount = num(formData.get("target_amount"));
  const currency = currencyOf(formData.get("currency"));
  const targetDate = String(formData.get("target_date") ?? "").trim() || null;
  /*
    Which way the goal runs, and only ever answered once.

    Every movement on a goal is typed to its direction — money set aside on one, an
    expense on the other — so turning a goal around later would not convert its history,
    it would orphan it: the figure on the card would drop to nothing and the entries
    behind it would still be in the ledger, attached to a goal that no longer counts
    them. The form does not offer the change and this does not accept it.
  */
  const direction = formData.get("direction") === "expense" ? "expense" : "income";

  // A target below zero is not a smaller goal, it is a broken one: every percentage on
  // the card is `saved / target`, and a negative divisor turns progress inside out.
  if (targetAmount < 0) return { error: "A target cannot be less than nothing." };
  if (targetAmount > MAX_AMOUNT) return { error: "That target is larger than this can carry." };
  const color = hexColor(formData.get("color"));

  if (!name) return { error: "Name is required." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  /*
    The target is kept twice: as you said it, and in dinars.

    A goal aimed at €1.200 is a fact about euros, and the card should say euros back.
    But progress, the pace figure, the reconciliation strip and the forecast all count
    dinars — that is the one currency every screen agrees on — so the dinar figure is
    worked out here, once, at the rate of the day, exactly the way an entry in another
    currency is. The rate is stored with it so the conversion can always be explained.
  */
  const rates = await getRates();
  const rate = currency === "RSD" ? 1 : rateFor(currency, rates);
  const targetRsd = Math.round(targetAmount * rate * 100) / 100;

  const payload = {
    name,
    target_amount: targetAmount,
    currency,
    rate,
    target_rsd: targetRsd,
    target_date: targetDate,
    color,
  };

  let error;
  if (id) {
    // `direction` is deliberately not in the update — see the note where it is read.
    ({ error } = await supabase
      .from("money_goals")
      .update(payload)
      .eq("id", id)
      .eq("user_id", uid));
  } else {
    // A new goal joins at the bottom of the list rather than jumping the queue. The
    // default is 0 for every goal, so without this the order would be creation order
    // again the moment anything is added.
    const { data: last, error: lastError } = await supabase
      .from("money_goals")
      .select("sort")
      .eq("user_id", uid)
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) return { error: unreadable("where the new goal goes in the list") };
    ({ error } = await supabase
      .from("money_goals")
      .insert({ ...payload, direction, sort: (last?.sort ?? -1) + 1 }));
  }
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  redirect("/private/goals");
}

export async function deleteGoal(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("money_goals")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: deleteErrorMessage(error, "this goal") };
  refresh();
  redirect("/private/goals");
}

/**
 * Close a goal: it stops collecting and stops holding money back.
 *
 * Whatever it still holds is handed back to a real account first, as a withdrawal, so
 * the ledger says where the money went and the reserved figure falls by exactly that
 * much. Reached and spent, or given up on — the accounting is the same act, and the
 * purchase itself is an ordinary expense logged in Money.
 */
/**
 * Buy the thing, in one act.
 *
 * The question every reached goal ends on was "so what do I do now", and the honest
 * old answer was two jobs in two places: close the goal here so the money stops being
 * reserved, then go to Money and log the purchase as an expense. Do only the first and
 * the money looks spendable again while the thing is already bought; do only the
 * second and the goal goes on holding money that has been spent.
 *
 * So this does both. The reservation is handed back to the account, the purchase is
 * written into the ledger as an ordinary expense — under the goal's own name — and the
 * goal is closed. The account moves by exactly what the thing cost: the withdrawal
 * frees the money and the expense takes it out, and anything left over stays free
 * rather than disappearing with the goal.
 */
export async function spendGoal(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const goalId = String(formData.get("goal_id") ?? "").trim();
  const accountId = String(formData.get("account_id") ?? "").trim() || null;
  const categoryId = String(formData.get("category_id") ?? "").trim() || null;
  const on = String(formData.get("occurred_on") ?? "").trim() || today();
  const spent = num(formData.get("amount"));
  const spentCurrency = currencyOf(formData.get("currency"));

  if (!goalId) return { error: "No goal to spend." };
  if (!accountId) return { error: "Say which account it was paid from." };
  if (!(spent > 0)) return { error: "What did it actually cost?" };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const [ownsGoal, ownsAccount, ownsCategory] = await Promise.all([
    ownsMoneyRow(supabase, "money_goals", goalId, uid),
    ownsMoneyRow(supabase, "money_accounts", accountId, uid),
    ownsMoneyRow(supabase, "money_categories", categoryId, uid),
  ]);
  if (!ownsGoal) return { error: "That goal is not on your profile." };
  if (!ownsAccount) return { error: "That account is not on your profile." };
  if (!ownsCategory) return { error: "That category is not on your profile." };

  const { data: goal, error: goalError } = await supabase
    .from("money_goals")
    .select("name, completed_at")
    .eq("id", goalId)
    .eq("user_id", uid)
    .maybeSingle();
  if (goalError) return { error: unreadable("that goal") };
  if (!goal) return { error: "That goal is not on your profile." };
  if (goal.completed_at) return { error: "That goal is already closed." };

  const held = await goalBalance(supabase, uid, goalId);
  if (held === null) return { error: "Could not read what that goal holds. Try again." };

  // The withdrawal comes first and is taken back out if anything after it fails, so a
  // half-finished purchase can never leave the goal empty with nothing recorded.
  let freed: string | null = null;
  if (held > PENNY) {
    const { data: back, error } = await supabase
      .from("money_transactions")
      .insert({
        kind: "withdraw",
        amount: held,
        currency: "RSD",
        rate: 1,
        account_id: accountId,
        goal_id: goalId,
        title: `Spent on ${goal.name}`,
        occurred_on: on,
      })
      .select("id")
      .maybeSingle();
    if (error) return { error: saveErrorMessage(error) };
    freed = back?.id ?? null;
  }

  const undo = async () => {
    if (freed) await supabase.from("money_transactions").delete().eq("id", freed).eq("user_id", uid);
  };

  const { data: bought, error: buyErr } = await supabase
    .from("money_transactions")
    .insert({
      kind: "expense",
      amount: spent,
      currency: spentCurrency,
      rate: spentCurrency === "RSD" ? 1 : rateFor(spentCurrency, await getRates()),
      account_id: accountId,
      category_id: categoryId,
      title: goal.name,
      occurred_on: on,
    })
    .select("id")
    .maybeSingle();
  if (buyErr) {
    await undo();
    return { error: saveErrorMessage(buyErr) };
  }

  const { error: closeErr } = await supabase
    .from("money_goals")
    .update({ completed_at: on })
    .eq("id", goalId)
    .eq("user_id", uid)
    .is("completed_at", null);
  if (closeErr) {
    if (bought?.id)
      await supabase.from("money_transactions").delete().eq("id", bought.id).eq("user_id", uid);
    await undo();
    return { error: saveErrorMessage(closeErr) };
  }

  refresh();
  return { ok: true };
}

/**
 * Overshoot on one goal, shortfall on another — move the difference across.
 *
 * Putting aside more than a goal needs is easy and often deliberate: a round number, a
 * standing order that kept running. What you cannot then do is spend it, because the
 * goal still holds it. Taking it out and putting it back into another goal is two
 * entries in two places, and between them the money reads as free to spend when it
 * never was.
 *
 * This writes both at once, on the same account and the same day, so the pair nets to
 * nothing anywhere except in the two goals it was meant to move between.
 */
export async function moveBetweenGoals(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const fromId = String(formData.get("from_goal_id") ?? "").trim();
  const toId = String(formData.get("to_goal_id") ?? "").trim();
  const accountId = String(formData.get("account_id") ?? "").trim() || null;
  const on = String(formData.get("occurred_on") ?? "").trim() || today();
  const amount = num(formData.get("amount"));
  const currency = currencyOf(formData.get("currency"));

  if (!fromId || !toId) return { error: "Say which goal it is going to." };
  if (fromId === toId) return { error: "That is the same goal." };
  if (!(amount > 0)) return { error: "How much is moving?" };
  if (!accountId) return { error: "Say which account is holding it." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const [ownsFrom, ownsTo, ownsAccount] = await Promise.all([
    ownsMoneyRow(supabase, "money_goals", fromId, uid),
    ownsMoneyRow(supabase, "money_goals", toId, uid),
    ownsMoneyRow(supabase, "money_accounts", accountId, uid),
  ]);
  if (!ownsFrom || !ownsTo) return { error: "That goal is not on your profile." };
  if (!ownsAccount) return { error: "That account is not on your profile." };

  const { data: goals, error: goalsError } = await supabase
    .from("money_goals")
    .select("id, name, completed_at")
    .eq("user_id", uid)
    .in("id", [fromId, toId]);
  if (goalsError) return { error: unreadable("those goals") };

  const from = (goals ?? []).find((g) => g.id === fromId);
  const to = (goals ?? []).find((g) => g.id === toId);
  if (!from || !to) return { error: "That goal is not on your profile." };
  if (to.completed_at) return { error: `${to.name} is closed. Reopen it before moving money in.` };

  const held = await goalBalance(supabase, uid, fromId);
  if (held === null) return { error: "Could not read what that goal holds. Try again." };
  const { fmt } = await getMoney();

  // What a goal holds is a dinar figure, so the amount is measured in dinars even
  // though both entries keep the currency it was typed in.
  const rates = await getRates();
  const rate = currency === "RSD" ? 1 : rateFor(currency, rates);
  const amountRsd = Math.round(amount * rate * 100) / 100;

  if (amountRsd > held + PENNY)
    return {
      error:
        held > 0
          ? `${from.name} only holds ${fmt(held)}.`
          : `${from.name} is empty — there is nothing to move.`,
    };

  const { data: out, error: outErr } = await supabase
    .from("money_transactions")
    .insert({
      kind: "withdraw",
      amount,
      currency,
      rate,
      account_id: accountId,
      goal_id: fromId,
      title: `Moved to ${to.name}`,
      occurred_on: on,
    })
    .select("id")
    .maybeSingle();
  if (outErr) return { error: saveErrorMessage(outErr) };

  const { error: inErr } = await supabase.from("money_transactions").insert({
    kind: "saving",
    amount,
    currency,
    rate,
    account_id: accountId,
    goal_id: toId,
    title: `Moved from ${from.name}`,
    occurred_on: on,
  });

  if (inErr) {
    // Half a move is worse than none: the money would read as free to spend while it
    // was never anywhere but between two goals.
    if (out?.id)
      await supabase.from("money_transactions").delete().eq("id", out.id).eq("user_id", uid);
    return { error: saveErrorMessage(inErr) };
  }

  refresh();
  return { ok: true };
}

export async function closeGoal(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const goalId = String(formData.get("goal_id") ?? "").trim();
  const accountId = String(formData.get("account_id") ?? "").trim() || null;
  const on = String(formData.get("completed_at") ?? "").trim() || today();

  if (!goalId) return { error: "No goal to close." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const [ownsGoal, ownsAccount] = await Promise.all([
    ownsMoneyRow(supabase, "money_goals", goalId, uid),
    ownsMoneyRow(supabase, "money_accounts", accountId, uid),
  ]);
  if (!ownsGoal) return { error: "That goal is not on your profile." };
  if (!ownsAccount) return { error: "That account is not on your profile." };

  const { data: goal, error: goalError } = await supabase
    .from("money_goals")
    .select("name, completed_at")
    .eq("id", goalId)
    .eq("user_id", uid)
    .maybeSingle();
  if (goalError) return { error: unreadable("that goal") };
  if (!goal) return { error: "That goal is not on your profile." };
  if (goal.completed_at) return { error: "That goal is already closed." };

  const held = await goalBalance(supabase, uid, goalId);
  if (held === null) return { error: "Could not read what that goal holds. Try again." };

  if (held > PENNY) {
    if (!accountId) return { error: "Say which account the money that is left goes back to." };
    const { error } = await supabase.from("money_transactions").insert({
      kind: "withdraw",
      amount: held,
      currency: "RSD",
      rate: 1,
      account_id: accountId,
      goal_id: goalId,
      title: "Closed the goal",
      occurred_on: on,
    });
    if (error) return { error: saveErrorMessage(error) };
  }

  const { error } = await supabase
    .from("money_goals")
    .update({ completed_at: on })
    .eq("id", goalId)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/** Put a closed goal back to work. It comes out of the archive with it. */
export async function reopenGoal(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };
  if (!(await ownsMoneyRow(supabase, "money_goals", id, uid)))
    return { error: "That goal is not on your profile." };

  const { error } = await supabase
    .from("money_goals")
    .update({ completed_at: null, archived: false })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/**
 * Archive is tidying, not accounting: it only decides what the screen shows.
 *
 * Which is why it is offered on a closed goal and nothing else. An open goal still has
 * a claim on the money in an account, and hiding one would take that claim out of
 * sight while it went on quietly shrinking what is free to spend.
 */
export async function archiveGoal(id: string, archived: boolean): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };
  if (!(await ownsMoneyRow(supabase, "money_goals", id, uid)))
    return { error: "That goal is not on your profile." };

  if (archived) {
    const { data: goal, error: goalError } = await supabase
      .from("money_goals")
      .select("completed_at")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (goalError) return { error: unreadable("that goal") };
    if (!goal) return { error: "That goal is not on your profile." };
    if (!goal.completed_at)
      return { error: "Close the goal first — an open one is still holding money aside." };
  }

  const { error } = await supabase
    .from("money_goals")
    .update({ archived })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/**
 * Move a goal one place up or down the list.
 *
 * The whole open list is renumbered from its current order rather than two rows being
 * swapped: `sort` defaults to 0 for everything, and swapping two zeroes moves nothing.
 * A personal list of goals is short enough that writing all of them is the cheap way
 * to be certain the order is exactly what the screen just showed.
 */
export async function moveGoal(id: string, direction: "up" | "down"): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };
  if (!(await ownsMoneyRow(supabase, "money_goals", id, uid)))
    return { error: "That goal is not on your profile." };

  const { data: goals, error: readErr } = await supabase
    .from("money_goals")
    .select("id, sort")
    .eq("user_id", uid)
    .eq("archived", false)
    .is("completed_at", null)
    .order("sort")
    .order("created_at");
  if (readErr) return { error: saveErrorMessage(readErr) };

  const order = (goals ?? []).map((g) => g.id);
  const from = order.indexOf(id);
  if (from < 0) return { error: "That goal is not on the list." };

  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= order.length) return { ok: true }; // already at the end of the list

  /*
    Two rows change, so two rows are written.

    It used to renumber the whole list on every arrow press — N updates, one round trip
    each, and no transaction around them: a network blip halfway through left the list
    partly renumbered, which is a list in an order nobody chose. Swapping the pair's
    positions is the same result with a fixed cost, and the worst a failed second write
    can do is leave the order it already had.
  */
  const rows = goals ?? [];
  const [a, b] = [rows[from], rows[to]];

  // The two rows trade the `sort` values they already carry, so nothing else on the
  // list has to move and no number it was using is reused. Ties — two goals both left
  // at the default 0 — have no values to trade, so those fall back to their positions.
  const [sortA, sortB] =
    a.sort === b.sort ? [to, from] : [b.sort as number, a.sort as number];

  const { error: firstErr } = await supabase
    .from("money_goals")
    .update({ sort: sortA })
    .eq("id", a.id)
    .eq("user_id", uid);
  if (firstErr) return { error: saveErrorMessage(firstErr) };

  const { error: secondErr } = await supabase
    .from("money_goals")
    .update({ sort: sortB })
    .eq("id", b.id)
    .eq("user_id", uid);
  if (secondErr) {
    // Put the first one back rather than leaving two goals claiming the same place.
    await supabase
      .from("money_goals")
      .update({ sort: a.sort })
      .eq("id", a.id)
      .eq("user_id", uid);
    return { error: saveErrorMessage(secondErr) };
  }

  refresh();
  return { ok: true };
}
