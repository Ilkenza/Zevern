import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { QuoteWithClient } from "@/lib/types";
import { ReadFailed } from "./must";

const WITH_CLIENT = "*, client:clients(name)";

export async function getQuotes(): Promise<QuoteWithClient[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase
    .from("quotes")
    .select(WITH_CLIENT)
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw new ReadFailed("your quotes", error.message);
  return (data ?? []) as unknown as QuoteWithClient[];
}

export async function getQuote(id: string): Promise<QuoteWithClient | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data, error } = await supabase
    .from("quotes")
    .select(WITH_CLIENT)
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw new ReadFailed("this quote", error.message);
  return (data as unknown as QuoteWithClient | null) ?? null;
}

export async function getQuoteCount(): Promise<number> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return 0;
  const { count } = await supabase
    .from("quotes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid);
  return count ?? 0;
}
