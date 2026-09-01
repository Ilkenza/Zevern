/**
 * The things you buy, remembered.
 *
 * A person's shopping list is a few hundred rows at the very most and every screen that
 * wants it wants all of it — the picker on the entry form searches it in the browser as
 * you type, and Setup lists it. So it is one read with no filter, cached per request like
 * the rest of the money layer.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { MoneyItem } from "@/lib/types";
import { ReadFailed } from "@/lib/data/must";

/**
 * Everything on the list, the useful ones first.
 *
 * Ordered by how often it has been filed rather than alphabetically, because the picker
 * shows the top of this list before anything is typed — and what somebody wants offered
 * without typing is the thing they buy every week, not the thing beginning with A. Last
 * used breaks the tie, so of two things bought twice the recent one leads.
 */
export const getItems = cache(async (): Promise<MoneyItem[]> => {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];

  const { data, error } = await supabase
    .from("money_items")
    .select("*")
    .eq("user_id", uid)
    .order("uses", { ascending: false })
    .order("last_used_on", { ascending: false, nullsFirst: false })
    .order("name");

  if (error) throw new ReadFailed("the things you have bought before", error.message);
  return (data ?? []) as MoneyItem[];
});
