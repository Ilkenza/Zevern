import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { todayISO } from "@/lib/format";
import { effectiveInvoiceStatus } from "@/lib/status";
import type { InvoiceWithClient } from "@/lib/types";

const WITH_CLIENT = "*, client:clients(name)";

export async function getInvoices(): Promise<InvoiceWithClient[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data } = await supabase
    .from("invoices")
    .select(WITH_CLIENT)
    .eq("user_id", uid)
    .order("issued_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as InvoiceWithClient[];
}

export async function getRecentInvoices(limit = 5): Promise<InvoiceWithClient[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data } = await supabase
    .from("invoices")
    .select(WITH_CLIENT)
    .eq("user_id", uid)
    .order("issued_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as InvoiceWithClient[];
}

export async function getInvoice(id: string): Promise<InvoiceWithClient | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;

  const { data } = await supabase
    .from("invoices")
    .select(WITH_CLIENT)
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  return (data as InvoiceWithClient | null) ?? null;
}

export async function getInvoiceCount(): Promise<number> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return 0;
  const { count } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid);
  return count ?? 0;
}

/**
 * Suggests `YYYY-NNN` for the next invoice.
 *
 * Counting rows was wrong: delete one invoice and the count drops, so the next
 * invoice reissues a number that has already gone to a client. Read the highest
 * number actually used this year instead — a number, once issued, is never reused
 * even if the invoice carrying it is gone.
 */
export async function nextInvoiceNumber(): Promise<string> {
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const prefix = `${year}-`;

  const uid = await userId(supabase);
  // Same answer this returns when no numbered invoice exists yet.
  if (!uid) return `${prefix}001`;

  const { data } = await supabase
    .from("invoices")
    .select("number")
    .eq("user_id", uid)
    .like("number", `${prefix}%`);

  let highest = 0;
  for (const row of data ?? []) {
    // Take the digits straight after the prefix, so a manually suffixed number
    // like 2026-014-2 still counts as 14 rather than resetting the sequence.
    const match = /^\d{4}-(\d+)/.exec(String(row.number ?? ""));
    const n = match ? Number(match[1]) : 0;
    if (n > highest) highest = n;
  }

  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

export type InvoiceStats = {
  revenueThisMonth: number;
  outstanding: number;
  overdueCount: number;
};

export async function getInvoiceStats(): Promise<InvoiceStats> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return { revenueThisMonth: 0, outstanding: 0, overdueCount: 0 };

  const { data } = await supabase
    .from("invoices")
    .select("amount, status, issued_at, due_date")
    .eq("user_id", uid);
  const rows = data ?? [];
  const month = todayISO().slice(0, 7);

  let revenueThisMonth = 0;
  let outstanding = 0;
  let overdueCount = 0;

  for (const inv of rows) {
    const amount = Number(inv.amount) || 0;
    const eff = effectiveInvoiceStatus(inv);
    if (inv.status === "paid" && inv.issued_at?.slice(0, 7) === month) {
      revenueThisMonth += amount;
    }
    if (eff === "sent" || eff === "overdue") {
      outstanding += amount;
    }
    if (eff === "overdue") {
      overdueCount += 1;
    }
  }

  return { revenueThisMonth, outstanding, overdueCount };
}
