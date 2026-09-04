"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage, deleteErrorMessage } from "@/lib/supabase/errors";

export type TemplateFormState = { error?: string } | undefined;

export async function saveTemplate(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!title) return { error: "Title is required." };
  if (!body) return { error: "Message body is required." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  if (id) {
    const { error } = await supabase
      .from("outreach_templates")
      .update({ title, body })
      .eq("id", id)
      .eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error) };
  } else {
    const { error } = await supabase.from("outreach_templates").insert({ title, body });
    if (error) return { error: saveErrorMessage(error) };
  }

  revalidatePath("/leads/templates");
  redirect("/leads/templates");
}

export async function deleteTemplate(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("outreach_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) return { error: deleteErrorMessage(error, "this template") };
  revalidatePath("/leads/templates");
  redirect("/leads/templates");
}
