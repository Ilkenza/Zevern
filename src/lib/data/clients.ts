import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { Client } from "@/lib/types";

/** Client rows with an embedded project count (`projects(count)`). */
export type ClientWithCount = Client & { projects: { count: number }[] };

export async function getClientsWithCounts(): Promise<ClientWithCount[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data } = await supabase
    .from("clients")
    .select("*, projects(count)")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  return (data ?? []) as ClientWithCount[];
}

export async function getClients(): Promise<Client[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", uid)
    .order("name", { ascending: true });
  return data ?? [];
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  return data ?? null;
}

export async function getClientCount(): Promise<number> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return 0;
  const { count } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid);
  return count ?? 0;
}
