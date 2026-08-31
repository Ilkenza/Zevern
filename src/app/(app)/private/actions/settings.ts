"use server";

import { fetchNbsRates } from "@/lib/rates/nbs";
import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
MoneyState,
num,
refresh,
today
} from "./shared";

/* -------------------------------------------------------- everyday spending */

/** How the timeline projects everyday spending: off, from budgets, or from history. */
export async function saveSpendingBasis(basis: string): Promise<MoneyState> {
  if (basis !== "off" && basis !== "budgets" && basis !== "history")
    return { error: "Unknown basis." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ spending_basis: basis })
    .eq("id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------- rates */

/**
 * Pull today's NBS middle rate instead of typing it. Past entries keep the rate they
 * were saved with, so this only affects what gets converted from here on.
 */
export async function refreshRatesFromNbs(): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  let rates;
  try {
    rates = await fetchNbsRates();
  } catch (cause) {
    console.error("refreshRatesFromNbs:", cause);
    return { error: "Could not reach the exchange rate service. The rates are unchanged." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      rate_eur: rates.eur.middle,
      rate_usd: rates.usd.middle,
      rates_updated_on: rates.eur.date || today(),
    })
    .eq("id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------ colours */

/** How many saved colours are worth keeping before the list stops being a shortlist. */
const MAX_CUSTOM_COLORS = 16;

/**
 * Keep a colour the owner mixed on the wheel. Newest first, no duplicates, and the
 * oldest fall off the end — a palette, not a history.
 */
export async function saveCustomColor(hex: string): Promise<MoneyState> {
  const clean = hex.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(clean)) return { error: "That is not a colour." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("custom_colors")
    .eq("id", uid)
    .maybeSingle();

  const existing = ((profile?.custom_colors ?? []) as string[]).filter((c) => c !== clean);
  const next = [clean, ...existing].slice(0, MAX_CUSTOM_COLORS);

  const { error } = await supabase
    .from("profiles")
    .update({ custom_colors: next })
    .eq("id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/* -------------------------------------------------------------------- rates */

export async function saveRates(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const eur = num(formData.get("rate_eur"));
  const usd = num(formData.get("rate_usd"));
  if (!(eur > 0) || !(usd > 0)) return { error: "Both rates have to be greater than zero." };

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({
      rate_eur: eur,
      rate_usd: usd,
      rates_updated_on: today(),
    })
    .eq("id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/**
 * A year of one category, fetched when its panel is opened rather than with the screen.
 *
 * The Money screen already knows what every category cost *this* month; a year of every
 * category is a dozen times that for a panel most visits never open. So it is a call of
 * its own, made on demand — the screen stays the same weight it was.
 *
 * `getCategoryHistory` reads under the caller's own session, so RLS decides what comes
 * back. A crafted category id belonging to somebody else matches no rows of yours and
 * returns nothing, which is the honest answer and not an error worth naming.
 */
