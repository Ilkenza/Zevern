/**
 * The server's copy of "what currency am I reading in".
 *
 * Same object the client gets from `useMoney()`, built from the same two facts: the
 * currency on the profile and today's rates. Both reads are request-cached, so a page
 * that asks for it in six different server components still asks the database once.
 */

import { cache } from "react";
import { getProfile } from "@/lib/data/profile";
import { makeMoney, type Money } from "@/lib/money/display";
import { CURRENCIES, type Currency } from "@/lib/money";
import { getRates } from "./core";

export const getMoney = cache(async (): Promise<Money> => {
  const [profile, rates] = await Promise.all([getProfile(), getRates()]);
  const stored = profile?.default_currency ?? "RSD";
  const currency = ((CURRENCIES as readonly string[]).includes(stored) ? stored : "RSD") as Currency;
  return makeMoney({ currency, rates });
});
