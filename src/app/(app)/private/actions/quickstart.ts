"use server";

import { userId } from "@/lib/supabase/current-user";
import { saveErrorMessage } from "@/lib/supabase/errors";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  anchorDayFor,
  CURRENCIES,
  DEFAULT_CATEGORIES,
  monthlyDayFrom,
  nextMonthlyOn,
  type Currency,
} from "@/lib/money";
import { todayISO } from "@/lib/format";
import { MAX_AMOUNT, type MoneyState, refresh } from "./shared";

/* ------------------------------------------ the questions the money half asks on day one */

const MAX_ROWS = 12;
const MAX_NAME = 80;
const KINDS = ["cash", "bank", "card", "savings", "other"];

/**
 * Where the money is kept, and how much is in each of them right now.
 *
 * The one question the private side cannot work without an answer to. Every figure on it
 * is a balance, and a balance needs somewhere to be — which is why the page it replaces
 * offered a button that made a `Cash` and a `Bank (RSD)` out of thin air, both at zero.
 * That is two accounts nobody chose holding an amount nobody has, and the first screen
 * then reads as a person with no money rather than a person who has not said yet.
 *
 * The categories are seeded here rather than asked about. "Which categories do you want"
 * is the one question a person cannot answer before they have spent anything — the list
 * is obvious in hindsight and invisible in advance — so a usable set arrives with the
 * accounts and is edited later, when they have an opinion.
 */
export async function saveStartingAccounts(
  _prev: MoneyState,
  formData: FormData,
): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("default_currency")
    .eq("id", uid)
    .maybeSingle();
  if (profileError) return { error: saveErrorMessage(profileError) };
  const stored = profile?.default_currency ?? "RSD";
  const currency = ((CURRENCIES as readonly string[]).includes(stored) ? stored : "RSD") as Currency;

  const rows = parseRows(formData.get("accounts"));
  if (rows === null) return { error: "Those accounts did not arrive in one piece. Try again." };

  const wanted: { user_id: string; name: string; kind: string; currency: Currency; opening_balance: number; sort: number }[] = [];
  for (const row of rows) {
    const name = String(row.name ?? "").trim().slice(0, MAX_NAME);
    if (!name) continue;

    const kindRaw = String(row.kind ?? "bank");
    const kind = KINDS.includes(kindRaw) ? kindRaw : "other";

    /*
      An empty balance is zero and not a refusal. Plenty of people genuinely do not know
      what is in an account to the dinar when they are asked, and making them go and look
      before they can carry on is how a two-minute run becomes an abandoned one. The
      number is on the account row in Setup for the moment they do know.
    */
    const raw = Number(String(row.balance ?? "").replace(/\s/g, "").replace(",", "."));
    const balance = Number.isFinite(raw) && Math.abs(raw) <= MAX_AMOUNT ? Math.round(raw * 100) / 100 : 0;

    wanted.push({ user_id: uid, name, kind, currency, opening_balance: balance, sort: wanted.length });
    if (wanted.length >= MAX_ROWS) break;
  }

  if (wanted.length === 0) return { error: "Name at least one place your money sits." };

  /* The first account is the default by definition — the same rule `saveAccount` follows. */
  const { count, error: countError } = await supabase
    .from("money_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid);
  if (countError) return { error: saveErrorMessage(countError) };

  const first = (count ?? 0) === 0;
  const { error } = await supabase
    .from("money_accounts")
    .insert(wanted.map((a, i) => ({ ...a, is_default: first && i === 0 })));
  if (error) return { error: saveErrorMessage(error) };

  await seedCategories(supabase, uid);

  refresh();
  return { ok: true };
}

/**
 * The things that happen every month whether anybody does anything or not.
 *
 * Both halves of the run's second and third questions end here — what arrives and what
 * leaves are the same shape of fact, and the only difference between them is a word. It
 * is the answer that makes the forecast worth looking at on the first day rather than the
 * fortieth: a timeline with nothing on it predicts nothing.
 *
 * Nothing is booked automatically. `books_itself` stays false, which is the owner's own
 * standing rule for this app — a rule that pays itself is a figure that moved while
 * nobody was looking, and he asked for the button instead.
 */
