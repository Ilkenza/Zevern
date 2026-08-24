import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";

export type ActivityType = "client" | "project" | "task" | "invoice" | "lead";

export type ActivityItem = {
  type: ActivityType;
  id: string;
  label: string;
  created_at: string;
};


export async function getRecentActivity(limit = 6): Promise<ActivityItem[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];

  const [clients, projects, tasks, invoices, leads] = await Promise.all([
    supabase.from("clients").select("id, name, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(limit),
    supabase.from("projects").select("id, title, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(limit),
    supabase.from("tasks").select("id, title, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(limit),
    supabase.from("invoices").select("id, number, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(limit),
    supabase.from("leads").select("id, name, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(limit),
  ]);

  const items: ActivityItem[] = [];
  for (const c of clients.data ?? []) {
    items.push({ type: "client", id: c.id, label: c.name, created_at: c.created_at });
  }
  for (const p of projects.data ?? []) {
    items.push({ type: "project", id: p.id, label: p.title, created_at: p.created_at });
  }
  for (const t of tasks.data ?? []) {
    items.push({ type: "task", id: t.id, label: t.title, created_at: t.created_at });
  }
  for (const i of invoices.data ?? []) {
    items.push({ type: "invoice", id: i.id, label: i.number ?? "—", created_at: i.created_at });
  }
  for (const l of leads.data ?? []) {
    items.push({ type: "lead", id: l.id, label: l.name, created_at: l.created_at });
  }

  items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return items.slice(0, limit);
}
