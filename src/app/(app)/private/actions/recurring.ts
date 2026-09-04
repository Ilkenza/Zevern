"use server";

import {
getGoalRemaining,
getRates
} from "@/lib/data/money";
import { todayISO } from "@/lib/format";
import {
anchorDayFor,
CURRENCIES,
nextDate,
rateFor
} from "@/lib/money";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage, deleteErrorMessage } from "@/lib/supabase/errors";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
currencyOf,
MoneyState,
num,
ownsMoneyRow,
PENNY,
refresh,
today
} from "./shared";
import { unreadable } from "@/lib/data/must";

/* --------------------------------------------------------------- recurring */

/* ------------------------------------------------------------------ debts */

/**
 * A debt, in either direction.
 *
 * `total_rsd` is what will be settled in the end rather than what changed hands. For a
 * friend those are the same figure. For a credit they are not — 550.000 arrives and
 * 600.000 is repaid — and storing the repayment total is what lets the balance run to
 * exactly zero on the last instalment, with the interest accounted for by the plain
 * fact that less arrived than leaves. Asking for the amount that landed instead would
 * leave every credit ending 50.000 in the red for no reason anyone could see.
 */
export async function saveLoan(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const direction = String(formData.get("direction") ?? "lent");
  const total = num(formData.get("total"));
  const openedOn = String(formData.get("opened_on") ?? "").trim() || today();
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  if (!name) return { error: "Give it a name — whose debt it is, or what it paid for." };
  if (direction !== "lent" && direction !== "borrowed") return { error: "Unknown direction." };
  if (!(total > 0)) return { error: "The total has to be greater than zero." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const payload = { name, direction, total_rsd: total, opened_on: openedOn, note };

  if (id) {
    const { error } = await supabase
      .from("money_loans")
      .update(payload)
      .eq("id", id)
      .eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error) };
  } else {
    const { error } = await supabase.from("money_loans").insert(payload);
    if (error) return { error: saveErrorMessage(error) };
  }

  refresh();
  return { ok: true };
}

/**
 * Call it done, or put it back.
 *
 * Settling is a date rather than a flag so a closed debt keeps saying when it closed —
 * and so reopening one is the same edit in reverse rather than a second column that
 * can disagree with the first.
 *
 * It is deliberately possible to settle a debt that still has an outstanding balance.
 * Someone forgave the rest, someone rounded it off over a coffee, or the entries were
 * never going to add up in the first place. Refusing that would leave a row that can
 * never be closed, which is how a list stops being read.
 */
export async function settleLoan(id: string, settled: boolean): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("money_loans")
    .update({ settled_on: settled ? today() : null })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/**
 * Forget the debt, keep the entries.
 *
 * `loan_id` is `on delete set null`, so what is lost is the fact that those movements
 * belonged together — not the movements. Money really did leave the account when it
 * was lent, and deleting the note about who has it would be the app editing history to
 * tidy its own list.
 */
