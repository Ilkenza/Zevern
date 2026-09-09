import { headers } from "next/headers";
import {
  getAccountBalances,
  getCategories,
  getCategoryUsage,
  getItems,
  getRates,
  getRecurring,
  getStock,
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
  const [accounts, categories, rates, profile, rules, incomeOnFile, origin, usage, items, stock] =
    await Promise.all([
      getAccountBalances(),
      getCategories(),
      getRates(),
      getProfile(),
      getRecurring(),
      hasIncomeOnFile(),
      currentOrigin(),
      getCategoryUsage(),
      getItems(),
      getStock(),
    ]);

  /*
    Only what actually brings money in. A paused rule is a decision to stop counting on
    it, and a goal rule moves money that is already yours — neither is an answer to
    "what comes in".
  */
  const earning = rules.filter((r) => r.kind === "income" && r.active && r.goal_id == null);

  /*
    What today's rate actually multiplies.

    Not everything with a currency on it. A goal and a debt are converted once, when they
    are written down, and keep the rate they were converted at — so a euro goal is
    unaffected by what the euro does tomorrow. An entry already booked keeps its own rate
    too. What is left is the things converted afresh every time they are read or posted:
    an account's balance, a standing rule's amount, and the price suggested for a thing on
    the shopping list.

    Counted rather than answered yes or no, so the panel can say what it is for instead of
    only appearing. `Six standing rules in EUR and USD' is a reason; a pair of boxes with a
    warning under them is a chore.
  */
  const converted = [
    ...accounts.filter((a) => a.currency !== "RSD").map((a) => a.currency),
    ...rules.filter((r) => r.currency !== "RSD").map((r) => r.currency),
    ...items.filter((i) => i.currency !== "RSD").map((i) => i.currency),
  ];
  const rateUse = {
    count: converted.length,
    currencies: [...new Set(converted)].sort(),
  };

  return (
    <SetupView
      accounts={accounts}
      categories={categories}
      usage={usage}
      items={items}
      rateUse={rateUse}
      stock={stock}
      rates={rates}
      ratesUpdatedOn={profile?.rates_updated_on ?? null}
      calendarToken={profile?.calendar_token ?? null}
      earning={earning}
      incomeOnFile={incomeOnFile}
      origin={origin}
    />
  );
}
