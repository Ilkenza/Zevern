import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { todayISO } from "@/lib/format";
import { effectiveInvoiceStatus } from "@/lib/status";
import type { InvoiceWithClient } from "@/lib/types";
import { ReadFailed } from "./must";

const WITH_CLIENT = "*, client:clients(name)";

export async function getInvoices(): Promise<InvoiceWithClient[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase
    .from("invoices")
    .select(WITH_CLIENT)
    .eq("user_id", uid)
    .order("issued_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new ReadFailed("your invoices", error.message);
  return (data ?? []) as InvoiceWithClient[];
}

export async function getRecentInvoices(limit = 5): Promise<InvoiceWithClient[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase
    .from("invoices")
    .select(WITH_CLIENT)
    .eq("user_id", uid)
    .order("issued_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new ReadFailed("your recent invoices", error.message);
  return (data ?? []) as InvoiceWithClient[];
}

export async function getInvoice(id: string): Promise<InvoiceWithClient | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;

  const { data, error } = await supabase
    .from("invoices")
    .select(WITH_CLIENT)
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw new ReadFailed("this invoice", error.message);
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

  const { data, error } = await supabase
    .from("invoices")
    .select("number")
    .eq("user_id", uid)
    .like("number", `${prefix}%`);
  if (error) throw new ReadFailed("the next invoice number", error.message);

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
  /** One month back, so the headline figure can be given a direction. */
  revenueLastMonth: number;
  outstanding: number;
  outstandingCount: number;
  overdueCount: number;
  overdueAmount: number;
  /** Paid revenue per month, oldest first, ending with the month we are in. */
  revenueTrend: { month: string; value: number }[];
};

const TREND_MONTHS = 6;

/** `YYYY-MM`, `back` months before the month `from` names. */
function monthBack(from: string, back: number): string {
  const [y, m] = from.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getInvoiceStats(): Promise<InvoiceStats> {
  const empty: InvoiceStats = {
    revenueThisMonth: 0,
    revenueLastMonth: 0,
    outstanding: 0,
    outstandingCount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    revenueTrend: [],
  };

  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return empty;

  const { data, error } = await supabase
    .from("invoices")
    .select("amount, status, issued_at, due_date")
    .eq("user_id", uid);
  if (error) throw new ReadFailed("your invoice totals", error.message);
  const rows = data ?? [];
  const month = todayISO().slice(0, 7);

  // Every month in the window is seeded first, so a month that earned nothing reads
  // as a real zero instead of a gap the line quietly steps over.
  const trend = new Map<string, number>();
  for (let i = TREND_MONTHS - 1; i >= 0; i -= 1) trend.set(monthBack(month, i), 0);
  const previous = monthBack(month, 1);

  let revenueThisMonth = 0;
  let revenueLastMonth = 0;
  let outstanding = 0;
  let outstandingCount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;

  for (const inv of rows) {
    const amount = Number(inv.amount) || 0;
    const eff = effectiveInvoiceStatus(inv);
    const issuedMonth = inv.issued_at?.slice(0, 7);

    if (inv.status === "paid" && issuedMonth) {
      if (issuedMonth === month) revenueThisMonth += amount;
      if (issuedMonth === previous) revenueLastMonth += amount;
      if (trend.has(issuedMonth)) {
        trend.set(issuedMonth, (trend.get(issuedMonth) ?? 0) + amount);
      }
    }
    if (eff === "sent" || eff === "overdue") {
      outstanding += amount;
      outstandingCount += 1;
    }
    if (eff === "overdue") {
      overdueCount += 1;
      overdueAmount += amount;
    }
  }

  return {
    revenueThisMonth,
    revenueLastMonth,
    outstanding,
    outstandingCount,
    overdueCount,
    overdueAmount,
    revenueTrend: [...trend].map(([m, value]) => ({ month: m, value })),
  };
}
