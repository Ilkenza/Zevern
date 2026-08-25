"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { todayISO } from "@/lib/format";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { getAccountBalances, getRates } from "@/lib/data/money";
import { fetchNbsRates } from "@/lib/rates/nbs";
import {
  CURRENCIES,
  DEFAULT_CATEGORIES,
  formatRsd,
  isTxKind,
  nextDate,
  rateFor,
  type Currency,
  anchorDayFor,
} from "@/lib/money";

export type MoneyState = { ok?: boolean; error?: string } | undefined;

const PATHS = [
  "/private",
  "/private/money",
  "/private/budgets",
  "/private/goals",
  "/private/upcoming",
  // The two addresses /private/upcoming replaced. They only redirect now, but they
  // are still linked from elsewhere, so their cache entries have to go too.
  "/private/recurring",
  "/private/forecast",
  "/private/setup",
  "/private/quick",
];

function refresh() {
  for (const p of PATHS) revalidatePath(p);
}

function num(value: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function currencyOf(value: FormDataEntryValue | null): Currency {
  const c = String(value ?? "RSD").toUpperCase();
  return (CURRENCIES as readonly string[]).includes(c) ? (c as Currency) : "RSD";
}

/**
 * True when `id` names a row of `table` that belongs to `uid` — or when `id` is null,
 * because "no account attached" is a legitimate answer.
 *
 * The same hole as elsewhere: these ids arrive from a select in a form, and RLS only
 * checks the transaction being written, never the account or category it points at.
 * Without this, a crafted request books your expense against someone else's account,
 * and the list then reads that account's name across the tenant boundary.
 *
 * `ownsRow` in `@/lib/supabase/current-user` does this for the agency tables; the
 * money tables are private to this workspace and stay with it.
 */
async function ownsMoneyRow(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table:
    | "money_accounts"
    | "money_categories"
    | "money_goals"
    | "money_recurring"
    | "money_planned",
  id: string | null,
  uid: string,
): Promise<boolean> {
  if (!id) return true;

  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("id", id)
    .eq("user_id", uid);

  if (error) {
    console.error("ownsMoneyRow:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/** Today, read in UTC — the same reading every screen uses, so nothing disagrees. */
/*
  `toISOString()` is UTC, and next.config pins the server to Europe/Belgrade — so
  between midnight and 02:00 this returned yesterday while `monthKey()` on the very
  next line returned today. An entry added at 00:30 on 1 September was stored as
  31 August, then hidden from a screen defaulting to September and quietly added to
  August's totals and August's budget. `todayISO()` is the local answer.
*/
function today(): string {
  return todayISO();
}

/**
 * A plain date, or null. Dates arrive from a date input, which means they can also
 * arrive from anything else — a move that wrote nonsense into `due_on` would put an
 * item somewhere no timeline could find it again.
 */
function plainDate(value: FormDataEntryValue | string | null): string | null {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isFinite(Date.parse(`${text}T00:00:00Z`)) ? text : null;
}

/**
 * What a goal holds right now, in RSD: what went in, less what came back out.
 *
 * `exclude` drops one entry, which is what an edit needs — otherwise changing an
 * existing withdrawal is measured against a balance that still contains it. Null on a
 * read failure rather than 0, so a caller can refuse instead of guessing.
 */
async function goalBalance(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  uid: string,
  goalId: string,
  exclude: string | null = null,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("money_transactions")
    .select("id, kind, amount_rsd")
    .eq("user_id", uid)
    .eq("goal_id", goalId)
    .in("kind", ["saving", "withdraw"]);

  if (error) {
    console.error("goalBalance:", error.message);
    return null;
  }

  let held = 0;
  for (const row of data ?? []) {
    if (exclude && row.id === exclude) continue;
    held += (row.kind === "saving" ? 1 : -1) * (Number(row.amount_rsd) || 0);
  }
  return held;
}

/** Rounding leaves ragged tenths of a dinar behind; do not fail a withdrawal over one. */
const PENNY = 0.01;

/* ------------------------------------------------------------ transactions */

export async function saveTransaction(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense");
  const amount = num(formData.get("amount"));
  const currency = currencyOf(formData.get("currency"));
  const accountId = String(formData.get("account_id") ?? "").trim() || null;
  const toAccountId = String(formData.get("to_account_id") ?? "").trim() || null;
  const categoryId = String(formData.get("category_id") ?? "").trim() || null;
  const goalId = String(formData.get("goal_id") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  // What the entry actually was — "Maxi, weekly shop", not just "Groceries". The full
  // form asks for it and will not submit without one; quick add offers it and lets you
  // skip, so null is a real answer here and the list falls back to the category name.
  const title = String(formData.get("title") ?? "").trim().slice(0, 80) || null;
  const occurredOn = String(formData.get("occurred_on") ?? "").trim() || today();
  const returnTo = String(formData.get("return_to") ?? "").trim();

  if (!isTxKind(kind)) return { error: "Unknown kind." };
  if (!(amount > 0)) return { error: "Amount has to be greater than zero." };
  if (kind === "transfer" && (!accountId || !toAccountId || accountId === toAccountId))
    return { error: "A transfer needs two different accounts." };
  if (kind === "saving" && !goalId) return { error: "Pick the goal this saving belongs to." };
  if (kind === "withdraw" && !goalId) return { error: "Pick the goal this money comes out of." };
  // Both directions name an account, because that is the account the money is being
  // held back from or handed back to. Without one, a goal would claim dinars that no
  // account has set aside, and the two screens would stop adding up.
  if (kind === "saving" && !accountId)
    return { error: "Pick the account this money is being set aside on." };
  if (kind === "withdraw" && !accountId)
    return { error: "Pick the account this money goes back to." };

  const rates = await getRates();
  const manualRate = num(formData.get("rate"), 0);
  const rate = currency === "RSD" ? 1 : manualRate > 0 ? manualRate : rateFor(currency, rates);

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  // Only the links the kind actually keeps are worth checking — the rest are dropped.
  const toAccount = kind === "transfer" ? toAccountId : null;
  const category = kind === "expense" || kind === "income" ? categoryId : null;
  const goal = kind === "saving" || kind === "withdraw" ? goalId : null;

  const [ownsAccount, ownsToAccount, ownsCategory, ownsGoal] = await Promise.all([
    ownsMoneyRow(supabase, "money_accounts", accountId, uid),
    ownsMoneyRow(supabase, "money_accounts", toAccount, uid),
    ownsMoneyRow(supabase, "money_categories", category, uid),
    ownsMoneyRow(supabase, "money_goals", goal, uid),
  ]);
  if (!ownsAccount || !ownsToAccount) return { error: "That account is not on your profile." };
  if (!ownsCategory) return { error: "That category is not on your profile." };
  if (!ownsGoal) return { error: "That goal is not on your profile." };

  if (goal) {
    // A closed goal has already handed its money back. Letting an entry land on one
    // would put dinars somewhere no account is reserving them.
    const { data: goalRow } = await supabase
      .from("money_goals")
      .select("completed_at")
      .eq("id", goal)
      .eq("user_id", uid)
      .maybeSingle();
    if (goalRow?.completed_at)
      return { error: "That goal is closed. Reopen it before moving money in or out." };
  }

  // amount_rsd is generated in the database as round(amount * rate, 2); worked out the
  // same way here so the check and the stored figure cannot disagree.
  const amountRsd = Math.round(amount * rate * 100) / 100;

  /*
    A deposit cannot reserve money the account does not have free.

    Setting aside does not move a dinar anywhere — it marks part of an account as
    spoken for. Nothing stopped that mark from covering more than the account held, and
    the moment it did every "free to spend" figure in the app was wrong by the
    difference, quietly, with no entry looking wrong on its own.

    `free` already nets off what other open goals claim. On an edit the entry's own old
    amount is part of that claim, so it is handed back before the comparison — raising
    a deposit from 5.000 to 6.000 has to answer for 1.000, not for 6.000.
  */
  if (kind === "saving" && accountId) {
    const balances = await getAccountBalances();
    const account = balances.find((a) => a.id === accountId);
    if (account) {
      let free = account.free;
      if (id) {
        const { data: previous } = await supabase
          .from("money_transactions")
          .select("kind, amount_rsd, account_id")
          .eq("id", id)
          .eq("user_id", uid)
          .maybeSingle();
        if (previous?.kind === "saving" && previous.account_id === accountId) {
          free += Number(previous.amount_rsd) || 0;
        }
      }

      if (amountRsd > free + PENNY)
        return {
          error:
            free > 0
              ? `${account.name} only has ${formatRsd(free)} free — the rest is already set aside for another goal.`
              : `${account.name} has nothing free to set aside. Every dinar on it is already claimed by a goal.`,
        };
    }
  }

  if (goal) {
    // A goal can never hold less than nothing, in either direction: you cannot take
    // out more than is there, and editing an old deposit downwards must not leave the
    // withdrawals against it dangling. Either would turn `reserved` negative and hand
    // the accounts free money that does not exist.
    const others = await goalBalance(supabase, uid, goal, id || null);
    if (others === null) return { error: "Could not read what that goal holds. Try again." };

    if (kind === "withdraw" && amountRsd > others + PENNY)
      return {
        error:
          others > 0
            ? `That goal only holds ${formatRsd(others)}.`
            : "That goal is empty — there is nothing to take out.",
      };

    if (kind === "saving" && others + amountRsd < -PENNY)
      return {
        error: `${formatRsd(-others)} has already been taken out of that goal, so this deposit cannot be smaller than that.`,
      };
  }

  const payload = {
    kind,
    title,
    amount,
    currency,
    rate,
    account_id: accountId,
    to_account_id: toAccount,
    category_id: category,
    goal_id: goal,
    note,
    occurred_on: occurredOn,
  };

  if (id) {
    const { error } = await supabase
      .from("money_transactions")
      .update(payload)
      .eq("id", id)
      .eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error) };
  } else {
    const { error } = await supabase.from("money_transactions").insert(payload);
    if (error) return { error: saveErrorMessage(error) };
  }

  refresh();
  if (returnTo) return { ok: true }; // stay on the page that asked (quick add, goals)
  redirect("/private/money");
}

export async function deleteTransaction(id: string) {
  const result = await removeTransaction(id);
  if (result?.error) console.error("deleteTransaction:", result.error);
  redirect("/private/money");
}

/** Same delete, but called from a row — no redirect, the caller refreshes in place. */
export async function removeTransaction(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { data: row } = await supabase
    .from("money_transactions")
    .select("kind, goal_id, amount_rsd")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();

  // Removing a deposit that has since been partly taken back out would leave the goal
  // holding less than nothing, and the accounts would count the difference as free.
  if (row?.kind === "saving" && row.goal_id) {
    const others = await goalBalance(supabase, uid, row.goal_id, id);
    if (others === null) return { error: "Could not read what that goal holds. Try again." };
    if (others < -PENNY)
      return {
        error: `Take the ${formatRsd(-others)} out of that goal back first — without this deposit there is nothing for it to have come out of.`,
      };
  }

  const { error } = await supabase
    .from("money_transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };
  refresh();
  return { ok: true };
}

/* ---------------------------------------------------------------- accounts */

export async function saveAccount(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "bank");
  const currency = currencyOf(formData.get("currency"));
  const openingBalance = num(formData.get("opening_balance"));
  const color = String(formData.get("color") ?? "").trim() || null;

  if (!name) return { error: "Name is required." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const payload = { name, kind, currency, opening_balance: openingBalance, color };

  if (id) {
    const { error } = await supabase
      .from("money_accounts")
      .update(payload)
      .eq("id", id)
      .eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error) };
  } else {
    // The first account is the default by definition — there is nothing to choose
    // between, and asking would be a question with one answer.
    const { count } = await supabase
      .from("money_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid);
    const { error } = await supabase
      .from("money_accounts")
      .insert({ ...payload, is_default: (count ?? 0) === 0 });
    if (error) return { error: saveErrorMessage(error) };
  }

  refresh();
  return { ok: true };
}

/**
 * Name the account every form starts on.
 *
 * Before this, "which account" was answered by whichever row sorted first, so the one
 * you actually spend from was the default only by accident — and stopped being it as
 * soon as you added another. The old default is cleared first because the database
 * refuses a second one outright.
 */
export async function setDefaultAccount(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };
  if (!(await ownsMoneyRow(supabase, "money_accounts", id, uid)))
    return { error: "That account is not on your profile." };

  const { error: clearErr } = await supabase
    .from("money_accounts")
    .update({ is_default: false })
    .eq("user_id", uid)
    .eq("is_default", true);
  if (clearErr) return { error: saveErrorMessage(clearErr) };

  const { error } = await supabase
    .from("money_accounts")
    .update({ is_default: true })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

export async function deleteAccount(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase
    .from("money_accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.error("deleteAccount:", error.message);
  refresh();
}

/* -------------------------------------------------------------- categories */

export async function saveCategory(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense") === "income" ? "income" : "expense";
  const color = String(formData.get("color") ?? "").trim() || null;

  if (!name) return { error: "Name is required." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const payload = { name, kind, color };

  const { error } = id
    ? await supabase.from("money_categories").update(payload).eq("id", id).eq("user_id", uid)
    : await supabase.from("money_categories").insert(payload);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

export async function deleteCategory(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase
    .from("money_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.error("deleteCategory:", error.message);
  refresh();
}

/** One tap to get a usable set of categories and a cash account on day one. */
export async function seedDefaults(): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { count } = await supabase
    .from("money_categories")
    .select("*", { count: "exact", head: true });
  if ((count ?? 0) === 0) {
    await supabase.from("money_categories").insert(
      DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sort: i, user_id: uid })),
    );
  }

  const { count: accounts } = await supabase
    .from("money_accounts")
    .select("*", { count: "exact", head: true });
  if ((accounts ?? 0) === 0) {
    await supabase.from("money_accounts").insert([
      { name: "Cash", kind: "cash", currency: "RSD", user_id: uid, sort: 0 },
      { name: "Bank (RSD)", kind: "bank", currency: "RSD", user_id: uid, sort: 1 },
    ]);
  }

  refresh();
  return { ok: true };
}

/* ----------------------------------------------------------------- budgets */

/** Save every category limit in one submit; a limit of 0 removes the budget. */
export async function saveBudgets(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const upserts: { user_id: string; category_id: string; amount_rsd: number }[] = [];
  const clears: string[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("limit_")) continue;
    const categoryId = key.slice("limit_".length);
    const amount = num(value);
    if (amount > 0) upserts.push({ user_id: uid, category_id: categoryId, amount_rsd: amount });
    else clears.push(categoryId);
  }

  if (upserts.length) {
    // The category ids ride in on the field names, so they need the same check as any
    // other foreign key from a form. The clears do not: that delete is already fenced
    // by user_id, so a foreign id there matches nothing.
    const owned = await Promise.all(
      upserts.map((u) => ownsMoneyRow(supabase, "money_categories", u.category_id, uid)),
    );
    if (owned.some((ok) => !ok)) return { error: "That category is not on your profile." };

    const { error } = await supabase
      .from("money_budgets")
      .upsert(upserts, { onConflict: "user_id,category_id" });
    if (error) return { error: saveErrorMessage(error) };
  }
  if (clears.length) {
    const { error } = await supabase
      .from("money_budgets")
      .delete()
      .eq("user_id", uid)
      .in("category_id", clears);
    if (error) return { error: saveErrorMessage(error) };
  }

  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------- goals */

export async function saveGoal(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const targetAmount = num(formData.get("target_amount"));
  const currency = currencyOf(formData.get("currency"));
  const targetDate = String(formData.get("target_date") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;

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
    ({ error } = await supabase
      .from("money_goals")
      .update(payload)
      .eq("id", id)
      .eq("user_id", uid));
  } else {
    // A new goal joins at the bottom of the list rather than jumping the queue. The
    // default is 0 for every goal, so without this the order would be creation order
    // again the moment anything is added.
    const { data: last } = await supabase
      .from("money_goals")
      .select("sort")
      .eq("user_id", uid)
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ error } = await supabase
      .from("money_goals")
      .insert({ ...payload, sort: (last?.sort ?? -1) + 1 }));
  }
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  redirect("/private/goals");
}

export async function deleteGoal(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase
    .from("money_goals")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.error("deleteGoal:", error.message);
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

  const { data: goal } = await supabase
    .from("money_goals")
    .select("name, completed_at")
    .eq("id", goalId)
    .eq("user_id", uid)
    .maybeSingle();
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
    const { data: goal } = await supabase
      .from("money_goals")
      .select("completed_at")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
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
    .select("id")
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

  [order[from], order[to]] = [order[to], order[from]];

  for (const [i, goalId] of order.entries()) {
    const { error } = await supabase
      .from("money_goals")
      .update({ sort: i })
      .eq("id", goalId)
      .eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error) };
  }

  refresh();
  return { ok: true };
}

