import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { Tool } from "@/lib/types";

export async function getTools(): Promise<Tool[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tools")
    .select("*")
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  return data ?? [];
}

export async function getTool(id: string): Promise<Tool | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data } = await supabase
    .from("tools")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  return data ?? null;
}

export async function getToolCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("tools").select("*", { count: "exact", head: true });
  return count ?? 0;
}

/** Distinct categories in canonical casing (for the form datalist + normalization). */
export async function getCategories(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("tools").select("category");
  const set = new Map<string, string>();
  for (const row of data ?? []) {
    const c = row.category?.trim();
    if (c) set.set(c.toLowerCase(), c);
  }
  return [...set.values()].sort((a, b) => a.localeCompare(b));
}
