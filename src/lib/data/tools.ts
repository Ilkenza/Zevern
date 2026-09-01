import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { Tool } from "@/lib/types";
import { ReadFailed } from "./must";

export async function getTools(): Promise<Tool[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase
    .from("tools")
    .select("*")
    .eq("user_id", uid)
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw new ReadFailed("your toolbox", error.message);
  return data ?? [];
}

export async function getTool(id: string): Promise<Tool | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data, error } = await supabase
    .from("tools")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw new ReadFailed("this tool", error.message);
  return data ?? null;
}

export async function getToolCount(): Promise<number> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return 0;
  const { count } = await supabase
    .from("tools")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid);
  return count ?? 0;
}

/** Distinct categories in canonical casing (for the form datalist + normalization). */
export async function getCategories(): Promise<string[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase.from("tools").select("category").eq("user_id", uid);
  if (error) throw new ReadFailed("your categories", error.message);
  const set = new Map<string, string>();
  for (const row of data ?? []) {
    const c = row.category?.trim();
    if (c) set.set(c.toLowerCase(), c);
  }
  return [...set.values()].sort((a, b) => a.localeCompare(b));
}
