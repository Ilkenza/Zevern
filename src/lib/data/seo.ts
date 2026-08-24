import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { SeoCheckWithProject } from "@/lib/types";

const WITH_PROJECT = "*, project:projects(title)";

export async function getChecks(): Promise<SeoCheckWithProject[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data } = await supabase
    .from("seo_checks")
    .select(WITH_PROJECT)
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as SeoCheckWithProject[];
}

export async function getCheck(id: string): Promise<SeoCheckWithProject | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data } = await supabase
    .from("seo_checks")
    .select(WITH_PROJECT)
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  return (data as unknown as SeoCheckWithProject | null) ?? null;
}

export async function getCheckCount(): Promise<number> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return 0;
  const { count } = await supabase
    .from("seo_checks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid);
  return count ?? 0;
}
