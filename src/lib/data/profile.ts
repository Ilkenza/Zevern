import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { ReadFailed } from "./must";

export type Profile = Tables<"profiles">;

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw new ReadFailed("your profile", error.message);
  return data ?? null;
}

export async function getRevenueGoal(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data, error } = await supabase
    .from("profiles")
    .select("revenue_goal")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new ReadFailed("your revenue goal", error.message);
  return Number(data?.revenue_goal ?? 0) || 0;
}
