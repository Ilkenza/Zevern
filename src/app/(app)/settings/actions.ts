"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export type SettingsState = { ok?: boolean; error?: string } | undefined;

export async function saveProfile(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  const handle = String(formData.get("handle") ?? "").trim() || null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, handle })
    .eq("id", user.id);
  if (error) return { error: error.message };

  // Keep auth user_metadata in sync — the shell (greeting, sidebar) reads it.
  await supabase.auth.updateUser({ data: { full_name: fullName } });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveBusiness(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const business_name = String(formData.get("business_name") ?? "").trim() || null;
  const business_email = String(formData.get("business_email") ?? "").trim() || null;
  const business_address = String(formData.get("business_address") ?? "").trim() || null;
  const vat_id = String(formData.get("vat_id") ?? "").trim() || null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ business_name, business_email, business_address, vat_id })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/");
  return { ok: true };
}

export async function changePassword(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  if (password !== confirm) return { error: "Passwords don't match." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  return { ok: true };
}

/** Save which app modules are visible (unchecked → hidden from the sidebar). */
export async function saveModules(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { MODULE_OPTIONS } = await import("@/lib/nav");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Any module whose checkbox is not present in the form is hidden.
  const hidden = MODULE_OPTIONS.filter((m) => formData.get(`mod_${m.key}`) == null).map((m) => m.key);

  const { error } = await supabase
    .from("profiles")
    .update({ hidden_modules: hidden })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Create/rotate the token the browser extension uses to add leads. */
export async function generateExtToken(): Promise<SettingsState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const token = crypto.randomUUID();
  const { error } = await supabase.from("profiles").update({ ext_token: token }).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteAccount() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_user");
  if (!error) {
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/login");
}
