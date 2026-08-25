"use client";

import { createContext, useContext, useMemo } from "react";
import { makeMoney, RSD_DISPLAY, type Display, type Money } from "./display";
import type { Currency } from "./index";

/**
 * The currency this person reads in, and the rates to get there.
 *
 * Read from the profile once at the top of the app rather than threaded through
 * MoneyView → TransactionForm and four other chains that have nothing to do with
 * settings. Client screens ask for it here; server ones ask `getMoney()`, which is the
 * same object built the same way.
 */
const DisplayContext = createContext<Display>(RSD_DISPLAY);

export function DefaultCurrencyProvider({
  value,
  children,
}: {
  value: Display;
  children: React.ReactNode;
}) {
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

/** What a form should open on. Falls back to dinars, which is what it always did. */
export function useDefaultCurrency(): Currency {
  return useContext(DisplayContext).currency;
}

/** How this screen prints money. One line per component, one object out. */
export function useMoney(): Money {
  const display = useContext(DisplayContext);
  return useMemo(() => makeMoney(display), [display]);
}
