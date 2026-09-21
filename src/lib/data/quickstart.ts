import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";
import { ReadFailed } from "./must";
import { CURRENCIES, type Currency } from "@/lib/money";

/**
 * The few questions a new account is asked, and how far through them it is.
 *
 * Distinct from `getOnboarding`, and the difference is the whole point of it. That one
 * is a checklist: six things a person has to go and do, and five of them are things only
 * they can do — nobody can be *asked* into having a client, a project or a paid invoice.
 * This is the other half: the handful of answers that are pure configuration, which the
 * app can act on the moment they are given. A stranger's first screen used to be eight
 * empty panels and a seed button; three questions leaves it with its name on its
 * paperwork and a price list to quote from.
 *
 * The rule the questions are written to: every one of them has to *build* something. A
 * question whose answer is only remembered is a form, and a form is what this replaces.
 *
 * Answered from the data, like both checklists beside it, rather than from a flag. A
 * stored "finished" bit is a second source of truth that drifts the first time somebody
 * fills a field from Settings instead of from here — and then the card either nags about
 * work already done or retires having done none.
 */
export type QuickstartAnswers = {
  /** Whether the private half of the app is wanted at all. */
  wantsPrivate: boolean;
  businessName: string;
  businessEmail: string;
  businessAddress: string;
  vatId: string;
  currency: Currency;
  /** How many lines are on the price list already. */
  services: number;
};

export type Quickstart = {
  /** Of the two things these questions build, how many exist. */
  done: number;
  total: number;
  /** True once there is nothing left for the questions to do. */
  complete: boolean;
  /** The person asked not to be shown this, or there is nothing to show. */
  hidden: boolean;
  /** What is already known, so a question opens on its answer rather than empty. */
  answers: QuickstartAnswers;
};

const EMPTY: Quickstart = {
  done: 0,
  total: 2,
  complete: false,
  hidden: true,
  answers: {
    wantsPrivate: true,
    businessName: "",
    businessEmail: "",
    businessAddress: "",
    vatId: "",
    currency: "RSD",
    services: 0,
  },
};

export async function getQuickstart(): Promise<Quickstart> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return EMPTY;

  const [{ data: profile, error }, { count, error: countError }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "business_name, business_email, business_address, vat_id, default_currency, hidden_modules, onboarding_hidden",
      )
      .eq("id", uid)
      .maybeSingle(),
    // Only the count: the price list itself is none of this module's business.
    supabase.from("service_items").select("*", { count: "exact", head: true }).eq("user_id", uid),
  ]);

  if (error) throw new ReadFailed("your profile", error.message);
  if (countError) throw new ReadFailed("your price list", countError.message);

  const services = count ?? 0;
  const businessName = (profile?.business_name ?? "").trim();

  /*
    Two things are built by these questions, so two things are counted. The first
    question — which halves of the app you want — is a preamble rather than a step: its
    answer is stored the instant it is given, in the same `hidden_modules` that Settings
    writes, and there is no state in which it is half-answered.
  */
  const done = (businessName ? 1 : 0) + (services > 0 ? 1 : 0);
  const stored = profile?.default_currency ?? "RSD";

  return {
    done,
    total: 2,
    complete: done === 2,
    hidden: Boolean(profile?.onboarding_hidden) || done === 2,
    answers: {
      wantsPrivate: !(profile?.hidden_modules ?? []).includes("private"),
      businessName,
      businessEmail: (profile?.business_email ?? "").trim(),
      businessAddress: (profile?.business_address ?? "").trim(),
      vatId: (profile?.vat_id ?? "").trim(),
      currency: ((CURRENCIES as readonly string[]).includes(stored) ? stored : "RSD") as Currency,
      services,
    },
  };
}

/* ------------------------------------------------- and the same idea for the money half */

export type MoneyQuickstart = {
  /** True once there is somewhere for money to sit. */
  hasAccounts: boolean;
  /** Whether anything repeating has been described yet — income or outgoing. */
  recurring: number;
  /** Nothing to ask, or the person asked not to be asked. */
  hidden: boolean;
  currency: Currency;
};

/**
 * Whether the money half still needs its first few answers.
 *
 * The card is held open by one thing and one thing only: whether there is an account. That
 * is the single fact the whole private side is unusable without — every figure on it is a
 * balance, and a balance needs somewhere to be. `foundation.ts` marks the same step
 * required, for the same reason.
 *
 * The other two questions in the run — what comes in, what goes out on its own — are
 * offered and never insisted on, because both have an honest answer that builds nothing. A
 * freelancer whose money arrives whenever an invoice is paid has no monthly income rule to
 * describe, and somebody whose bills are all irregular has no standing charge. Holding a
 * card open until those are "done" would nag them forever for work that does not exist.
 *
 * Dismissal reads `money_onboarding_hidden` and not the `onboarding_hidden` above it. The
 * two halves are separately wanted — being done thinking about your own money says nothing
 * about whether your business name is on a quote yet — and one flag behind both would mean
 * a "Not now" here also cleared two cards on a screen nobody was looking at.
 */
export async function getMoneyQuickstart(): Promise<MoneyQuickstart> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return { hasAccounts: true, recurring: 0, hidden: true, currency: "RSD" };

  const [accounts, rules, { data: profile, error }] = await Promise.all([
    supabase.from("money_accounts").select("*", { count: "exact", head: true }).eq("user_id", uid),
    supabase.from("money_recurring").select("*", { count: "exact", head: true }).eq("user_id", uid),
    supabase
      .from("profiles")
      .select("default_currency, money_onboarding_hidden")
      .eq("id", uid)
      .maybeSingle(),
  ]);

  if (accounts.error) throw new ReadFailed("your accounts", accounts.error.message);
  if (rules.error) throw new ReadFailed("your repeating items", rules.error.message);
  if (error) throw new ReadFailed("your profile", error.message);

  const hasAccounts = (accounts.count ?? 0) > 0;
  const stored = profile?.default_currency ?? "RSD";

  return {
    hasAccounts,
    recurring: rules.count ?? 0,
    hidden: hasAccounts || Boolean(profile?.money_onboarding_hidden),
    currency: ((CURRENCIES as readonly string[]).includes(stored) ? stored : "RSD") as Currency,
  };
}