export async function saveStartingRecurring(
  _prev: MoneyState,
  formData: FormData,
): Promise<MoneyState> {
  const kindRaw = String(formData.get("kind") ?? "expense");
  const kind = kindRaw === "income" ? "income" : "expense";

  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const rows = parseRows(formData.get("items"));
  if (rows === null) return { error: "Those items did not arrive in one piece. Try again." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("default_currency")
    .eq("id", uid)
    .maybeSingle();
  if (profileError) return { error: saveErrorMessage(profileError) };
  const stored = profile?.default_currency ?? "RSD";
  const currency = ((CURRENCIES as readonly string[]).includes(stored) ? stored : "RSD") as Currency;

  const { data: account, error: accountError } = await supabase
    .from("money_accounts")
    .select("id")
    .eq("user_id", uid)
    .eq("archived", false)
    .order("is_default", { ascending: false })
    .order("sort", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (accountError) return { error: saveErrorMessage(accountError) };

  const payloads = [];
  for (const row of rows) {
    const name = String(row.name ?? "").trim().slice(0, MAX_NAME);
    if (!name) continue;

    const raw = Number(String(row.amount ?? "").replace(/\s/g, "").replace(",", "."));
    const amount = Number.isFinite(raw) && raw > 0 && raw <= MAX_AMOUNT ? Math.round(raw * 100) / 100 : 0;

    /*
      The anchor is the day they typed, not the day the first one lands on.

      Those differ, and the difference is a month of wrong dates. Type 30 today and the
      first one falls on the 30th of this month — but hand that date to `anchorDayFor`
      and it reads 30 September as month-end and promotes the anchor to 31, so every
      month after that fires on the 31st of a rule somebody wrote 30 on. The promotion
      is right when a rule is built from a date somebody picked; it is wrong when they
      typed the number themselves, because then there is nothing to infer.

      A blank day is the one case with nothing typed to keep, so it falls back to the
      date — starting today, monthly — and `anchorDayFor` reads that as it always has.
    */
    const day = monthlyDayFrom(row.day);
    const nextOn = nextMonthlyOn(day, todayISO());

    payloads.push({
      user_id: uid,
      name,
      kind,
      amount,
      currency,
      /*
        No figure means the amount changes, not that it is nothing. Electricity is a
        different number every month and the app already has a word for that — marking it
        variable is what stops the forecast inventing a figure nobody gave it.
      */
      variable: amount === 0,
      books_itself: false,
      every: "month",
      every_count: 1,
      ends_when: "never",
      next_on: nextOn,
      anchor_day: day ?? anchorDayFor(nextOn, "month"),
      account_id: account?.id ?? null,
      active: true,
    });
    if (payloads.length >= MAX_ROWS) break;
  }

  if (payloads.length === 0) return { ok: true };

  const { error } = await supabase.from("money_recurring").insert(payloads);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/**
 * "Not now" — for the private side only.
 *
 * Its own column rather than the `onboarding_hidden` the work side uses, and that is the
 * whole reason this function exists instead of a second call to `hideOnboarding`. One flag
 * behind both would mean dismissing a card here also retired the getting-started checklist
 * and the setup questions on the work screen — three cards gone from a page nobody was
 * looking at, in answer to a question asked somewhere else.
 */
export async function hideMoneyOnboarding(): Promise<MoneyState> {
  const supabase = await createSupabaseServerClient();
  const uid = await userId(supabase);
  if (!uid) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ money_onboarding_hidden: true })
    .eq("id", uid);
  if (error) return { error: saveErrorMessage(error) };

  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------------------ helpers */

/** Whatever arrived in the hidden field, as rows — or `null` when it was not a list. */
function parseRows(raw: FormDataEntryValue | null): Record<string, unknown>[] | null {
  let data: unknown;
  try {
    data = JSON.parse(String(raw ?? "[]"));
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  return data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
}

/** A usable set of categories, once, and never on top of a list that already exists. */
async function seedCategories(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  uid: string,
): Promise<void> {
  const { count, error } = await supabase
    .from("money_categories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid);
  // A failed count is not worth failing the accounts over; the Setup page still offers
  // the same seed, and an account with no categories is recoverable in one tap.
  if (error || (count ?? 0) > 0) return;

  await supabase
    .from("money_categories")
    .insert(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sort: i, user_id: uid })));
}
