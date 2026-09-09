"use server";

import {
DEFAULT_CATEGORIES
} from "@/lib/money";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage, deleteErrorMessage } from "@/lib/supabase/errors";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
hexColor,
MoneyState,
refresh
} from "./shared";

/* -------------------------------------------------------------- categories */

export async function saveCategory(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense") === "income" ? "income" : "expense";
  const color = hexColor(formData.get("color"));

  if (!name) return { error: "Name is required." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  /*
    One live name per kind, checked here rather than with an index.

    Two categories both called Groceries split a year of spending down the middle and
    nothing on any screen says which is which: the tile, the picker on the entry form and
    the budget all print the same word twice. An index would be the stronger guard and is
    the wrong one here — the restore adds rows by id, in slices of five hundred, so a
    backup holding a name this profile has since typed again would fail the whole slice
    rather than the one row, and take every entry that pointed at those categories with
    it.

    Archived ones are not in the way: they are off every screen, so the name is free
    again. `%` and `_` are escaped because this is a LIKE, and a category called `100%
    fun` should be compared, not treated as a pattern.
  */
  const like = name.replace(/[\\%_]/g, (m) => `\\${m}`);
  const { data: clash, error: clashError } = await supabase
    .from("money_categories")
    .select("id")
    .eq("user_id", uid)
    .eq("kind", kind)
    .eq("archived", false)
    .ilike("name", like)
    .limit(1);
  if (clashError) return { error: "Could not read your categories. Try again." };
  if (clash?.[0] && clash[0].id !== id)
    return { error: `You already have ${kind === "income" ? "an income" : "an expense"} category called that.` };

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
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("money_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: deleteErrorMessage(error, "this category") };
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
