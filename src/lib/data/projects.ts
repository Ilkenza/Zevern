import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { Project, ProjectWithClient } from "@/lib/types";

const WITH_CLIENT = "*, client:clients(name)";

export async function getProjects(): Promise<ProjectWithClient[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data } = await supabase
    .from("projects")
    .select(WITH_CLIENT)
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  return (data ?? []) as ProjectWithClient[];
}

export async function getRecentProjects(limit = 5): Promise<ProjectWithClient[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data } = await supabase
    .from("projects")
    .select(WITH_CLIENT)
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ProjectWithClient[];
}

export async function getProject(id: string): Promise<ProjectWithClient | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data } = await supabase
    .from("projects")
    .select(WITH_CLIENT)
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  return (data as ProjectWithClient | null) ?? null;
}

export async function getProjectsByClient(clientId: string): Promise<Project[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", uid)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getProjectCount(): Promise<number> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return 0;
  const { count } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid);
  return count ?? 0;
}

export async function getActiveProjectCount(): Promise<number> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return 0;
  const { count } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("status", "in_progress");
  return count ?? 0;
}
