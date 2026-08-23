"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { TASK_PRIORITIES, type TaskPriority } from "@/lib/status";

export type TaskFormState = { error?: string } | undefined;

/** Where a task lives decides which list it shows up in and where we go back to. */
function listPath(workspace: string) {
  return workspace === "personal" ? "/private/tasks" : "/tasks";
}

export async function saveTask(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim() || null;
  const priority = String(formData.get("priority") ?? "med");
  const dueAt = String(formData.get("due_at") ?? "").trim() || null;
  const workspace = String(formData.get("workspace") ?? "work") === "personal" ? "personal" : "work";

  if (!title) return { error: "Title is required." };
  if (!TASK_PRIORITIES.includes(priority as TaskPriority)) return { error: "Invalid priority." };

  const supabase = await createSupabaseServerClient();
  const payload = {
    project_id: workspace === "personal" ? null : projectId,
    title,
    priority,
    due_at: dueAt,
    workspace,
  };

  if (id) {
    const { error } = await supabase.from("tasks").update(payload).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("tasks").insert(payload);
    if (error) return { error: error.message };
  }

  revalidatePath(listPath(workspace));
  revalidatePath("/");
  redirect(listPath(workspace));
}

export async function deleteTask(id: string, workspace = "work") {
  const supabase = await createSupabaseServerClient();
  await supabase.from("tasks").delete().eq("id", id);
  revalidatePath(listPath(workspace));
  revalidatePath("/");
  redirect(listPath(workspace));
}

/** Toggle done/todo without navigating — the client refreshes after this resolves. */
export async function toggleTask(id: string, done: boolean) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("tasks")
    .update({ status: done ? "done" : "todo" })
    .eq("id", id);
  revalidatePath("/tasks");
  revalidatePath("/private/tasks");
  revalidatePath("/private");
  revalidatePath("/");
}