export async function deleteLoan(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase.from("money_loans").delete().eq("id", id).eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

export async function saveRecurring(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const goalId = String(formData.get("goal_id") ?? "").trim() || null;
  // A standing order into a goal is money put aside, never money coming in, and it
  // belongs to a goal rather than to a spending category.
  const kind = goalId
    ? "expense"
    : String(formData.get("kind") ?? "expense") === "income"
      ? "income"
      : "expense";
  /*
    The debt this rule is the instalment plan of.

    A goal rule and a loan rule are opposite errands — one puts money aside, the other
    pays money back — so a rule is never both. The goal wins if somehow both arrive,
    because a goal rule books a `saving` and there would be nothing for a debt to
    measure against.
  */
  const loanId = goalId ? null : String(formData.get("loan_id") ?? "").trim() || null;
  const variable = goalId ? false : formData.get("variable") != null;
  const amount = variable ? 0 : num(formData.get("amount"));
  const currency = currencyOf(formData.get("currency"));
  /*
    What this one is *shown* in, which is a different question from what it is billed
    in. Empty means "whatever the profile says", and that is the answer for almost every
    rule — so it is stored as null rather than as a copy of the current default, which
    would silently stop following it the day that changes.
  */
  const shownRaw = String(formData.get("display_currency") ?? "").trim();
  const displayCurrency =
    shownRaw && (CURRENCIES as readonly string[]).includes(shownRaw) ? shownRaw : null;
  const every = ["day", "week", "month", "year"].includes(String(formData.get("every")))
    ? String(formData.get("every"))
    : "month";
  // The count next to the unit. "Every 6 months" and "every 2 weeks" are the two
  // cadences people actually asked for and neither could be written down before.
  const everyCount = Math.min(60, Math.max(1, Math.floor(num(formData.get("every_count"), 1))));
  const nextOn = String(formData.get("next_on") ?? "").trim() || today();
  const accountId = String(formData.get("account_id") ?? "").trim() || null;
  const categoryId = goalId ? null : String(formData.get("category_id") ?? "").trim() || null;
  const active = formData.get("active") != null;
  const installmentsRaw = String(formData.get("installments_total") ?? "").trim();
  /*
    When this stops, said once instead of inferred.

    It used to be read off whichever column happened to be filled in, which meant a rule
    carrying both an end date and a count meant whatever the reading code checked first.
    The condition is now the fact, and the columns that do not belong to it are cleared
    — so a rule switched from "for 12 months" to "forever" cannot keep a count that
    quietly stops it next year.
  */
  const endsWhenRaw = String(formData.get("ends_when") ?? "never");
  const endsWhen = ["never", "date", "installments", "goal"].includes(endsWhenRaw)
    ? endsWhenRaw
    : "never";
  const installmentsTotal =
    endsWhen === "installments" && installmentsRaw ? Math.trunc(num(installmentsRaw)) : null;
  const endsOn =
    endsWhen === "date" ? String(formData.get("ends_on") ?? "").trim() || null : null;

  if (!name) return { error: "Name is required." };
  if (!variable && !(amount > 0)) return { error: "Set an amount, or mark it as variable." };
  if (endsWhen === "installments" && !(installmentsTotal != null && installmentsTotal > 0))
    return { error: "Say how many payments there are, or pick another way for it to end." };
  if (endsWhen === "date" && !endsOn) return { error: "Pick the date it stops on." };
  // The goal is what tells this one it is finished; without one the condition has
  // nothing to watch and the rule would run for ever while claiming otherwise.
  if (endsWhen === "goal" && !goalId)
    return { error: "Only a rule paying into a goal can stop when that goal is full." };
  if (endsOn && endsOn < nextOn) return { error: "The end date cannot fall before the next due date." };
  // The account is what the money is set aside on, so a goal rule cannot do without one.
  if (goalId && !accountId) return { error: "Pick the account this comes off every time." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const [ownsAccount, ownsCategory, ownsGoal] = await Promise.all([
    ownsMoneyRow(supabase, "money_accounts", accountId, uid),
    ownsMoneyRow(supabase, "money_categories", categoryId, uid),
    ownsMoneyRow(supabase, "money_goals", goalId, uid),
  ]);
  if (!ownsAccount) return { error: "That account is not on your profile." };
  if (!ownsCategory) return { error: "That category is not on your profile." };
  if (!ownsGoal) return { error: "That goal is not on your profile." };

  if (goalId) {
    const { data: goal, error: goalError } = await supabase
      .from("money_goals")
      .select("completed_at")
      .eq("id", goalId)
      .eq("user_id", uid)
      .maybeSingle();
    if (goalError) return { error: unreadable("that goal") };
    if (goal?.completed_at)
      return { error: "That goal is closed. Reopen it before setting money to go in." };
  }

  const payload = {
    display_currency: displayCurrency,
    name,
    kind,
    amount,
    currency,
    variable,
    every,
    every_count: everyCount,
    ends_when: endsWhen,
    next_on: nextOn,
    // The day the rule belongs to, kept so a February can never re-anchor it.
    anchor_day: anchorDayFor(nextOn, every),
    account_id: accountId,
    category_id: categoryId,
    goal_id: goalId,
    loan_id: loanId,
    active,
    installments_total: installmentsTotal,
    ends_on: endsOn,
  };

  // installments_done is never touched here — editing an item must not rewrite its history.
  const { error } = id
    ? await supabase.from("money_recurring").update(payload).eq("id", id).eq("user_id", uid)
    : await supabase.from("money_recurring").insert(payload);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  redirect("/private/recurring");
}

export async function deleteRecurring(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("money_recurring")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: deleteErrorMessage(error, "this rule") };
  refresh();
  redirect("/private/recurring");
}

/** Row delete — no redirect. Already booked entries stay; only the repeat stops. */
export async function removeRecurring(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("money_recurring")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };
  refresh();
  return { ok: true };
}

