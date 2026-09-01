import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import type { ServiceItem } from "@/lib/types";
import { ReadFailed } from "./must";

export async function getServiceItems(): Promise<ServiceItem[]> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return [];
  const { data, error } = await supabase
    .from("service_items")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: true });
  if (error) throw new ReadFailed("your service items", error.message);
  return data ?? [];
}

export async function getServiceItem(id: string): Promise<ServiceItem | null> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return null;
  const { data, error } = await supabase
    .from("service_items")
    .select("*")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw new ReadFailed("this service item", error.message);
  return data ?? null;
}
