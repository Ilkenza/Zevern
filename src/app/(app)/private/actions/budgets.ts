"use server";

import {
getRates
} from "@/lib/data/money";
import {
rateFor
} from "@/lib/money";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
currencyOf,
MAX_AMOUNT,
MoneyState,
num,
ownsMoneyRow,
refresh,
today
} from "./shared";

/* ----------------------------------------------------------------- budgets */

/** Save every category limit in one submit; a limit of 0 removes the budget. */
/* --------------------------------------------------------------- budget plans */

const BUDGET_PERIODS = ["custom", "day", "week", "month", "year"] as const;

/**
 * Create or update one named budget, and the two sets of ids that say what it watches.
 *
 * The links are rewritten wholesale rather than diffed. A budget has a handful of
 * categories, the form always posts the complete answer, and "delete what is there,
 * insert what was sent" cannot drift out of step with the form the way a diff can. The
 * ownership check on every id is the part that matters: those ids arrive from a browser,
 * and the row-level policy on the link tables only ever checks the budget end of the
 * pair — the database trigger refuses a foreign category too, but a clear sentence back
 * beats a constraint violation.
 */
export async function saveBudgetPlan(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const kind = String(formData.get("kind") ?? "expense");
  const membership = String(formData.get("membership") ?? "all");
  const period = String(formData.get("period") ?? "month");
  const periodCount = Math.min(60, Math.max(1, Math.floor(num(formData.get("period_count"), 1))));
  const startsOn = String(formData.get("starts_on") ?? "").trim() || today();
  const endsOnRaw = String(formData.get("ends_on") ?? "").trim();
  const categoryIds = formData.getAll("category_ids").map((v) => String(v)).filter(Boolean);
  const accountIds = formData.getAll("account_ids").map((v) => String(v)).filter(Boolean);

  if (!name) return { error: "Give the budget a name." };
  if (kind !== "expense" && kind !== "savings") return { error: "Unknown budget type." };
  if (membership !== "all" && membership !== "added") return { error: "Unknown budget type." };
  if (!(BUDGET_PERIODS as readonly string[]).includes(period)) return { error: "Unknown period." };

  // A custom budget is one window with two ends; a repeating one has no end at all, and
  // letting it carry a stale `ends_on` would give the period arithmetic two answers.
  const endsOn = period === "custom" ? endsOnRaw : null;
  if (period === "custom" && !endsOn) return { error: "A custom budget needs an end date." };
  if (endsOn && endsOn < startsOn) return { error: "The end date is before the start date." };

  const currency = currencyOf(formData.get("currency"));
  const rates = await getRates();
  const rate = currency === "RSD" ? 1 : rateFor(currency, rates);
  const amountRsd = Math.round(num(formData.get("amount")) * rate * 100) / 100;
  if (!(amountRsd >= 0)) return { error: "That is not an amount." };
  if (amountRsd >= MAX_AMOUNT) return { error: "That is not an amount." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  // Filters belong to an 'all' budget. On an 'added' one they would sit in the database
  // meaning nothing, and mean something again the day somebody flips the type.
  const cats = membership === "all" ? categoryIds : [];
  const accs = membership === "all" ? accountIds : [];

  const owned = await Promise.all([
    ...cats.map((c) => ownsMoneyRow(supabase, "money_categories", c, uid)),
    ...accs.map((a) => ownsMoneyRow(supabase, "money_accounts", a, uid)),
  ]);
  if (owned.some((ok) => !ok)) return { error: "That category or account is not on your profile." };

  const payload = {
    name,
    kind,
    membership,
    amount_rsd: amountRsd,
    period,
    period_count: periodCount,
    starts_on: startsOn,
    ends_on: endsOn,
    // Budgets are gold, like goals. The column stays so the migration that carried the
    // old category limits over did not have to throw their colours away, but nothing
    // sets it and nothing reads it.
    color: null,
  };

  let budgetId = id;
  /*
    What it allowed before this save, read before the update overwrites it.

    The comparison is the whole reason: a new row in the history for every save, whether
    or not the number moved, would turn "raised on 28 August" into a wall of identical
    entries and lose the one date that mattered.
  */
  let wasRsd: number | null = null;
  if (id) {
    const { data: before } = await supabase
      .from("money_budget_plans")
      .select("amount_rsd")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    wasRsd = before ? Number(before.amount_rsd) || 0 : null;

    const { error } = await supabase
      .from("money_budget_plans")
      .update(payload)
      .eq("id", id)
      .eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error) };
  } else {
    const { data, error } = await supabase
      .from("money_budget_plans")
      .insert(payload)
      .select("id")
      .single();
    if (error) return { error: saveErrorMessage(error) };
    budgetId = data.id;
  }

  /*
    Record what it allows from now on, so finished windows keep the amount they ran under.

    Dated today rather than at the start of the period: raising a limit on the 28th means
    "this month is allowed more", and `amountAt` measures against the window's last day, so
    August picks it up and July does not. A new budget is dated from its own start instead
    — there is no past to protect and dating it today would leave its first days measured
    by a fallback.

    Best effort. A budget that saved but whose history row did not is a budget that reads
    exactly as it did before this table existed, which is a far better failure than
    refusing the save somebody actually asked for.
  */
  if (!id || (wasRsd !== null && wasRsd !== amountRsd)) {
    const { error } = await supabase.from("money_budget_amounts").upsert(
      {
        user_id: uid,
        budget_id: budgetId,
        starts_on: id ? today() : startsOn,
        amount_rsd: amountRsd,
      },
      { onConflict: "budget_id,starts_on" },
    );
    if (error) console.error("saveBudgetPlan amount history:", error.message);
  }

  await supabase.from("money_budget_categories").delete().eq("budget_id", budgetId);
  await supabase.from("money_budget_accounts").delete().eq("budget_id", budgetId);

  if (cats.length) {
    const { error } = await supabase
      .from("money_budget_categories")
      .insert(cats.map((c) => ({ budget_id: budgetId, category_id: c })));
    if (error) return { error: saveErrorMessage(error) };
  }
  if (accs.length) {
    const { error } = await supabase
      .from("money_budget_accounts")
      .insert(accs.map((a) => ({ budget_id: budgetId, account_id: a })));
    if (error) return { error: saveErrorMessage(error) };
  }

  /*
    The extra room this budget grants the monthly limits, for every month it falls in.

    Cleared and rewritten rather than patched, like the filters above: the form submits
    the whole list every time, so a row that is gone from the form is a row the person
    removed. Cleared unconditionally, including when this is no longer a budget with
    fixed dates — flip a holiday to 'every month' and its grants have to go with it, or
    they sit in the database raising limits for a trip that no longer exists.
  */
  await supabase
    .from("money_budget_boosts")
    .delete()
    .eq("source_budget_id", budgetId)
    .eq("user_id", uid);

  if (period === "custom" && endsOn) {
    const targets = formData.getAll("boost_target").map((v) => String(v));
    const amounts = formData.getAll("boost_amount").map((v) => num(v));

    // Last one wins, so a form that somehow submits a target twice writes one row rather
    // than tripping the unique index and losing the whole save.
    const wanted = new Map<string, number>();
    targets.forEach((target, i) => {
      const amount = Math.round((amounts[i] ?? 0) * rate * 100) / 100;
      if (!target || target === budgetId) return;
      if (!(amount > 0) || amount >= MAX_AMOUNT) return;
      wanted.set(target, amount);
    });

    if (wanted.size) {
      /*
        The database refuses a target that is not yours — the trigger on the table checks
        both budgets against `auth.uid()`. This is the second lock, not the only one: it
        turns a forged id into a sentence rather than a raw constraint error, and it fails
        the whole save instead of writing the rows that happened to be legitimate.
      */
      const ownsAll = await Promise.all(
        [...wanted.keys()].map((t) => ownsMoneyRow(supabase, "money_budget_plans", t, uid)),
      );
      if (ownsAll.some((ok) => !ok)) return { error: "That budget is not on your profile." };

      const { error } = await supabase.from("money_budget_boosts").insert(
        [...wanted].map(([target, amount]) => ({
          user_id: uid,
          source_budget_id: budgetId,
          target_budget_id: target,
          amount_rsd: amount,
        })),
      );
      if (error) return { error: saveErrorMessage(error) };
    }
  }

  /*
    The same relationship written from the other end.

    A raise has two sides and you notice you need one while looking at the limit, not at
    the trip: Eating out is red, 14.437 over, and the holiday causing it is on another
    card. Editing a repeating budget therefore submits the raises pointed *at* it, and
    they are cleared and rewritten exactly like the ones pointed away.

    The two blocks cannot collide: a budget is either 'custom' or it is not, and only one
    of them runs for any save.
  */
  if (period !== "custom") {
    await supabase
      .from("money_budget_boosts")
      .delete()
      .eq("target_budget_id", budgetId)
      .eq("user_id", uid);

    const sources = formData.getAll("raise_source").map((v) => String(v));
    const raiseAmounts = formData.getAll("raise_amount").map((v) => num(v));

    const incoming = new Map<string, number>();
    sources.forEach((source, i) => {
      const amount = Math.round((raiseAmounts[i] ?? 0) * rate * 100) / 100;
      if (!source || source === budgetId) return;
      if (!(amount > 0) || amount >= MAX_AMOUNT) return;
      incoming.set(source, amount);
    });

    if (incoming.size) {
      const ownsAll = await Promise.all(
        [...incoming.keys()].map((sourceId) =>
          ownsMoneyRow(supabase, "money_budget_plans", sourceId, uid),
        ),
      );
      if (ownsAll.some((ok) => !ok)) return { error: "That budget is not on your profile." };

      const { error } = await supabase.from("money_budget_boosts").insert(
        [...incoming].map(([source, amount]) => ({
          user_id: uid,
          source_budget_id: source,
          target_budget_id: budgetId,
          amount_rsd: amount,
        })),
      );
      if (error) return { error: saveErrorMessage(error) };
    }
  }

  refresh();
  return { ok: true };
}

/**
 * Delete a budget.
 *
 * The links go with it — they describe the budget and nothing else. The entries do not:
 * `budget_id` on a transaction is `on delete set null`, so deleting a holiday budget
 * forgets the holiday and keeps every flight you paid for.
 */
export async function deleteBudgetPlan(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("money_budget_plans")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

export async function saveBudgets(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  // The boxes are typed in whatever currency the screen is read in; the column they
  // land in is dinars, and every other figure on that screen is measured against it.
  const currency = currencyOf(formData.get("currency"));
  const rates = await getRates();
  const rate = currency === "RSD" ? 1 : rateFor(currency, rates);

  const upserts: { user_id: string; category_id: string; amount_rsd: number }[] = [];
  const clears: string[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("limit_")) continue;
    const categoryId = key.slice("limit_".length);
    const amount = Math.round(num(value) * rate * 100) / 100;
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
