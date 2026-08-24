import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { todayISO } from "@/lib/format";
import type { Lead } from "@/lib/types";

export async function getLeads(): Promise<Lead[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getLead(id: string): Promise<Lead | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  return data ?? null;
}

/** Active pipeline (not won/lost) — powers the sidebar "Leads" badge. */
export async function getActiveLeadCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .not("status", "in", "(won,lost)");
  return count ?? 0;
}

/** Open leads whose follow-up is due today or overdue (Overview "Follow-ups"). */
export async function getLeadsForFollowup(limit = 5): Promise<Lead[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("*")
    .not("status", "in", "(won,lost)")
    .lte("next_followup", todayISO())
    .order("next_followup", { ascending: true })
    .limit(limit);
  return data ?? [];
}
