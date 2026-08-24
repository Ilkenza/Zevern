import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { ServiceItem } from "@/lib/types";

export async function getServiceItems(): Promise<ServiceItem[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data } = await supabase
    .from("service_items")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function getServiceItem(id: string): Promise<ServiceItem | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data } = await supabase
    .from("service_items")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  return data ?? null;
}
