"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { getRates } from "@/lib/data/money";
import { fetchNbsRates } from "@/lib/rates/nbs";
import { CURRENCIES, DEFAULT_CATEGORIES, nextDate, rateFor, type Currency } from "@/lib/money";

export type MoneyState = { ok?: boolean; error?: string } | undefined;

const PATHS = [
  "/private",
  "/private/money",
  "/private/budgets",
  "/private/goals",
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
  table: "money_accounts" | "money_categories" | "money_goals" | "money_recurring",
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
  const occurredOn = String(formData.get("occurred_on") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const returnTo = String(formData.get("return_to") ?? "").trim();

  if (!["expense", "income", "transfer", "saving"].includes(kind)) return { error: "Unknown kind." };
  if (!(amount > 0)) return { error: "Amount has to be greater than zero." };
  if (kind === "transfer" && (!accountId || !toAccountId || accountId === toAccountId))
    return { error: "A transfer needs two different accounts." };
  if (kind === "saving" && !goalId) return { error: "Pick the goal this saving belongs to." };

  const rates = await getRates();
  const manualRate = num(formData.get("rate"), 0);
  const rate = currency === "RSD" ? 1 : manualRate > 0 ? manualRate : rateFor(currency, rates);

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  // Only the links the kind actually keeps are worth checking — the rest are dropped.
  const toAccount = kind === "transfer" ? toAccountId : null;
  const category = kind === "expense" || kind === "income" ? categoryId : null;
  const goal = kind === "saving" ? goalId : null;

  const [ownsAccount, ownsToAccount, ownsCategory, ownsGoal] = await Promise.all([
    ownsMoneyRow(supabase, "money_accounts", accountId, uid),
    ownsMoneyRow(supabase, "money_accounts", toAccount, uid),
    ownsMoneyRow(supabase, "money_categories", category, uid),
    ownsMoneyRow(supabase, "money_goals", goal, uid),
  ]);
  if (!ownsAccount || !ownsToAccount) return { error: "That account is not on your profile." };
  if (!ownsCategory) return { error: "That category is not on your profile." };
  if (!ownsGoal) return { error: "That goal is not on your profile." };

  const payload = {
    kind,
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
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase
    .from("money_transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.error("deleteTransaction:", error.message);
  refresh();
  redirect("/private/money");
}

/** Same delete, but called from a row — no redirect, the caller refreshes in place. */
export async function removeTransaction(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

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

  const { error } = id
    ? await supabase.from("money_accounts").update(payload).eq("id", id).eq("user_id", uid)
    : await supabase.from("money_accounts").insert(payload);
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
  const targetRsd = num(formData.get("target_rsd"));
  const targetDate = String(formData.get("target_date") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;

  if (!name) return { error: "Name is required." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const payload = { name, target_rsd: targetRsd, target_date: targetDate, color };

  const { error } = id
    ? await supabase.from("money_goals").update(payload).eq("id", id).eq("user_id", uid)
    : await supabase.from("money_goals").insert(payload);
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

/* --------------------------------------------------------------- recurring */

export async function saveRecurring(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense") === "income" ? "income" : "expense";
  const variable = formData.get("variable") != null;
  const amount = variable ? 0 : num(formData.get("amount"));
  const currency = currencyOf(formData.get("currency"));
  const every = ["week", "month", "year"].includes(String(formData.get("every")))
    ? String(formData.get("every"))
    : "month";
  const nextOn = String(formData.get("next_on") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const accountId = String(formData.get("account_id") ?? "").trim() || null;
  const categoryId = String(formData.get("category_id") ?? "").trim() || null;
  const active = formData.get("active") != null;
  const installmentsRaw = String(formData.get("installments_total") ?? "").trim();
  const installmentsTotal = installmentsRaw ? Math.trunc(num(installmentsRaw)) : null;
  const endsOn = String(formData.get("ends_on") ?? "").trim() || null;

  if (!name) return { error: "Name is required." };
  if (!variable && !(amount > 0)) return { error: "Set an amount, or mark it as variable." };
  if (installmentsTotal != null && !(installmentsTotal > 0))
    return { error: "Number of payments has to be at least 1, or left empty." };
  if (endsOn && endsOn < nextOn) return { error: "The end date cannot fall before the next due date." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const [ownsAccount, ownsCategory] = await Promise.all([
    ownsMoneyRow(supabase, "money_accounts", accountId, uid),
    ownsMoneyRow(supabase, "money_categories", categoryId, uid),
  ]);
  if (!ownsAccount) return { error: "That account is not on your profile." };
  if (!ownsCategory) return { error: "That category is not on your profile." };

  const payload = {
    name,
    kind,
    amount,
    currency,
    variable,
    every,
    next_on: nextOn,
    account_id: accountId,
    category_id: categoryId,
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
  const [ownsAccount, ownsCategory] = await Promise.all([
    ownsMoneyRow(supabase, "money_accounts", item.account_id, uid),
    ownsMoneyRow(supabase, "money_categories", item.category_id, uid),
  ]);
  if (!ownsAccount || !ownsCategory)
    return { error: "This item points at an account or category that is not on your profile." };

  const rates = await getRates();
  const { error } = await supabase.from("money_transactions").insert({
    kind: item.kind,
    amount,
    currency: item.currency,
    rate: rateFor(item.currency, rates),
    account_id: item.account_id,
    category_id: item.category_id,
    recurring_id: item.id,
    note: item.name,
    occurred_on: item.next_on,
  });
  if (error) return { error: saveErrorMessage(error) };

  // One installment down. Whichever limit is reached first — the count or the end
  // date — pauses the item; the entries already booked stay untouched.
  const done = (item.installments_done ?? 0) + 1;
  const next = nextDate(item.next_on, item.every);
  const finished =
    (item.installments_total != null && done >= item.installments_total) ||
    (item.ends_on != null && next > item.ends_on);

  const { error: bumpErr } = await supabase
    .from("money_recurring")
    .update({
      next_on: next,
      installments_done: done,
      ...(finished ? { active: false } : {}),
    })
    .eq("id", id)
    .eq("user_id", uid);
  if (bumpErr) return { error: saveErrorMessage(bumpErr) };

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
    .select("id, next_on, every, ends_on")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!item) return { error: "Recurring item not found." };

  const next = nextDate(item.next_on, item.every);
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