/** Pause or resume a recurring item straight from the list. */
export async function toggleRecurring(id: string, active: boolean): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("money_recurring")
    .update({ active })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };
  refresh();
  return { ok: true };
}

/**
 * Book one occurrence of a recurring item and move it to its next date.
 * `amountOverride` carries the number for variable items (struja is never the same twice).
 *
 * A rule pointing at a goal books a saving against that goal instead of an expense —
 * same countdown, same end date, but the money is set aside rather than spent.
 */
export async function postRecurring(id: string, amountOverride?: number): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { data: item, error: itemError } = await supabase
    .from("money_recurring")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (itemError) return { error: unreadable("that repeating item") };
  if (!item) return { error: "Recurring item not found." };

  const amount = amountOverride != null && amountOverride > 0 ? amountOverride : Number(item.amount);
  if (!(amount > 0)) return { error: "This one needs an amount before it can be booked." };

  // The item is ours, but its links only became ours after the check in saveRecurring
  // existed — an item saved before that can still point somewhere else. Copying those
  // ids onto a transaction would carry the bad link forward.
  const [ownsAccount, ownsCategory, ownsGoal] = await Promise.all([
    ownsMoneyRow(supabase, "money_accounts", item.account_id, uid),
    ownsMoneyRow(supabase, "money_categories", item.category_id, uid),
    ownsMoneyRow(supabase, "money_goals", item.goal_id, uid),
  ]);
  if (!ownsAccount || !ownsCategory || !ownsGoal)
    return {
      error: "This item points at an account, category or goal that is not on your profile.",
    };

  const toGoal = item.goal_id != null;

  if (toGoal) {
    // A goal rule needs somewhere to set the money aside from, or the goal would claim
    // dinars no account is holding back.
    if (!item.account_id)
      return { error: "Give this one an account before it can put money aside." };

    // Nothing should keep feeding a goal that has been closed. Pause it rather than
    // failing again every time the page is opened.
    const { data: goal, error: goalError } = await supabase
      .from("money_goals")
      .select("name, completed_at")
      .eq("id", item.goal_id as string)
      .eq("user_id", uid)
      .maybeSingle();
    if (goalError) return { error: unreadable("that goal") };
    if (goal?.completed_at) {
      await supabase
        .from("money_recurring")
        .update({ active: false })
        .eq("id", id)
        .eq("user_id", uid);
      refresh();
      return { error: `${goal.name} is closed, so this rule has been paused.` };
    }
  }

  const rates = await getRates();
  const { data: booked, error } = await supabase
    .from("money_transactions")
    .insert({
      kind: toGoal ? "saving" : item.kind,
      amount,
      currency: item.currency,
      rate: rateFor(item.currency, rates),
      account_id: item.account_id,
      category_id: toGoal ? null : item.category_id,
      goal_id: item.goal_id,
      /*
        The instalment carries the debt forward.

        Without this the rate posts as an ordinary expense and the debt never moves —
        you would watch 50.000 leave every month while the panel kept saying you owe
        600.000. The link is what turns a repeating expense into a repayment.
      */
      loan_id: toGoal ? null : item.loan_id,
      recurring_id: item.id,
      // The rule already has a name; the entry it books carries it as its own.
      title: item.name,
      occurred_on: item.next_on,
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: saveErrorMessage(error) };

  // One installment down. Whichever limit is reached first — the count or the end
  // date — pauses the item; the entries already booked stay untouched.
  const done = (item.installments_done ?? 0) + 1;
  const next = nextDate(item.next_on, item.every, item.anchor_day, item.every_count ?? 1);
  /*
    "Until the goal is full" is the one end condition the rule cannot answer on its own,
    because the answer is in the ledger: the goal fills from this rule, from money put
    in by hand, and empties again when some is taken back out. So it is asked here, of
    what the goal actually holds now that this booking has landed — which also means an
    extra deposit made by hand genuinely brings the finish forward, rather than the rule
    carrying on to a count nobody is keeping.
  */
  const goalFull =
    item.ends_when === "goal" && item.goal_id != null
      ? ((await getGoalRemaining()).get(item.goal_id) ?? 0) <= PENNY
      : false;
  const finished =
    (item.installments_total != null && done >= item.installments_total) ||
    (item.ends_on != null && next > item.ends_on) ||
    goalFull;

  /*
    The date this booked is part of the condition, not just part of the payload.

    Two things fire this without a person asking: DueRecurringPanel books everything
    due from an effect on mount, and that panel is on both /private and
    /private/upcoming. Navigate between them while the first run is still going — or
    just keep both tabs open — and a second run reads the same `next_on` for every
    rule and books the month again. Rent twice, `installments_done` up by one instead
    of two, `next_on` advanced a single period, and no error anywhere.

    Guarding the bump on the date we read means the loser of that race updates zero
    rows and knows it, so it can take its own entry back out. `settlePlanned` already
    worked this way; this is the same shape.
  */
  const { data: bumped, error: bumpErr } = await supabase
    .from("money_recurring")
    .update({
      next_on: next,
      installments_done: done,
      ...(finished ? { active: false } : {}),
    })
    .eq("id", id)
    .eq("user_id", uid)
    .eq("next_on", item.next_on)
    .select("id")
    .maybeSingle();

  if (bumpErr || !bumped) {
    // Somebody else advanced this rule between our read and our write, so the entry we
    // just made is a duplicate of theirs. Take it back out rather than leaving it.
    if (booked?.id) {
      const { error: undoErr } = await supabase
        .from("money_transactions")
        .delete()
        .eq("id", booked.id)
        .eq("user_id", uid);
      if (undoErr) console.error("postRecurring rollback:", undoErr.message);
    }
    if (bumpErr) return { error: saveErrorMessage(bumpErr) };
    // Not an error the person needs to see: the booking they wanted did happen, just
    // on the other request.
    refresh();
    return { ok: true };
  }

  refresh();
  return { ok: true };
}

