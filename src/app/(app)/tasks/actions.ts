"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { ownsRow, userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
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
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  // A personal task never belongs to a project, so whatever the form sent is dropped.
  const linkedProjectId = workspace === "personal" ? null : projectId;
  if (!(await ownsRow(supabase, "projects", linkedProjectId, uid)))
    return { error: "That project is not on your account." };

  const payload = {
    project_id: linkedProjectId,
    title,
    priority,
    due_at: dueAt,
    workspace,
  };

  if (id) {
    const { error } = await supabase.from("tasks").update(payload).eq("id", id).eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error) };
  } else {
    const { error } = await supabase.from("tasks").insert(payload);
    if (error) return { error: saveErrorMessage(error) };
  }

  revalidatePath(listPath(workspace));
  revalidatePath("/");
  redirect(listPath(workspace));
}

export async function deleteTask(id: string, workspace = "work") {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", uid);
  if (error) console.error("deleteTask:", error.message);
  revalidatePath(listPath(workspace));
  revalidatePath("/");
  redirect(listPath(workspace));
}

/** Toggle done/todo without navigating — the client refreshes after this resolves. */
export async function toggleTask(id: string, done: boolean) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase
    .from("tasks")
    .update({ status: done ? "done" : "todo" })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.error("toggleTask:", error.message);
  revalidatePath("/tasks");
  revalidatePath("/private/tasks");
  revalidatePath("/private");
  revalidatePath("/");
}
