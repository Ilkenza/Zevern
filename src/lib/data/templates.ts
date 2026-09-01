import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { OutreachTemplate } from "@/lib/types";
import { ReadFailed } from "./must";

export async function getTemplates(): Promise<OutreachTemplate[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase
    .from("outreach_templates")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw new ReadFailed("your outreach templates", error.message);
  return data ?? [];
}

export async function getTemplate(id: string): Promise<OutreachTemplate | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data, error } = await supabase
    .from("outreach_templates")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw new ReadFailed("this template", error.message);
  return data ?? null;
}
