"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";

export type CalendarTokenState = { token?: string; error?: string } | undefined;

/**
 * How much randomness the address is worth. 32 bytes is 256 bits; base64url turns
 * that into 43 characters of `[A-Za-z0-9_-]`, which is comfortably past the 24 the
 * `calendar_feed` function refuses below and short enough to paste into a phone.
 *
 * The length is the whole defence. Nothing rate-limits an anonymous GET, so the only
 * thing standing between a stranger and the list is that guessing the path is not a
 * thing that can be done.
 */
const TOKEN_BYTES = 32;

/**
 * Create the private calendar address, or replace it.
 *
 * There is only one action because there is only one operation: the address either
 * exists or it does not, and replacing it *is* revoking it — the old URL stops
 * matching a profile the moment the new one is written, and every calendar still
 * subscribed to it starts getting a 404.
 *
 * Unlike the extension token, this one is stored in the clear rather than hashed.
 * That is not an oversight: the feed is looked up *by* the token on an anonymous
 * request, so there is no user to scope the search to and nothing to compare a hash
 * against. It buys the owner something in return — the address can be shown again on
 * a later visit instead of being a one-time reveal.
 */
export async function generateCalendarToken(): Promise<CalendarTokenState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  const { error } = await supabase
    .from("profiles")
    .update({ calendar_token: token })
    .eq("id", uid);
  // The column is unique across every account, so a collision would be with a
  // stranger's address — at 256 bits it will not happen, but it must not be silent.
  if (error)
    return {
      error: saveErrorMessage(error, {
        unique: "Could not claim that address. Try again.",
      }),
    };

  revalidatePath("/private/setup");
  return { token };
}
