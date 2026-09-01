/**
 * What every money action needs before it can do anything: the shape it answers in, the
 * screens it has to refresh, and the handful of readers of a `FormData` that decide what
 * a submitted string is allowed to mean.
 *
 * A plain module rather than a `"use server"` one, because a server-action file may only
 * export async functions and most of what is here is a type, three constants and four
 * helpers. Split out of a 2,617-line `actions.ts` whose sections had been separated by
 * comment rules for a while — the rules were already the seams, this only cut along them.
 */

import { goalKinds, movesToward } from "@/lib/money/goal-progress";
import { todayISO } from "@/lib/format";
import {
CURRENCIES,
type Currency
} from "@/lib/money";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ReadFailed } from "@/lib/data/must";

export type MoneyState = { ok?: boolean; error?: string } | undefined;

export const PATHS = [
  "/private",
  "/private/money",
  "/private/budgets",
  "/private/goals",
  "/private/upcoming",
  // The two addresses /private/upcoming replaced. They only redirect now, but they
  // are still linked from elsewhere, so their cache entries have to go too.
  "/private/recurring",
  "/private/forecast",
  "/private/setup",
  "/private/quick",
];

export function refresh() {
  for (const p of PATHS) revalidatePath(p);
}

/**
 * A colour, or nothing.
 *
 * The pickers only ever send six hex digits, but a form field is whatever the person
 * on the other end of it decides to send, and this value is written straight into a
 * `style` attribute on every screen that draws the thing. Anything that is not a hex
 * colour is not a colour.
 */