/* --------------------------------------------------------------- recurring */

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
  const variable = goalId ? false : formData.get("variable") != null;
  const amount = variable ? 0 : num(formData.get("amount"));
  const currency = currencyOf(formData.get("currency"));
  const every = ["week", "month", "year"].includes(String(formData.get("every")))
    ? String(formData.get("every"))
    : "month";
  const nextOn = String(formData.get("next_on") ?? "").trim() || today();
  const accountId = String(formData.get("account_id") ?? "").trim() || null;
  const categoryId = goalId ? null : String(formData.get("category_id") ?? "").trim() || null;
  const active = formData.get("active") != null;
  const installmentsRaw = String(formData.get("installments_total") ?? "").trim();
  const installmentsTotal = installmentsRaw ? Math.trunc(num(installmentsRaw)) : null;
  const endsOn = String(formData.get("ends_on") ?? "").trim() || null;

  if (!name) return { error: "Name is required." };
  if (!variable && !(amount > 0)) return { error: "Set an amount, or mark it as variable." };
  if (installmentsTotal != null && !(installmentsTotal > 0))
    return { error: "Number of payments has to be at least 1, or left empty." };
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
    const { data: goal } = await supabase
      .from("money_goals")
      .select("completed_at")
      .eq("id", goalId)
      .eq("user_id", uid)
      .maybeSingle();
    if (goal?.completed_at)
      return { error: "That goal is closed. Reopen it before setting money to go in." };
  }

  const payload = {
    name,
    kind,
    amount,
    currency,
    variable,
    every,
    next_on: nextOn,
    // The day the rule belongs to, kept so a February can never re-anchor it.
    anchor_day: anchorDayFor(nextOn, every),
    account_id: accountId,
    category_id: categoryId,
    goal_id: goalId,
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
  if (!uid) return;

  const { error } = await supabase
    .from("money_recurring")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.error("deleteRecurring:", error.message);
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

  const { data: item } = await supabase
    .from("money_recurring")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
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
    const { data: goal } = await supabase
      .from("money_goals")
      .select("name, completed_at")
      .eq("id", item.goal_id as string)
      .eq("user_id", uid)
      .maybeSingle();
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
  const next = nextDate(item.next_on, item.every, item.anchor_day);
  const finished =
    (item.installments_total != null && done >= item.installments_total) ||
    (item.ends_on != null && next > item.ends_on);

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

  const { data: item } = await supabase
    .from("money_recurring")
    .select("id, next_on, every, ends_on, anchor_day")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!item) return { error: "Recurring item not found." };

  const next = nextDate(item.next_on, item.every, item.anchor_day);
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

  const today = new Date().toISOString().slice(0, 10);
  const { data: due } = await supabase
    .from("money_recurring")
    .select("id, next_on, created_at")
    .eq("user_id", uid)
    .eq("active", true)
    .eq("variable", false)
    .gt("amount", 0)
    .lte("next_on", today);

  for (const item of due ?? []) {
    // An item entered today with today's date must not book itself the moment it is saved.
    if (String(item.created_at).slice(0, 10) >= item.next_on) continue;
    await postRecurring(item.id);
  }
  refresh();
  return { ok: true };
}

