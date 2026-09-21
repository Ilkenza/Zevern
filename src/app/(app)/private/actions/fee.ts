/**
 * The charge a transfer cost, kept in step with the transfer.
 *
 * Deliberately not a `"use server"` module. Everything exported from one of those is a
 * server action a browser can call directly, with whatever arguments it likes — and these
 * take an already-authorised client and a user id on trust. They are helpers for
 * `saveTransaction`, which does the authorising, and living here is also what lets the
 * tests run them against a fake client.
 */

import { BANK_FEES } from "@/lib/money";
import { unreadable } from "@/lib/data/must";
import { saveErrorMessage } from "@/lib/supabase/errors";
import type { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Keep a transfer's fee row in step with the transfer.
 *
 * The fee is written as an ordinary expense on the account the money left, which is the
 * whole design: every screen that counts spending — the month, the budgets, the category
 * breakdown, the forecast — counts it already, without one of them being taught about a
 * new kind of outgoing it could then forget. A `fee` column on the transfer would have
 * needed teaching in four places, and four places is four chances to lose 250 dinars.
 *
 * Returns an error message, or null when the pair is as it should be.
 */
export async function syncTransferFee(
  supabase: Client,
  uid: string,
  move: {
    transferId: string;
    /** The charge this move should carry now. Zero means it should carry none. */
    wanted: number;
    accountId: string | null;
    currency: string;
    rate: number;
    occurredOn: string;
    occurredAt: string | null;
    title: string | null;
  },
): Promise<string | null> {
  const { data: existing, error: readError } = await supabase
    .from("money_transactions")
    .select("id")
    .eq("fee_for_id", move.transferId)
    .eq("user_id", uid)
    .maybeSingle();
  if (readError) return unreadable("this transfer's fee");

  const charge = Math.round(move.wanted * 100) / 100;

  /*
    No charge any more — including a kind changed away from `transfer`, which is why the
    caller passes zero rather than skipping the call. A fee left behind by an entry that
    is no longer a transfer is an expense nothing explains.
  */
  if (!(charge > 0) || !move.accountId) {
    if (!existing) return null;
    const { error } = await supabase
      .from("money_transactions")
      .delete()
      .eq("id", existing.id)
      .eq("user_id", uid);
    return error ? saveErrorMessage(error) : null;
  }

  const categoryId = await bankFeesCategory(supabase, uid);
  if (!categoryId) return "Could not file that fee. Try again.";

  const payload = {
    kind: "expense",
    /*
      Named after the move it belongs to, so the two read as one trip when the list is
      scrolled. The category says what it is; the title says which withdrawal it was.
    */
    title: (move.title ? `${move.title} — fee` : "Transfer fee").slice(0, 80),
    amount: charge,
    currency: move.currency,
    rate: move.rate,
    account_id: move.accountId,
    category_id: categoryId,
    occurred_on: move.occurredOn,
    occurred_at: move.occurredAt,
    fee_for_id: move.transferId,
  };

  const { error } = existing
    ? await supabase
        .from("money_transactions")
        .update(payload)
        .eq("id", existing.id)
        .eq("user_id", uid)
    : await supabase.from("money_transactions").insert(payload);

  return error ? saveErrorMessage(error) : null;
}

/**
 * The id of the category bank charges are filed under, making it if the list has none.
 *
 * Made rather than refused. A new account gets `Bank fees` in its seed, but an account
 * older than this feature does not, and neither does one whose owner tidied the list —
 * and in both cases the honest outcome is the charge filed correctly, not a transfer
 * that will not save because a category is missing. It is created once and then found.
 */
export async function bankFeesCategory(
  supabase: Client,
  uid: string,
): Promise<string | null> {
  const { data: found, error } = await supabase
    .from("money_categories")
    .select("id")
    .eq("user_id", uid)
    .eq("kind", "expense")
    .eq("archived", false)
    .eq("name", BANK_FEES)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  if (found) return found.id;

  /*
    Last in the list, because it is a category nobody files by hand — it arrives on its
    own, attached to a move, and putting it in the middle pushes down ones that are chosen.

    A failed read costs the position and nothing else: the category is still made, and it
    sorts alongside whatever else sits at zero. Refusing the whole save over where a row
    appears in a list would trade the money being right for the list being tidy.
  */
  const { data: last, error: sortError } = await supabase
    .from("money_categories")
    .select("sort")
    .eq("user_id", uid)
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sortError) console.error("bankFeesCategory sort:", sortError.message);

  const { data: made, error: makeError } = await supabase
    .from("money_categories")
    .insert({ user_id: uid, name: BANK_FEES, kind: "expense", color: "#8a7f9e", sort: (last?.sort ?? 0) + 1 })
    .select("id")
    .maybeSingle();
  if (makeError) return null;
  return made?.id ?? null;
}
