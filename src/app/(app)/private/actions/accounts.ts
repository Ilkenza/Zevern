"use server";

import {
getAccountBalances,
getRates
} from "@/lib/data/money";
import { todayISO } from "@/lib/format";
import {
rateFor,
type Currency
} from "@/lib/money";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
currencyOf,
hexColor,
MoneyState,
num,
ownsMoneyRow,
refresh
} from "./shared";

/* ---------------------------------------------------------------- accounts */

export async function saveAccount(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "bank");
  const currency = currencyOf(formData.get("currency"));
  const openingBalance = num(formData.get("opening_balance"));
  const color = hexColor(formData.get("color"));

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
/**
 * The currency every new form opens on.
 *
 * Hard-coded as dinars everywhere, which is right for someone paid in dinars and a
 * small tax on every entry for anyone who is not. Stored on the profile and read once
 * at the top of the app, so no form has to be handed it.
 */
export async function setDefaultCurrency(code: string): Promise<MoneyState> {
  const currency = currencyOf(code);

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ default_currency: currency })
    .eq("id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

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

/**
 * Tell the app what an account actually holds, and let it write down the difference.
 *
 * The alternative people reach for is an invented expense, and it is worse than the
 * gap it closes: it lands in "where it went", eats a category's limit, and joins the
 * month's spending as something that was spent. The figures agree again and every one
 * of them is now wrong.
 *
 * So the difference is logged as what it is. It moves the balance and nothing else —
 * every total in the app names the kinds it counts, and `correction` is not among
 * them. The figure carries its own sign, because a correction has no story to take a
 * direction from: it is the distance between belief and fact, and that distance goes
 * either way.
 */
export async function correctBalance(
  accountId: string,
  actual: number,
  note?: string,
): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };
  if (!(await ownsMoneyRow(supabase, "money_accounts", accountId, uid)))
    return { error: "That account is not on your profile." };
  if (!Number.isFinite(actual)) return { error: "That is not a figure." };

  /*
    Measured against the balance the app computes, not against a figure the form sent
    up with it. Between opening the screen and pressing the button an entry may have
    landed, and a difference worked out from a stale total would bake that entry's
    value into the correction — quietly doubling it.
  */
  const accounts = await getAccountBalances();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { error: "That account is not on your profile." };

  const rate = rateFor(account.currency as Currency, await getRates());
  const believedInAccountCurrency = Math.round((account.balance / rate) * 100) / 100;
  const difference = Math.round((actual - believedInAccountCurrency) * 100) / 100;

  /* Nothing to repair is not an error, and it should not leave a row saying nothing. */
  if (difference === 0) return { ok: true };

  const { error } = await supabase.from("money_transactions").insert({
    user_id: uid,
    kind: "correction",
    account_id: accountId,
    amount: difference,
    currency: account.currency,
    rate,
    title: "Balance correction",
    note: note?.trim() || null,
    occurred_on: todayISO(),
  });
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/** Put an account in one of the two Overview slots, or remove it from both. */
export async function setAccountOnOverview(id: string, visible: boolean): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };
  if (!(await ownsMoneyRow(supabase, "money_accounts", id, uid))) {
    return { error: "That account is not on your profile." };
  }

  if (!visible) {
    const { error } = await supabase
      .from("money_accounts")
      .update({ overview_rank: null })
      .eq("id", id)
      .eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error) };
    refresh();
    return { ok: true };
  }

  const { data: shown, error: readError } = await supabase
    .from("money_accounts")
    .select("id, overview_rank")
    .eq("user_id", uid)
    .not("overview_rank", "is", null);
  if (readError) return { error: saveErrorMessage(readError) };
  if ((shown ?? []).some((account) => account.id === id)) return { ok: true };

  const used = new Set((shown ?? []).map((account) => account.overview_rank));
  const slot = ([1, 2] as const).find((rank) => !used.has(rank));
  if (!slot) return { error: "Overview can show up to two accounts." };

  const { error } = await supabase
    .from("money_accounts")
    .update({ overview_rank: slot })
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
