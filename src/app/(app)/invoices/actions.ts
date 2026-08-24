"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { ownsRow, userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/lib/status";
import { quoteTotal } from "@/lib/quotes/total";
import type { QuoteItem } from "@/lib/types";

export type InvoiceFormState = { error?: string } | undefined;

/** The only unique constraint on an invoice is (user_id, number). */
const NUMBER_TAKEN = "You already have an invoice with that number.";

function parseItems(raw: string): QuoteItem[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => ({
        label: String(x?.label ?? "").trim(),
        price: Number(x?.price) || 0,
        qty: Math.max(1, Math.floor(Number(x?.qty) || 1)),
      }))
      .filter((x) => x.label !== "");
  } catch {
    return [];
  }
}

export async function saveInvoice(
  _prev: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const clientId = String(formData.get("client_id") ?? "").trim() || null;
  const number = String(formData.get("number") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "draft");
  const currencyRaw = String(formData.get("currency") ?? "EUR");
  const currency = ["EUR", "USD", "RSD"].includes(currencyRaw) ? currencyRaw : "EUR";
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const issuedAt = String(formData.get("issued_at") ?? "").trim() || null;
  const dueDate = String(formData.get("due_date") ?? "").trim() || null;
  const items = parseItems(String(formData.get("items") ?? "[]"));

  if (!INVOICE_STATUSES.includes(status as InvoiceStatus)) return { error: "Invalid status." };

  // With line items the amount is their sum; otherwise fall back to the manual amount field.
  const amount = items.length > 0 ? quoteTotal(items) : amountRaw ? Number(amountRaw) : 0;
  if (Number.isNaN(amount) || amount < 0) return { error: "Amount must be a positive number." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  if (!(await ownsRow(supabase, "clients", clientId, uid)))
    return { error: "That client is not on your account." };

  const payload = {
    client_id: clientId,
    number,
    amount,
    currency,
    status,
    issued_at: issuedAt,
    due_date: dueDate,
    items,
  };

  if (id) {
    const { error } = await supabase
      .from("invoices")
      .update(payload)
      .eq("id", id)
      .eq("user_id", uid);
    if (error) return { error: saveErrorMessage(error, { unique: NUMBER_TAKEN }) };
  } else {
    const { error } = await supabase.from("invoices").insert(payload);
    if (error) return { error: saveErrorMessage(error, { unique: NUMBER_TAKEN }) };
  }

  revalidatePath("/invoices");
  revalidatePath("/");
  redirect("/invoices");
}

export async function deleteInvoice(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase.from("invoices").delete().eq("id", id).eq("user_id", uid);
  if (error) console.error("deleteInvoice:", error.message);
  revalidatePath("/invoices");
  revalidatePath("/");
  redirect("/invoices");
}