/* ----------------------------------------------------------------- planned */

/**
 * A one-off that is already known about: the dentist, the tax payment, the invoice
 * landing on the 20th. Deliberately not a recurring rule with one instalment — a rule
 * is a standing arrangement, this is a single dated fact that is either still coming
 * or already dealt with.
 */
export async function savePlanned(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense") === "income" ? "income" : "expense";
  const amount = num(formData.get("amount"));
  const currency = currencyOf(formData.get("currency"));
  const dueOn = plainDate(formData.get("due_on")) ?? today();
  const accountId = String(formData.get("account_id") ?? "").trim() || null;
  const categoryId = String(formData.get("category_id") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!name) return { error: "Name is required." };
  if (!(amount > 0)) return { error: "Amount has to be greater than zero." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const [ownsAccount, ownsCategory, ownsPlan] = await Promise.all([
    ownsMoneyRow(supabase, "money_accounts", accountId, uid),
    ownsMoneyRow(supabase, "money_categories", categoryId, uid),
    ownsMoneyRow(supabase, "money_planned", id || null, uid),
  ]);
  if (!ownsAccount) return { error: "That account is not on your profile." };
  if (!ownsCategory) return { error: "That category is not on your profile." };
  if (!ownsPlan) return { error: "That planned item is not on your profile." };

  if (id) {
    // Once it has happened, the entry in the ledger is what carries the money. Editing
    // the plan behind it would let the two disagree about the same event.
    const { data: existing } = await supabase
      .from("money_planned")
      .select("settled_at")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (!existing) return { error: "That planned item is not on your profile." };
    if (existing.settled_at)
      return { error: "This one has already happened. Edit the entry in Money instead." };
  }

  const payload = {
    name,
    kind,
    amount,
    currency,
    account_id: accountId,
    category_id: categoryId,
    due_on: dueOn,
    note,
  };

  const { error } = id
    ? await supabase.from("money_planned").update(payload).eq("id", id).eq("user_id", uid)
    : await supabase.from("money_planned").insert(payload);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/** It did not happen after all. The plan goes, and nothing is left behind pointing at it. */
export async function removePlanned(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };
  if (!(await ownsMoneyRow(supabase, "money_planned", id, uid)))
    return { error: "That planned item is not on your profile." };

  const { data: plan } = await supabase
    .from("money_planned")
    .select("settled_at")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!plan) return { error: "That planned item is not on your profile." };
  if (plan.settled_at)
    return {
      error: "This one has already happened. Remove its entry in Money if it was a mistake.",
    };

  const { error } = await supabase
    .from("money_planned")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/**
 * It happened. One act: the real entry is written into the ledger, and the plan is
 * marked settled against that entry.
 *
 * From that moment the plan is off the timeline and the entry is on the accounts, so
 * the money is counted exactly once. If the plan cannot be marked — because something
 * else settled it a second earlier — the entry is taken back out again rather than
 * left behind as a second copy of the same payment.
 */
export async function settlePlanned(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("planned_id") ?? "").trim();
  const override = num(formData.get("amount"), 0);
  const accountOverride = String(formData.get("account_id") ?? "").trim() || null;
  const occurredOn = plainDate(formData.get("occurred_on"));

  if (!id) return { error: "No planned item to settle." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };
  if (!(await ownsMoneyRow(supabase, "money_planned", id, uid)))
    return { error: "That planned item is not on your profile." };

  const { data: plan } = await supabase
    .from("money_planned")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!plan) return { error: "That planned item is not on your profile." };
  if (plan.settled_at) return { error: "That one has already been settled." };

  const amount = override > 0 ? override : Number(plan.amount);
  if (!(amount > 0)) return { error: "Say what it actually came to before booking it." };

  const accountId = accountOverride ?? plan.account_id;
  // The plan is ours, but the rows it points at are only checked when it is saved —
  // an older one can still name something that is not. Copying that onto a
  // transaction would carry the bad link into the ledger.
  const [ownsAccount, ownsCategory] = await Promise.all([
    ownsMoneyRow(supabase, "money_accounts", accountId, uid),
    ownsMoneyRow(supabase, "money_categories", plan.category_id, uid),
  ]);
  if (!ownsAccount) return { error: "That account is not on your profile." };
  if (!ownsCategory) return { error: "That category is not on your profile." };

  const on = occurredOn ?? plan.due_on;
  const rates = await getRates();

  const { data: entry, error } = await supabase
    .from("money_transactions")
    .insert({
      kind: plan.kind === "income" ? "income" : "expense",
      amount,
      currency: plan.currency,
      rate: rateFor(plan.currency, rates),
      account_id: accountId,
      category_id: plan.category_id,
      title: plan.name,
      occurred_on: on,
    })
    .select("id")
    .single();
  if (error || !entry) return { error: saveErrorMessage(error) };

  const { data: settled, error: markErr } = await supabase
    .from("money_planned")
    .update({ settled_at: on, transaction_id: entry.id })
    .eq("id", id)
    .eq("user_id", uid)
    .is("settled_at", null)
    .select("id");

  if (markErr || (settled ?? []).length === 0) {
    // The entry would otherwise sit in the ledger with nothing marking the plan as
    // done, and the timeline would go on predicting a payment that has been made.
    await supabase.from("money_transactions").delete().eq("id", entry.id).eq("user_id", uid);
    return { error: markErr ? saveErrorMessage(markErr) : "That one has already been settled." };
  }

  refresh();
  return { ok: true };
}

