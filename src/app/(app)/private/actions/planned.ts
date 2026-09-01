"use server";

import {
getRates
} from "@/lib/data/money";
import {
anchorDayFor,
rateFor
} from "@/lib/money";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
currencyOf,
MoneyState,
num,
ownsMoneyRow,
plainDate,
refresh,
today
} from "./shared";
import { unreadable } from "@/lib/data/must";

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
    const { data: existing, error: existingError } = await supabase
      .from("money_planned")
      .select("settled_at")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (existingError) return { error: unreadable("that planned item") };
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

  const { data: plan, error: planError } = await supabase
    .from("money_planned")
    .select("settled_at")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (planError) return { error: unreadable("that planned item") };
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

  const { data: plan, error: planError } = await supabase
    .from("money_planned")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (planError) return { error: unreadable("that planned item") };
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

  const { data: plan, error: planError } = await supabase
    .from("money_planned")
    .select("settled_at")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (planError) return { error: unreadable("that planned item") };
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

  const { data: item, error: itemError } = await supabase
    .from("money_recurring")
    .select("ends_on, every")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (itemError) return { error: unreadable("that repeating item") };
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
