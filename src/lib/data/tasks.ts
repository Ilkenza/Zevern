import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { todayISO } from "@/lib/format";
import type { TaskWithProject } from "@/lib/types";
import { ReadFailed } from "./must";

const WITH_PROJECT = "*, project:projects(title, client:clients(name))";

/** 'work' is the Freelance side, 'personal' is the Private side. */
export type Workspace = "work" | "personal";

export async function getTasks(workspace: Workspace = "work"): Promise<TaskWithProject[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase
    .from("tasks")
    .select(WITH_PROJECT)
    .eq("user_id", uid)
    .eq("workspace", workspace)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new ReadFailed("your tasks", error.message);
  return (data ?? []) as TaskWithProject[];
}

export async function getTask(id: string): Promise<TaskWithProject | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data, error } = await supabase
    .from("tasks")
    .select(WITH_PROJECT)
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw new ReadFailed("this task", error.message);
  return (data as TaskWithProject | null) ?? null;
}

/** Open tasks that are due today or overdue (for the Overview "Today" checklist). */
export async function getTasksForToday(workspace: Workspace = "work"): Promise<TaskWithProject[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase
    .from("tasks")
    .select(WITH_PROJECT)
    .eq("user_id", uid)
    .eq("workspace", workspace)
    .eq("status", "todo")
    .lte("due_at", `${todayISO()}T23:59:59`)
    .order("due_at", { ascending: true });
  if (error) throw new ReadFailed("today's tasks", error.message);
  return (data ?? []) as TaskWithProject[];
}

export async function getTodayOpenCount(workspace: Workspace = "work"): Promise<number> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return 0;
  const { count } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("workspace", workspace)
    .eq("status", "todo")
    .lte("due_at", `${todayISO()}T23:59:59`);
  return count ?? 0;
}

/**
 * Open tasks whose date has already gone by. Deliberately separate from
 * `getTodayOpenCount`, which bundles today in with the arrears — the Overview needs
 * to say "two are late" without counting the ones you still have all day to do.
 */
export async function getOverdueTaskCount(workspace: Workspace = "work"): Promise<number> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return 0;
  const { count } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("workspace", workspace)
    .eq("status", "todo")
    .lt("due_at", `${todayISO()}T00:00:00`);
  return count ?? 0;
}

/** All open tasks in a workspace — powers the sidebar badge. */
export async function getOpenTaskCount(workspace: Workspace = "work"): Promise<number> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return 0;
  const { count } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("workspace", workspace)
    .eq("status", "todo");
  return count ?? 0;
}