/** Move a planned item to a different date — the first lever on a shortfall. */
export async function movePlanned(id: string, dueOn: string): Promise<MoneyState> {
  const date = plainDate(dueOn);
  if (!date) return { error: "That is not a date." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };
  if (!(await ownsMoneyRow(supabase, "money_planned", id, uid)))
    return { error: "That planned item is not on your profile." };

  const { data: plan } = await supabase
    .from("money_planned")
    .select("settled_at")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!plan) return { error: "That planned item is not on your profile." };
  if (plan.settled_at) return { error: "That one has already happened, so its date is settled." };

  const { error } = await supabase
    .from("money_planned")
    .update({ due_on: date })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/**
 * Move a recurring rule's next due date. Every later date is worked out from this one,
 * so the whole run shifts with it — which is exactly what pushing a payment back means.
 */
export async function moveRecurringNext(id: string, nextOn: string): Promise<MoneyState> {
  const date = plainDate(nextOn);
  if (!date) return { error: "That is not a date." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };
  if (!(await ownsMoneyRow(supabase, "money_recurring", id, uid)))
    return { error: "That rule is not on your profile." };

  const { data: item } = await supabase
    .from("money_recurring")
    .select("ends_on, every")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!item) return { error: "Recurring item not found." };
  if (item.ends_on != null && date > item.ends_on)
    return { error: `That is past ${item.ends_on}, the date this one stops.` };

  const { error } = await supabase
    .from("money_recurring")
    .update({ next_on: date, anchor_day: anchorDayFor(date, item.every) })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/* -------------------------------------------------------- everyday spending */

