"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/status";
import { parseLeadsImport } from "@/lib/leads/parse-import";
import { computeImportPlan, type ImportChange } from "@/lib/leads/diff-import";

export type LeadFormState = { error?: string } | undefined;

export type ImportPreview =
  | { error: string }
  | {
      newCount: number;
      unchanged: number;
      skipped: number;
      updates: { id: string; name: string; changes: ImportChange[] }[];
    };

/** Dry run: parse the paste, compare to existing leads, return counts + a diff. */
export async function previewLeadsImport(text: string): Promise<ImportPreview> {
  const { rows, skipped, error } = parseLeadsImport(text);
  if (error) return { error };
  if (rows.length === 0) return { error: "No valid rows found — check the header and data." };

  const supabase = await createSupabaseServerClient();
  // Every exported server action is a callable endpoint, so the check belongs here
  // and not in whichever page happened to import it.
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { data: existing } = await supabase.from("leads").select("*").eq("user_id", uid);
  const plan = computeImportPlan(rows, existing ?? []);

  return {
    newCount: plan.newRows.length,
    unchanged: plan.unchanged,
    skipped,
    updates: plan.updates.map((u) => ({ id: u.id, name: u.name, changes: u.changes })),
  };
}

export type ImportResult = { imported: number; updated: number; error?: string };

/** Insert new leads; optionally apply the field changes to existing ones. */
export async function commitLeadsImport(
  text: string,
  updateExisting: boolean,
): Promise<ImportResult> {
  const { rows, error } = parseLeadsImport(text);
  if (error) return { imported: 0, updated: 0, error };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { imported: 0, updated: 0, error: "Not signed in." };

  const { data: existing } = await supabase.from("leads").select("*");
  const plan = computeImportPlan(rows, existing ?? []);

  if (plan.newRows.length > 0) {
    const { error: insErr } = await supabase.from("leads").insert(plan.newRows);
    if (insErr) return { imported: 0, updated: 0, error: saveErrorMessage(insErr) };
  }

  let updated = 0;
  if (updateExisting) {
    for (const u of plan.updates) {
      const { error: upErr } = await supabase
        .from("leads")
        .update(u.payload)
        .eq("id", u.id)
        .eq("user_id", uid);
      if (!upErr) updated++;
    }
  }

  revalidatePath("/leads");
  revalidatePath("/");
  return { imported: plan.newRows.length, updated };
}

export async function saveLead(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim() || null;
  const contact = String(formData.get("contact") ?? "").trim() || null;
  const channel = String(formData.get("channel") ?? "").trim() || null;
  const service = String(formData.get("service") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "new");
  const valueRaw = String(formData.get("value") ?? "").trim();
  const lastContactAt = String(formData.get("last_contact_at") ?? "").trim() || null;
  const nextFollowup = String(formData.get("next_followup") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) return { error: "Name is required." };
  if (!LEAD_STATUSES.includes(status as LeadStatus)) return { error: "Invalid status." };

  const value = valueRaw ? Number(valueRaw) : 0;
  if (Number.isNaN(value) || value < 0) return { error: "Value must be a positive number." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const payload = {
    name,
    company,
    contact,
    channel,
    service,
    status,
    value,
    last_contact_at: lastContactAt,
    next_followup: nextFollowup,
    notes,
  };

  if (id) {
    const { error } = await supabase.from("leads").update(payload).eq("id", id).eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error) };
  } else {
    const { error } = await supabase.from("leads").insert(payload);
    if (error) return { error: saveErrorMessage(error) };
  }

  revalidatePath("/leads");
  revalidatePath("/");
  redirect("/leads");
}

export async function deleteLead(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase.from("leads").delete().eq("id", id).eq("user_id", uid);
  if (error) console.error("deleteLead:", error.message);
  revalidatePath("/leads");
  revalidatePath("/");
  redirect("/leads");
}

/** Create a client from a won lead (or jump to the existing one), then mark the lead Won. */
export async function convertLeadToClient(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!lead) redirect("/leads");

  if (lead.client_id) {
    redirect(`/clients/${lead.client_id}`);
  }

  const clientName = lead.company || lead.name;
  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      name: clientName,
      contact: lead.contact,
      contact_channel: lead.channel,
      notes: lead.notes,
    })
    .select("id")
    .single();
  if (error || !client) redirect("/leads");

  // Start a project for the new client, named after them.
  await supabase
    .from("projects")
    .insert({ client_id: client.id, title: clientName, status: "draft" });

  const { error: leadErr } = await supabase
    .from("leads")
    .update({ client_id: client.id, status: "won" })
    .eq("id", id)
    .eq("user_id", uid);
  if (leadErr) console.error("convertLeadToClient:", leadErr.message);

  revalidatePath("/leads");
  revalidatePath("/clients");
  revalidatePath("/projects");
  revalidatePath("/");
  redirect(`/clients/${client.id}`);
}
