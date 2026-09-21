"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { MODULE_OPTIONS } from "@/lib/nav";
import { CURRENCIES, type Currency } from "@/lib/money";

/* ------------------------------------------------- the questions a new account is asked */

/**
 * One action per question, and each one writes the moment it is answered.
 *
 * That is what makes the run skippable and worth resuming. A wizard that holds every
 * answer until the last screen loses all of them when somebody closes the tab on the
 * third — and the third is exactly where a person stops to go and look something up.
 * Here, walking away after one question leaves that question answered.
 */
export type QuickstartState = { ok?: boolean; error?: string } | undefined;

const MAX_SERVICES = 12;
const MAX_LABEL = 120;

/**
 * Which halves of the app this person wants.
 *
 * Zevern is bought for the freelance side; the private half is a second product inside
 * the first, and somebody who does not want it should not have to look at the switch for
 * it every day. Stored in the same `hidden_modules` Settings writes, so this is not a
 * separate mechanism to remember — it is the ordinary module switch, asked once, early.
 */
export async function chooseWorkspaces(wantsPrivate: boolean): Promise<QuickstartState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("hidden_modules")
    .eq("id", user.id)
    .maybeSingle();
  if (readError) return { error: saveErrorMessage(readError) };

  /*
    The rest of the list is left exactly as it was. This question is about one module, and
    rewriting the whole array from an answer about one of them would quietly switch eight
    others back on for anybody who had turned them off.
  */
  const known = new Set(MODULE_OPTIONS.map((m) => m.key as string));
  const hidden = new Set(
    (profile?.hidden_modules ?? []).filter((key: string) => known.has(key)),
  );
  if (wantsPrivate) hidden.delete("private");
  else hidden.add("private");

  const { error } = await supabase
    .from("profiles")
    .update({ hidden_modules: [...hidden] })
    .eq("id", user.id);
  if (error) return { error: saveErrorMessage(error) };

  // The sidebar is rendered in the layout, so the switch only disappears if that is redrawn.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Whose name goes on a quote, and in what currency the work is priced.
 *
 * The currency rides along with the paperwork rather than getting a screen of its own.
 * It is one choice, it belongs to the same subject — what a document says when it leaves
 * here — and a question per field is how a three-question run becomes a six-question one
 * that nobody finishes.
 */
export async function savePaperwork(
  _prev: QuickstartState,
  formData: FormData,
): Promise<QuickstartState> {
  const business_name = String(formData.get("business_name") ?? "").trim().slice(0, 160);
  const business_email = String(formData.get("business_email") ?? "").trim().slice(0, 160) || null;
  const business_address = String(formData.get("business_address") ?? "").trim().slice(0, 300) || null;
  const vat_id = String(formData.get("vat_id") ?? "").trim().slice(0, 40) || null;

  const asked = String(formData.get("currency") ?? "RSD").toUpperCase();
  const currency = ((CURRENCIES as readonly string[]).includes(asked) ? asked : "RSD") as Currency;

  if (!business_name) return { error: "A quote needs a name to go out under." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ business_name, business_email, business_address, vat_id, default_currency: currency })
    .eq("id", user.id);
  if (error) return { error: saveErrorMessage(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * The price list, which is the one answer that saves real typing later.
 *
 * A quote is built by picking from this; without it the first quote is a blank page and
 * somebody inventing their own prices under time pressure. Three lines here and the first
 * quote is three clicks.
 *
 * Added to rather than replacing what is there. This question can be answered twice — the
 * card stays until the list has something on it, and somebody may well come back with two
 * more services — and an answer that wiped the previous one would be a trap.
 */
export async function saveServices(
  _prev: QuickstartState,
  formData: FormData,
): Promise<QuickstartState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  /*
    The currency is read rather than asked for again, and a failed read is refused rather
    than defaulted. Falling back to dinars here would write a price list in the wrong
    money and say nothing — and a price list is the one thing on this screen that gets
    copied into a document a client reads.
  */
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("default_currency")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return { error: saveErrorMessage(profileError) };

  const stored = profile?.default_currency ?? "RSD";
  const currency = ((CURRENCIES as readonly string[]).includes(stored) ? stored : "RSD") as Currency;

  let rows: unknown;
  try {
    rows = JSON.parse(String(formData.get("services") ?? "[]"));
  } catch {
    return { error: "Those services did not arrive in one piece. Try again." };
  }
  if (!Array.isArray(rows)) return { error: "Those services did not arrive in one piece. Try again." };

  /*
    Written to the per-currency column the catalog and the quote builder read.

    The first version wrote the old single `price` + `currency` pair, which nothing has
    read since the catalog went to one column per currency — so every figure typed here
    showed as "—" in the catalog and went into a quote at 0. The column follows the
    currency the paperwork question set, and the two others stay empty, which the
    catalog reads as "not offered in that currency".
  */
  const items: {
    user_id: string;
    label: string;
    price_rsd: number | null;
    price_eur: number | null;
    price_usd: number | null;
  }[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const label = String(entry.label ?? "").trim().slice(0, MAX_LABEL);
    if (!label) continue;

    const raw = Number(String(entry.price ?? "").replace(/\s/g, "").replace(",", "."));
    // A service with no price is still worth having on the list — the price can be
    // filled in the first time it is quoted, and refusing the line loses the name too.
    // Empty rather than 0, so the catalog says "no price" instead of quoting it free.
    const price = Number.isFinite(raw) && raw > 0 ? Math.round(raw * 100) / 100 : null;

    items.push({
      user_id: user.id,
      label,
      price_rsd: currency === "RSD" ? price : null,
      price_eur: currency === "EUR" ? price : null,
      price_usd: currency === "USD" ? price : null,
    });
    if (items.length >= MAX_SERVICES) break;
  }

  if (items.length === 0) return { error: "Name at least one thing you sell." };

  const { error } = await supabase.from("service_items").insert(items);
  if (error) return { error: saveErrorMessage(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}
