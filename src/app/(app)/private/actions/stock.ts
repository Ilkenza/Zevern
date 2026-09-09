"use server";

import { getStock } from "@/lib/data/money";
import { unreadable } from "@/lib/data/must";
import { expiryFor, takeOf } from "@/lib/money/stock";
import { userId } from "@/lib/supabase/current-user";
import { deleteErrorMessage, saveErrorMessage } from "@/lib/supabase/errors";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { MoneyState, num, ownsMoneyRow, refresh, today } from "./shared";

/* ------------------------------------------------------------ what is in the house */

/**
 * The two ways a movement can come to nothing, in words.
 *
 * `takeOf` answers with a name rather than a sentence, so the arithmetic stays testable
 * without a test asserting on copy — the same arrangement `postRecurring` uses.
 */
const NOTHING_TO_TAKE = {
  empty: "There is none of that left.",
  none: "Say how many — one, or however many went.",
} as const;

/** How many of one thing a person can plausibly have at once. */
const MAX_QTY = 100000;

/**
 * Put something in the house by hand.
 *
 * Buying is the ordinary way a lot appears — `saveTransaction` makes one for every
 * tracked thing on an entry — but not the only way. Things arrive as presents, from
 * somebody else's shopping, or from a purchase filed before the thing was ever marked as
 * food. Without this the list is empty until the next shop, which is a feature that does
 * nothing on the day it is turned on.
 *
 * The rok is worked out here rather than typed: the item already says how long it keeps,
 * and asking twice for the same fact is how the two answers end up disagreeing.
 */
export async function addStock(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const itemId = String(formData.get("item_id") ?? "").trim();
  const qty = num(formData.get("qty"), 1);
  const boughtOn = String(formData.get("bought_on") ?? "").trim() || today();

  if (!itemId) return { error: "Pick what it is." };
  if (!(qty > 0)) return { error: "Say how many." };
  if (qty > MAX_QTY) return { error: "That is more than this can carry." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { data: item, error: itemError } = await supabase
    .from("money_items")
    .select("keeps_days")
    .eq("id", itemId)
    .eq("user_id", uid)
    .maybeSingle();
  if (itemError) return { error: unreadable("that thing") };
  if (!item) return { error: "That thing is not on your list." };

  const { error } = await supabase.from("money_stock").insert({
    item_id: itemId,
    qty,
    bought_on: boughtOn,
    expires_on: expiryFor(boughtOn, item.keeps_days),
  });
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/**
 * Some of it eaten, or some of it binned.
 *
 * Both take the same road because both are the same fact about the lot — it is not there
 * any more — and the difference between them is a fact about you. Which is exactly why
 * they are two words on one row rather than one button called `Gone'.
 *
 * The count is trimmed to what is left rather than refused. It is typed by somebody
 * looking at a bowl, not at the app; `three' when two are left means the two, and an
 * error message there would be the app arguing with a person about their own fridge.
 */
export async function logStockMove(
  stockId: string,
  kind: "eaten" | "binned",
  qty: number,
): Promise<MoneyState> {
  if (kind !== "eaten" && kind !== "binned") return { error: "Unknown kind." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  /*
    Read through the same function the screen reads through.

    What is left is derived from the movements, so asking the table directly would mean
    writing that arithmetic a second time — and a second copy of a sum is a second answer
    waiting to disagree with the first. `getStock` only returns lots with something left,
    so a lot missing from it is a lot there is none of.
  */
  const lot = (await getStock()).find((line) => line.id === stockId);
  if (!lot) return { error: NOTHING_TO_TAKE.empty };

  const plan = takeOf(qty, lot.left);
  if (plan.take == null) return { error: NOTHING_TO_TAKE[plan.refusal] };

  const { error } = await supabase.from("money_stock_moves").insert({
    stock_id: stockId,
    kind,
    qty: plan.take,
    on_date: today(),
  });
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/**
 * Take a movement back out.
 *
 * The undo for a wrong number, and the reason the movements are rows rather than a
 * counter being decremented: saying "I ate three" when it was two is corrected by
 * removing the three, not by typing a compensating minus one that has to be got right in
 * the other direction.
 */
export async function removeStockMove(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("money_stock_moves")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: deleteErrorMessage(error, "that movement") };

  refresh();
  return { ok: true };
}

/**
 * Forget a lot entirely.
 *
 * For the row that should never have been there — added twice, added by mistake — as
 * opposed to the one that was finished, which leaves the list on its own when the last
 * of it goes. The movements go with it, which is right: they were about this lot.
 */
export async function removeStock(id: string): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  if (!(await ownsMoneyRow(supabase, "money_stock", id, uid)))
    return { error: "That is not on your list." };

  const { error } = await supabase.from("money_stock").delete().eq("id", id).eq("user_id", uid);
  if (error) return { error: deleteErrorMessage(error, "that") };

  refresh();
  return { ok: true };
}