export function hexColor(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

/** Money nobody could have meant: negative, or past what a number can carry honestly. */
export const MAX_AMOUNT = 1_000_000_000;

export function num(value: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function currencyOf(value: FormDataEntryValue | null): Currency {
  const c = String(value ?? "RSD").toUpperCase();
  return (CURRENCIES as readonly string[]).includes(c) ? (c as Currency) : "RSD";
}

/**
 * True when `id` names a row of `table` that belongs to `uid` — or when `id` is null,
 * because "no account attached" is a legitimate answer.
 *
 * The same hole as elsewhere: these ids arrive from a select in a form, and RLS only
 * checks the transaction being written, never the account or category it points at.
 * Without this, a crafted request books your expense against someone else's account,
 * and the list then reads that account's name across the tenant boundary.
 *
 * `ownsRow` in `@/lib/supabase/current-user` does this for the agency tables; the
 * money tables are private to this workspace and stay with it.
 */
export async function ownsMoneyRow(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table:
    | "money_accounts"
    | "money_categories"
    | "money_goals"
    | "money_loans"
    | "money_recurring"
    | "money_planned"
    | "money_budget_plans",
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
    console.error("ownsMoneyRow:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/*
  `toISOString()` is UTC, and next.config pins the server to Europe/Belgrade — so
  between midnight and 02:00 this returned yesterday while `monthKey()` on the very
  next line returned today. An entry added at 00:30 on 1 September was stored as
  31 August, then hidden from a screen defaulting to September and quietly added to
  August's totals and August's budget. `todayISO()` is the local answer.
*/
export function today(): string {
  return todayISO();
}

/**
 * A plain date, or null. Dates arrive from a date input, which means they can also
 * arrive from anything else — a move that wrote nonsense into `due_on` would put an
 * item somewhere no timeline could find it again.
 */
export function plainDate(value: FormDataEntryValue | string | null): string | null {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isFinite(Date.parse(`${text}T00:00:00Z`)) ? text : null;
}

/**
 * What a goal holds right now, in RSD: what went in, less what came back out.
 *
 * `exclude` drops one entry, which is what an edit needs — otherwise changing an
 * existing withdrawal is measured against a balance that still contains it. Null on a
 * read failure rather than 0, so a caller can refuse instead of guessing.
 *
 * Only a goal being *saved up* holds anything, and the direction is read here rather than
 * trusted to the caller. Three of the four callers — paying a goal out, moving money
 * between goals, closing one — take this figure and insert a `withdraw` for it, so a
 * balance reported for a goal that reserves nothing is not a wrong number on a screen: it
 * is money handed back that was never set aside, written into the ledger. A goal being
 * paid off had its money leave the account when it was spent, so it holds zero, always.
 */
export async function goalBalance(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  uid: string,
  goalId: string,
  exclude: string | null = null,
): Promise<number | null> {
  const [goalRes, moveRes] = await Promise.all([
    supabase
      .from("money_goals")
      .select("direction")
      .eq("id", goalId)
      .eq("user_id", uid)
      .maybeSingle(),
    supabase
      .from("money_transactions")
      .select("id, kind, amount_rsd")
      .eq("user_id", uid)
      .eq("goal_id", goalId)
      .in("kind", [...goalKinds(false)]),
  ]);

  if (goalRes.error || moveRes.error) {
    console.error("goalBalance:", (goalRes.error ?? moveRes.error)?.message);
    return null;
  }
  // Not a mistake to report — it is the correct answer for a goal of that shape.
  if (goalRes.data?.direction === "expense") return 0;

  let held = 0;
  for (const row of moveRes.data ?? []) {
    if (exclude && row.id === exclude) continue;
    held += (movesToward(row.kind, false) ? 1 : -1) * (Number(row.amount_rsd) || 0);
  }
  return held;
}

/**
 * Remember a name the *second* time it is used, and never the first.
 *
 * Saving every expense title would fill the list with the things this table exists to
 * avoid — every one-off, every typo, every `fdsfds` — and a picker full of noise is a
 * picker nobody opens. The second use is the difference between a thing somebody buys and
 * a thing that happened once, and it is a difference the app can see without asking.
 *
 * On a name already on the list this bumps what it costs and when it was last bought, so
 * the suggestion stays current without anybody maintaining it.
 *
 * Deliberately silent. It runs after an entry is saved, and an entry that saved correctly
 * must not report an error because a convenience behind it did not — the ledger is the
 * thing that matters and it is already written.
 */
export async function rememberItem({
  supabase,
  uid,
  name,
  price,
  currency,
  categoryId,
  on,
  exclude,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  uid: string;
  name: string;
  /** In the currency it was typed in, so the suggestion comes back the same way. */
  price: number | null;
  currency: string;
  categoryId: string | null;
  on: string;
  /** The entry being edited, which must not count as its own earlier use. */
  exclude: string | null;
}): Promise<void> {
  const clean = name.trim().slice(0, 80);
  if (!clean) return;

  try {
    const { data: known, error: knownError } = await supabase
      .from("money_items")
      .select("id, uses")
      .eq("user_id", uid)
      .ilike("name", clean)
      .maybeSingle();
    // Not fatal — the entry is already saved and this only teaches the shopping list.
    // But it must not read as "not on the list", which would insert a second copy of a
    // name that is already there.
    if (knownError) throw new ReadFailed("the things you have bought before", knownError.message);

    if (known) {
      await supabase
        .from("money_items")
        .update({
          uses: (known.uses ?? 0) + 1,
          last_used_on: on,
          // Only when there is one. An entry saved with no price must not erase a price
          // the list already knew.
          ...(price !== null && price > 0 ? { price, currency } : {}),
          ...(categoryId ? { category_id: categoryId } : {}),
        })
        .eq("id", known.id)
        .eq("user_id", uid);
      return;
    }

    // Not on the list yet. It earns a place only if this name has been used before.
    let before = supabase
      .from("money_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("kind", "expense")
      .ilike("title", clean);
    if (exclude) before = before.neq("id", exclude);

    const { count, error: countError } = await before;
    if (countError) throw new ReadFailed("how often you have bought this", countError.message);
    if ((count ?? 0) < 2) return;

    await supabase.from("money_items").insert({
      name: clean,
      price: price !== null && price > 0 ? price : null,
      currency,
      category_id: categoryId,
      uses: count ?? 2,
      last_used_on: on,
    });
  } catch (error) {
    console.error("rememberItem:", error);
  }
}

/** Rounding leaves ragged tenths of a dinar behind; do not fail a withdrawal over one. */
export const PENNY = 0.01;
