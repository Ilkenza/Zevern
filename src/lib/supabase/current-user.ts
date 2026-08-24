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

/**
 * True when `id` names a row of `table` that belongs to `uid` — or when `id` is null,
 * because "no client attached" is a legitimate answer.
 *
 * Foreign keys arrive from a form, and RLS only checks the row being written, never
 * the parent it points at. Without this, a crafted request attaches your invoice to
 * someone else's client: the invoice passes its own policy, and the join then reads a
 * name across the tenant boundary.
 */
export async function ownsRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "clients" | "projects" | "quotes" | "leads",
  id: string | null,
  uid: string,
): Promise<boolean> {
  if (!id) return true;

  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("id", id)
    .eq("user_id", uid);

  if (error) {
    console.error("ownsRow:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}
