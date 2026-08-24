"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export type SettingsState = { ok?: boolean; error?: string } | undefined;

/** The database stores this, never the token itself. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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

export type TokenState = { token?: string; error?: string } | undefined;

/**
 * Create or rotate the token the browser extension uses. Only the hash is stored,
 * so this is the one and only moment the token can be shown — regenerating is the
 * only way back if it is lost, and that revokes the old one.
 */
export async function generateExtToken(): Promise<TokenState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const token = randomUUID();
  const { error } = await supabase
    .from("profiles")
    .update({ ext_token_hash: hashToken(token) })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { token };
}

/**
 * Deleting the account needs the owner to retype their email. The check lives in
 * the `delete_user` function, so a crafted request cannot skip it the way it could
 * skip the checkbox this used to rely on.
 */
export async function deleteAccount(confirm: string): Promise<SettingsState> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_user", { p_confirm: confirm });

  if (error) {
    return error.message.includes("confirmation does not match")
      ? { error: "That is not the email address on this account." }
      : { error: error.message };
  }

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
