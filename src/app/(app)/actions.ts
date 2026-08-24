"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { saveErrorMessage } from "@/lib/supabase/errors";

export type GoalState = { ok?: boolean; error?: string } | undefined;

export async function saveRevenueGoal(
  _prev: GoalState,
  formData: FormData,
): Promise<GoalState> {
  const raw = String(formData.get("goal") ?? "").trim();
  const goal = raw ? Number(raw) : 0;
  if (Number.isNaN(goal) || goal < 0) return { error: "Enter a positive amount." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ revenue_goal: goal })
    .eq("id", user.id);
  if (error) return { error: saveErrorMessage(error) };

  revalidatePath("/");
  return { ok: true };
}

/** Put the getting-started checklist away. Progress itself is derived, never stored. */
export async function hideOnboarding(): Promise<GoalState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_hidden: true })
    .eq("id", user.id);
  if (error) return { error: saveErrorMessage(error) };

  revalidatePath("/");
  return { ok: true };
}
