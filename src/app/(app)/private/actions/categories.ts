"use server";

import {
DEFAULT_CATEGORIES
} from "@/lib/money";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
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
  if (!uid) return;

  const { error } = await supabase
    .from("money_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.error("deleteCategory:", error.message);
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
