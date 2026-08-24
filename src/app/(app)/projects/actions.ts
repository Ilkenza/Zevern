"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { ownsRow, userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/status";

export type ProjectFormState = { error?: string } | undefined;

export async function saveProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const clientId = String(formData.get("client_id") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "draft");
  const valueRaw = String(formData.get("value") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim() || null;
  const currencyRaw = String(formData.get("currency") ?? "EUR");
  const currency = ["EUR", "USD", "RSD"].includes(currencyRaw) ? currencyRaw : "EUR";

  if (!title) return { error: "Title is required." };
  if (!PROJECT_STATUSES.includes(status as ProjectStatus)) return { error: "Invalid status." };

  const value = valueRaw ? Number(valueRaw) : 0;
  if (Number.isNaN(value) || value < 0) return { error: "Value must be a positive number." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  if (!(await ownsRow(supabase, "clients", clientId, uid)))
    return { error: "That client is not on your account." };

  const payload = {
    client_id: clientId,
    title,
    description,
    status,
    value,
    currency,
    due_date: dueDate,
  };

  if (id) {
    const { error } = await supabase
      .from("projects")
      .update(payload)
      .eq("id", id)
      .eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error) };
  } else {
    const { error } = await supabase.from("projects").insert(payload);
    if (error) return { error: saveErrorMessage(error) };
  }

  revalidatePath("/projects");
  revalidatePath("/");
  redirect("/projects");
}

export async function deleteProject(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", uid);
  if (error) console.error("deleteProject:", error.message);
  revalidatePath("/projects");
  revalidatePath("/");
  redirect("/projects");
}
