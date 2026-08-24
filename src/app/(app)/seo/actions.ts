"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { ownsRow, userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { fetchAndAnalyze } from "@/lib/seo/analyze";

export type CheckFormState = { error?: string } | undefined;

export async function runCheck(
  _prev: CheckFormState,
  formData: FormData,
): Promise<CheckFormState> {
  const url = String(formData.get("url") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim() || null;
  if (!url) return { error: "Enter a URL." };

  // Authenticate BEFORE fetching anything. Every exported server action is a
  // callable endpoint regardless of which route it was imported from, so leaving
  // the fetch above this check handed an anonymous caller an outbound request
  // primitive pointed wherever they liked.
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const result = await fetchAndAnalyze(url);
  if (!result.ok) return { error: result.error };

  if (!(await ownsRow(supabase, "projects", projectId, uid)))
    return { error: "That project is not on your account." };

  const { data, error } = await supabase
    .from("seo_checks")
    .insert({
      url: result.url,
      title: result.data.title,
      score: result.data.score,
      results: result.data.results,
      project_id: projectId,
    })
    .select("id")
    .single();
  if (error) return { error: saveErrorMessage(error) };

  revalidatePath("/seo");
  revalidatePath("/");
  redirect(`/seo/${data.id}`);
}

export async function deleteCheck(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase.from("seo_checks").delete().eq("id", id).eq("user_id", uid);
  if (error) console.error("deleteCheck:", error.message);
  revalidatePath("/seo");
  revalidatePath("/");
  redirect("/seo");
}
