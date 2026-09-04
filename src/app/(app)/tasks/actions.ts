"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { ownsRow, userId } from "@/lib/supabase/current-user";
import { saveErrorMessage, deleteErrorMessage } from "@/lib/supabase/errors";
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

/**
 * Add a task from the board, without leaving it.
 *
 * Deliberately not `saveTask`: that one redirects, and a redirect is the opposite of
 * what a quick add is for. You are standing in a list, thinking of the next thing —
 * the page should stay where it is and the row should appear. Priority defaults to
 * medium and the date comes from the column you typed into, so there is one field to
 * fill and nothing to decide.
 */
export async function quickAddTask(
  formData: FormData,
): Promise<{ error?: string } | void> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the task a name." };

  const workspace =
    String(formData.get("workspace") ?? "work") === "personal" ? "personal" : "work";
  const dueAt = String(formData.get("due_at") ?? "").trim() || null;

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase.from("tasks").insert({
    project_id: null,
    title,
    priority: "med",
    due_at: dueAt,
    workspace,
  });
  if (error) return { error: saveErrorMessage(error) };

  revalidatePath(listPath(workspace));
  revalidatePath("/");
}

export async function deleteTask(id: string, workspace = "work") {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", uid);
  if (error) return { error: deleteErrorMessage(error, "this task") };
  revalidatePath(listPath(workspace));
  revalidatePath("/");
  redirect(listPath(workspace));
}

/**
 * Toggle done/todo without navigating — the client refreshes after this resolves.
 *
 * A refusal used to go to the server log while the checkbox stayed where you put it and
 * the page revalidated around it, so a tick that never saved was indistinguishable from
 * one that did until the next reload put it back.
 */
export async function toggleTask(id: string, done: boolean) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("tasks")
    .update({ status: done ? "done" : "todo" })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };
  revalidatePath("/tasks");
  revalidatePath("/private/tasks");
  revalidatePath("/private");
  revalidatePath("/");
}

/** Move a task from the review queue without opening the full edit form. */
export async function rescheduleTask(
  id: string,
  dueOn: string | null,
  workspace = "work",
): Promise<{ error?: string } | void> {
  if (dueOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn))
    return { error: "That is not a date this app can read." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("tasks")
    .update({ due_at: dueOn ? `${dueOn}T00:00` : null })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: saveErrorMessage(error) };

  revalidatePath(listPath(workspace));
  revalidatePath("/private");
  revalidatePath("/");
}
