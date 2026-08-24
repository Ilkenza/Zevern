import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { OutreachTemplate } from "@/lib/types";

export async function getTemplates(): Promise<OutreachTemplate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outreach_templates")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getTemplate(id: string): Promise<OutreachTemplate | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data } = await supabase
    .from("outreach_templates")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  return data ?? null;
}
