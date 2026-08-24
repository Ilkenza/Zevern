"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { getCategories } from "@/lib/data/tools";

export type ToolFormState = { error?: string } | undefined;

/** Match an existing category case-insensitively (so "email" == "Email"), else Title-case it. */
function normalizeCategory(input: string, existing: string[]): string | null {
  const c = input.trim();
  if (!c) return null;
  const match = existing.find((e) => e.toLowerCase() === c.toLowerCase());
  if (match) return match;
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export async function saveTool(_prev: ToolFormState, formData: FormData): Promise<ToolFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  let url = String(formData.get("url") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) return { error: "Name is required." };
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;

  const existing = await getCategories();
  const category = normalizeCategory(String(formData.get("category") ?? ""), existing);

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const payload = { name, url, category, notes };

  if (id) {
    const { error } = await supabase.from("tools").update(payload).eq("id", id).eq("user_id", uid);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("tools").insert(payload);
    if (error) return { error: error.message };
  }

  revalidatePath("/toolbox");
  redirect("/toolbox");
}

export async function deleteTool(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase.from("tools").delete().eq("id", id).eq("user_id", uid);
  if (error) console.error("deleteTool:", error.message);
  revalidatePath("/toolbox");
  redirect("/toolbox");
}

export type CategoryState = { error?: string } | undefined;

/** Rename a category across all tools that use it. */
export async function renameCategory(
  _prev: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  const oldName = String(formData.get("old") ?? "").trim();
  const nextRaw = String(formData.get("name") ?? "").trim();
  if (!oldName || !nextRaw) return { error: "Category name is required." };
  const next = nextRaw.charAt(0).toUpperCase() + nextRaw.slice(1);

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("tools")
    .update({ category: next })
    .eq("category", oldName)
    .eq("user_id", uid);
  if (error) return { error: error.message };

  revalidatePath("/toolbox");
  redirect("/toolbox");
}

/** Remove a category — its tools fall back to "uncategorised" (null). */
export async function deleteCategory(name: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase
    .from("tools")
    .update({ category: null })
    .eq("category", name)
    .eq("user_id", uid);
  if (error) console.error("deleteCategory:", error.message);
  revalidatePath("/toolbox");
  redirect("/toolbox");
}

const STARTER = [
  { name: "Vercel", url: "https://vercel.com", category: "Hosting" },
  { name: "Supabase", url: "https://supabase.com", category: "Database" },
  { name: "Cloudflare", url: "https://cloudflare.com", category: "Hosting" },
  { name: "Brevo", url: "https://brevo.com", category: "Email" },
  { name: "Stripe", url: "https://stripe.com", category: "Payments" },
  { name: "Cal.com", url: "https://cal.com", category: "Booking" },
  { name: "remove.bg", url: "https://remove.bg", category: "Media" },
  { name: "TinyPNG", url: "https://tinypng.com", category: "Media" },
  { name: "Figma", url: "https://figma.com", category: "Design" },
  { name: "TempMail", url: "https://temp-mail.org", category: "Utility" },
  { name: "Google Analytics", url: "https://analytics.google.com", category: "Analytics" },
];

export async function addStarterTools() {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("tools")
    .insert(STARTER.map((t) => ({ name: t.name, url: t.url, category: t.category })));
  revalidatePath("/toolbox");
  redirect("/toolbox");
}
