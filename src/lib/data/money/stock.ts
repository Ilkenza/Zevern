/**
 * What is in the house.
 *
 * One row per purchase of a thing that goes off — ten bananas bought on Tuesday — with
 * what has since been eaten or binned hanging off it. How many are left is worked out
 * from those movements every time it is read rather than kept as a counter on the row,
 * which is the same arrangement the debts use and for the same reason: a stored figure is
 * one more thing that can drift from the events it claims to describe, and the events are
 * what a person edits when they get one wrong.
 *
 * There is no money in any of this. It was offered and turned down, and the reasoning is
 * in the migration and in `@/lib/money/stock` — the short version being that most item
 * lines carry no price, so a figure in dinars would be an estimate wearing a fact's
 * clothes.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { byUrgency, leftOf } from "@/lib/money/stock";
import { todayISO } from "@/lib/format";
import type { StockLine } from "@/lib/types";
import { ReadFailed } from "@/lib/data/must";

export const getStock = cache(async (): Promise<StockLine[]> => {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];

  const [lotRes, moveRes] = await Promise.all([
    supabase
      .from("money_stock")
      .select("id, item_id, transaction_id, qty, bought_on, expires_on, money_items(name, kind)")
      .eq("user_id", uid)
      .order("bought_on", { ascending: true }),
    /*
      Every movement, not only the ones on open lots.

      Filtering to open lots here would need the answer this function is computing, and
      the volume does not justify the round trip: a movement is one row per time somebody
      says they ate something, and a lot that is finished stops producing them.
    */
    supabase
      .from("money_stock_moves")
      .select("id, stock_id, kind, qty, on_date")
      .eq("user_id", uid)
      .order("on_date", { ascending: false }),
  ]);
  if (lotRes.error) throw new ReadFailed("what is in the house", lotRes.error.message);
  if (moveRes.error) throw new ReadFailed("what has been eaten", moveRes.error.message);

  const moves = new Map<string, StockLine["moves"]>();
  for (const row of moveRes.data ?? []) {
    const seen = moves.get(row.stock_id) ?? [];
    seen.push({
      id: row.id,
      kind: row.kind,
      qty: Number(row.qty) || 0,
      on: row.on_date,
    });
    moves.set(row.stock_id, seen);
  }

  const lines: StockLine[] = [];
  for (const row of lotRes.data ?? []) {
    const item = Array.isArray(row.money_items) ? row.money_items[0] : row.money_items;
    const mine = moves.get(row.id) ?? [];
    const bought = Number(row.qty) || 0;
    const left = leftOf(bought, mine);
    // A finished lot stops being "in the house". It is not deleted — the movements that
    // finished it are the record of what happened to it, and deleting the lot would take
    // them with it.
    if (left <= 0) continue;
    lines.push({
      id: row.id,
      itemId: row.item_id,
      transactionId: row.transaction_id,
      name: item?.name ?? "Something",
      kind: item?.kind ?? "other",
      bought,
      left,
      boughtOn: row.bought_on,
      expiresOn: row.expires_on,
      moves: mine,
    });
  }

  return byUrgency(lines, todayISO());
});
