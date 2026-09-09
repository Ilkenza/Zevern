"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { CURRENCIES, type Currency } from "@/lib/money";
import { MoneyState, num, ownsMoneyRow, refresh } from "./shared";

/* ------------------------------------------------------- things you buy */

/**
 * Add or correct one thing on the list.
 *
 * `price` is optional and stays optional. Half the things anybody buys have no fixed
 * price — a coffee, a taxi — and a field that insists on one turns "remember this name"
 * into "guess a number", which is how a list stops being filled in.
 */
export async function saveItem(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const raw = String(formData.get("price") ?? "").trim();
  const price = raw === "" ? null : num(formData.get("price"));
  const currency = String(formData.get("currency") ?? "RSD");
  const categoryId = String(formData.get("category_id") ?? "").trim() || null;
  /*
    Food, drink, or neither — and this is also the switch that follows a thing into the
    house. Only food and drink get a row in `money_stock` when they are bought; everything
    else stays what it has always been, a word on a shopping list.
  */
  const kindRaw = String(formData.get("kind") ?? "other").trim();
  const kind = ["food", "drink", "other"].includes(kindRaw) ? kindRaw : "other";
  /*
    How long it keeps, and empty is a real answer.

    A tin of fish keeps two years and asking about it is noise; bananas keep five days and
    that is the whole point. Left empty the thing simply has no date, and the list says
    so rather than pretending somebody checked.
  */
  const keepsRaw = String(formData.get("keeps_days") ?? "").trim();
  const keepsDays = keepsRaw === "" ? null : Math.trunc(num(keepsRaw));

  if (!name) return { error: "Give it a name — what you would type on the entry." };
  if (keepsDays !== null && !(keepsDays > 0 && keepsDays <= 3650))
    return { error: "How long it keeps has to be a number of days, or nothing at all." };
  if (price !== null && !(price >= 0)) return { error: "A price cannot be less than nothing." };
  if (!(CURRENCIES as readonly string[]).includes(currency)) return { error: "Unknown currency." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  if (!(await ownsMoneyRow(supabase, "money_categories", categoryId, uid)))
    return { error: "That category is not on your profile." };

  const payload = {
    name,
    price,
    currency: currency as Currency,
    category_id: categoryId,
    kind,
    // Only a thing that goes off carries a rok. Keeping one on something marked `other`
    // would leave a date nothing reads, waiting to surprise whoever marks it as food.
    keeps_days: kind === "other" ? null : keepsDays,
  };

  if (id) {
    const { error } = await supabase
      .from("money_items")
      .update(payload)
      .eq("id", id)
      .eq("user_id", uid);
    if (error) return { error: nameTaken(error) };
  } else {
    const { error } = await supabase.from("money_items").insert(payload);
    if (error) return { error: nameTaken(error) };
  }

  refresh();
  return { ok: true };
}

/**
 * The unique index does the work; this only translates what it says.
 *
 * `duplicate key value violates unique constraint "money_items_user_name_idx"` is a true
 * sentence and an unusable one. The index exists precisely so two spellings of one thing
 * cannot both be on the list, and that is what the message should say.
 */
function nameTaken(error: PostgrestError): string {
  if (error.code === "23505") return "That one is already on the list.";
  return saveErrorMessage(error);
}

/**
 * One field of one thing, set from a dropdown.
 *
 * Its own action, taking arguments rather than a `FormData`, because a dropdown that
 * saves the moment it is answered has no business going through the row's form — and
 * going through it is what broke: React resets a form once its action succeeds, and a
 * reset puts a `<select>` back to the option carrying the `selected` attribute. A React
 * rendered `<option>` carries none, so the reset lands on the *first* one — `Not food or
 * drink` — while the database, and the row's own state, say `Food`. No re-render follows,
 * because nothing in React changed, so the box stays wrong until the page is reloaded.
 *
 * Measured, not guessed: the box read `food` at 300ms and `other` at 1,200 — the moment
 * the action came back — with the server payload for that same row already saying `food`.
 *
 * Four fields, each named and each checked. Not a patch object: a server action is an
 * endpoint like any other, and "write whatever this says into whichever column it names"
 * is not a thing to leave lying about.
 */
export async function setItemField(
  id: string,
  field: "name" | "price" | "kind" | "keeps_days" | "currency" | "category_id",
  value: string,
): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const patch: Record<string, string | number | null> = {};
  if (field === "name") {
    const name = value.trim().slice(0, 80);
    if (!name) return { error: "Give it a name — what you would type on the entry." };
    patch.name = name;
  } else if (field === "price") {
    const raw = value.trim();
    const price = raw === "" ? null : num(raw);
    if (price !== null && !(price >= 0)) return { error: "A price cannot be less than nothing." };
    patch.price = price;
  } else if (field === "kind") {
    if (!["food", "drink", "other"].includes(value)) return { error: "Unknown kind." };
    patch.kind = value;
    // A rok on something that does not go off is a date nothing reads, waiting to
    // surprise whoever marks it as food later.
    if (value === "other") patch.keeps_days = null;
  } else if (field === "keeps_days") {
    const raw = value.trim();
    const days = raw === "" ? null : Math.trunc(num(raw));
    if (days !== null && !(days > 0 && days <= 3650))
      return { error: "How long it keeps has to be a number of days, or nothing at all." };
    patch.keeps_days = days;
  } else if (field === "currency") {
    if (!(CURRENCIES as readonly string[]).includes(value)) return { error: "Unknown currency." };
    patch.currency = value;
  } else {
    const categoryId = value.trim() || null;
    if (!(await ownsMoneyRow(supabase, "money_categories", categoryId, uid)))
      return { error: "That category is not on your profile." };
    patch.category_id = categoryId;
  }

  const { error } = await supabase
    .from("money_items")
    .update(patch)
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: nameTaken(error) };

  refresh();
  return { ok: true };
}

export async function deleteItem(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase.from("money_items").delete().eq("id", id).eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}
