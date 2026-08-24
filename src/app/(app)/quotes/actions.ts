"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { nextInvoiceNumber } from "@/lib/data/invoices";
import { quoteTotal } from "@/lib/quotes/total";
import { todayISO } from "@/lib/format";
import type { QuoteItem } from "@/lib/types";

export type QuoteFormState = { error?: string } | undefined;

const CURRENCIES = ["EUR", "USD", "RSD"];
const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined"];

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

export async function saveQuote(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const clientId = String(formData.get("client_id") ?? "").trim() || null;
  const currencyRaw = String(formData.get("currency") ?? "EUR");
  const currency = CURRENCIES.includes(currencyRaw) ? currencyRaw : "EUR";
  const statusRaw = String(formData.get("status") ?? "draft");
  const status = QUOTE_STATUSES.includes(statusRaw) ? statusRaw : "draft";
  const items = parseItems(String(formData.get("items") ?? "[]"));

  if (!title) return { error: "Title is required." };
  if (items.length === 0) return { error: "Add at least one line item." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const payload = { title, client_id: clientId, currency, status, items };

  let quoteId = id;
  if (id) {
    const { error } = await supabase
      .from("quotes")
      .update(payload)
      .eq("id", id)
      .eq("user_id", uid);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase.from("quotes").insert(payload).select("id").single();
    if (error || !data) return { error: error?.message ?? "Could not save." };
    quoteId = data.id;
  }

  revalidatePath("/quotes");
  revalidatePath("/");
  redirect(`/quotes/${quoteId}`);
}

export async function deleteQuote(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { error } = await supabase.from("quotes").delete().eq("id", id).eq("user_id", uid);
  if (error) console.error("deleteQuote:", error.message);
  revalidatePath("/quotes");
  revalidatePath("/");
  redirect("/quotes");
}

/** Create a draft invoice from a quote's total + currency; link it back. */
export async function convertQuoteToInvoice(id: string) {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return;

  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!quote) redirect("/quotes");
  if (quote.invoice_id) redirect(`/invoices/${quote.invoice_id}`);

  const items = (Array.isArray(quote.items) ? quote.items : []) as unknown as QuoteItem[];
  const total = quoteTotal(items);
  const number = await nextInvoiceNumber();

  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({
      client_id: quote.client_id,
      number,
      amount: total,
      currency: quote.currency,
      status: "draft",
      issued_at: todayISO(),
      items,
    })
    .select("id")
    .single();
  if (error || !inv) redirect("/quotes");

  const { error: quoteErr } = await supabase
    .from("quotes")
    .update({ invoice_id: inv.id, status: "accepted" })
    .eq("id", id)
    .eq("user_id", uid);
  if (quoteErr) console.error("convertQuoteToInvoice:", quoteErr.message);

  revalidatePath("/quotes");
  revalidatePath("/invoices");
  revalidatePath("/");
  redirect(`/invoices/${inv.id}`);
}
