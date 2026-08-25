"use client";

import { createContext, useContext } from "react";
import type { Currency } from "./index";

/**
 * The currency a form should open on.
 *
 * Read from the profile once, at the top of the app, rather than threaded through
 * MoneyView → TransactionForm and four other chains that have nothing to do with
 * settings. Forms ask for it where they used to hard-code "RSD"; nothing else changes.
 */
const DefaultCurrency = createContext<Currency>("RSD");

export function DefaultCurrencyProvider({
  value,
  children,
}: {
  value: Currency;
  children: React.ReactNode;
}) {
  return <DefaultCurrency.Provider value={value}>{children}</DefaultCurrency.Provider>;
}

/** Falls back to dinars when nothing has been chosen, which is what it always did. */
export function useDefaultCurrency(): Currency {
  return useContext(DefaultCurrency);
}