/** Skip an occurrence without booking it — a skip is not an installment paid. */
export async function skipRecurring(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { data: item, error: itemError } = await supabase
    .from("money_recurring")
    .select("id, next_on, every, every_count, ends_on, anchor_day")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (itemError) return { error: unreadable("that repeating item") };
  if (!item) return { error: "Recurring item not found." };

  const next = nextDate(item.next_on, item.every, item.anchor_day, item.every_count ?? 1);
  const { error } = await supabase
    .from("money_recurring")
    .update({
      next_on: next,
      ...(item.ends_on != null && next > item.ends_on ? { active: false } : {}),
    })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };
  refresh();
  return { ok: true };
}

/** Every due fixed-amount item, booked in one go. Variable ones are left alone. */
export async function postAllDueFixed(): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const today = todayISO();
  const { data: due, error: dueError } = await supabase
    .from("money_recurring")
    .select("id, next_on, created_at")
    .eq("user_id", uid)
    .eq("active", true)
    .eq("variable", false)
    .gt("amount", 0)
    .lte("next_on", today);
  if (dueError) return { error: unreadable("what is due") };

  for (const item of due ?? []) {
    // An item entered today with today's date must not book itself the moment it is saved.
    if (String(item.created_at).slice(0, 10) >= item.next_on) continue;
    await postRecurring(item.id);
  }
  refresh();
  return { ok: true };
}
