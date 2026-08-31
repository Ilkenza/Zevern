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

  if (!name) return { error: "Give it a name — what you would type on the entry." };
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

export async function deleteItem(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase.from("money_items").delete().eq("id", id).eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}
