import type { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user's id, or null. Every write and every single-row read pairs this
 * with the row's `user_id` so a missing RLS policy cannot reach another user's row.
 */
export async function userId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