/** How the timeline projects everyday spending: off, from budgets, or from history. */
export async function saveSpendingBasis(basis: string): Promise<MoneyState> {
  if (basis !== "off" && basis !== "budgets" && basis !== "history")
    return { error: "Unknown basis." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ spending_basis: basis })
    .eq("id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------- rates */

/**
 * Pull today's NBS middle rate instead of typing it. Past entries keep the rate they
 * were saved with, so this only affects what gets converted from here on.
 */
export async function refreshRatesFromNbs(): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  let rates;
  try {
    rates = await fetchNbsRates();
  } catch (cause) {
    console.error("refreshRatesFromNbs:", cause);
    return { error: "Could not reach the exchange rate service. The rates are unchanged." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      rate_eur: rates.eur.middle,
      rate_usd: rates.usd.middle,
      rates_updated_on: rates.eur.date || new Date().toISOString().slice(0, 10),
    })
    .eq("id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------ colours */

/** How many saved colours are worth keeping before the list stops being a shortlist. */
const MAX_CUSTOM_COLORS = 16;

/**
 * Keep a colour the owner mixed on the wheel. Newest first, no duplicates, and the
 * oldest fall off the end — a palette, not a history.
 */
export async function saveCustomColor(hex: string): Promise<MoneyState> {
  const clean = hex.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(clean)) return { error: "That is not a colour." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("custom_colors")
    .eq("id", uid)
    .maybeSingle();

  const existing = ((profile?.custom_colors ?? []) as string[]).filter((c) => c !== clean);
  const next = [clean, ...existing].slice(0, MAX_CUSTOM_COLORS);

  const { error } = await supabase
    .from("profiles")
    .update({ custom_colors: next })
    .eq("id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/* -------------------------------------------------------------------- rates */

export async function saveRates(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const eur = num(formData.get("rate_eur"));
  const usd = num(formData.get("rate_usd"));
  if (!(eur > 0) || !(usd > 0)) return { error: "Both rates have to be greater than zero." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({
      rate_eur: eur,
      rate_usd: usd,
      rates_updated_on: new Date().toISOString().slice(0, 10),
    })
    .eq("id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}
