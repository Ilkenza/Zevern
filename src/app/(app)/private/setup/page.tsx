import { headers } from "next/headers";
import {
  getAccountBalances,
  getCategories,
  getRates,
  getRecurring,
  hasIncomeOnFile,
} from "@/lib/data/money";
import { getProfile } from "@/lib/data/profile";
import { SetupView } from "@/components/private/SetupView";

/**
 * Where this app is answering from, so the calendar address can be shown in full — a
 * feed URL that is not absolute is not something anyone can paste into Google.
 *
 * Read off the request rather than an environment variable, because the app is reached
 * at whatever host it is deployed behind and there is no setting for that. The headers
 * are forgeable, but only by the person already signed in and looking at their own
 * screen, so the worst it can do is show them an address that does not work.
 */
async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function PrivateSetupPage() {
  const [accounts, categories, rates, profile, rules, incomeOnFile, origin] = await Promise.all([
    getAccountBalances(),
    getCategories(),
    getRates(),
    getProfile(),
    getRecurring(),
    hasIncomeOnFile(),
    currentOrigin(),
  ]);

  /*
    Only what actually brings money in. A paused rule is a decision to stop counting on
    it, and a goal rule moves money that is already yours — neither is an answer to
    "what comes in".
  */
  const earning = rules.filter((r) => r.kind === "income" && r.active && r.goal_id == null);

  return (
    <SetupView
      accounts={accounts}
      categories={categories}
      rates={rates}
      ratesUpdatedOn={profile?.rates_updated_on ?? null}
      calendarToken={profile?.calendar_token ?? null}
      earning={earning}
      incomeOnFile={incomeOnFile}
      origin={origin}
    />
  );
}
