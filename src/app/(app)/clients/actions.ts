"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage, deleteErrorMessage } from "@/lib/supabase/errors";

export type ClientFormState = { error?: string } | undefined;

export async function saveClient(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim() || null;
  const contactChannel = String(formData.get("contact_channel") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const businessType = String(formData.get("business_type") ?? "").trim() || null;
  const regionRaw = String(formData.get("region") ?? "").trim();
  const region = ["domestic", "foreign"].includes(regionRaw) ? regionRaw : null;
  const tierRaw = String(formData.get("tier") ?? "").trim();
  const tier = ["basic", "standard", "premium"].includes(tierRaw) ? tierRaw : null;

  if (!name) return { error: "Name is required." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const payload = {
    name,
    contact,
    contact_channel: contactChannel,
    notes,
    business_type: businessType,
    region,
    tier,
  };

  if (id) {
    const { error } = await supabase
      .from("clients")
      .update(payload)
      .eq("id", id)
      .eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error) };
  } else {
    const { error } = await supabase.from("clients").insert(payload);
    if (error) return { error: saveErrorMessage(error) };
  }

  revalidatePath("/clients");
  revalidatePath("/");
  redirect("/clients");
}

export async function deleteClient(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase.from("clients").delete().eq("id", id).eq("user_id", uid);
  if (error) return { error: deleteErrorMessage(error, "this client") };
  revalidatePath("/clients");
  revalidatePath("/projects");
  revalidatePath("/");
  redirect("/clients");
}
