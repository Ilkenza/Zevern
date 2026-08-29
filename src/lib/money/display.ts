/**
 * The currency the figures are *read* in, as opposed to the one they are stored in.
 *
 * Everything in the ledger is kept in dinars — `amount_rsd` on every entry, worked out
 * at the rate of the day it was entered — because a single internal unit is what keeps
 * balances, budgets, goals and the forecast from ever disagreeing. That decision is
 * untouched here. This is only about the last step before a number reaches a screen.
 *
 * Two rules make the whole thing predictable:
 *
 *  - Rates are held as "one unit in dinars", so dinars into another currency divides.
 *  - The conversion uses today's rate, for every month, including old ones. A statement
 *    that re-prices itself as the market moves is the honest reading of "what is this
 *    worth to me now", which is the question a personal budget is asking. The ledger
 *    itself never moves: each entry keeps the rate it was written at.
 */

import { formatAmount, formatRsd, formatRsdExact, rateFor, type Currency, type Rates } from "./index";

export type Display = { currency: Currency; rates: Rates };

export const RSD_DISPLAY: Display = { currency: "RSD", rates: { EUR: 0, USD: 0 } };

/** Dinars in the currency being read. A missing rate falls back to dinars rather than
 *  dividing by nothing and printing Infinity at somebody. */
export function fromRsd(rsd: number, display: Display): number {
  const value = Number.isFinite(rsd) ? rsd : 0;
  if (display.currency === "RSD") return value;
  const rate = rateFor(display.currency, display.rates);
  return rate > 0 ? value / rate : value;
}

/** A whole figure, in the reader's currency: "149.453 RSD", "€1.274", "$1.489". */
export function formatDisplay(rsd: number, display: Display): string {
  if (display.currency === "RSD") return formatRsd(rsd);
  const converted = fromRsd(rsd, display);
  // Under a thousand the cents carry real information; above it they are noise.
  const rounded = Math.abs(converted) >= 1000 ? Math.round(converted) : Math.round(converted * 100) / 100;
  return formatAmount(rounded, display.currency);
}

/** The same, with the decimals kept — for a figure somebody is meant to act on. */
export function formatDisplayExact(rsd: number, display: Display): string {
  if (display.currency === "RSD") return formatRsdExact(rsd);
  const converted = fromRsd(rsd, display);
  return formatAmount(Math.round(converted * 100) / 100, display.currency);
}

/** The compact form used on tight rows: "1,2k", "340". */
export function formatDisplayShort(rsd: number, display: Display): string {
  const n = fromRsd(rsd, display);
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `${k.toFixed(Math.abs(k) < 100 ? 1 : 0).replace(".", ",")}k`;
  }
  return String(Math.round(n));
}

/** What every screen calls to print money. One object, so a component takes one line. */
export type Money = {
  /** A figure held in dinars, printed in the reader's currency. */
  fmt: (rsd: number | null | undefined) => string;
  /** The same, keeping the decimals — for a figure that is an instruction. */
  fmtExact: (rsd: number | null | undefined) => string;
  /** The same, compact. */
  fmtShort: (rsd: number | null | undefined) => string;
  /** The code itself, for labels like "Target (EUR)". */
  code: Currency;
  /** For the rare screen that has to do its own arithmetic before printing. */
  display: Display;
};

export function makeMoney(display: Display): Money {
  return {
    fmt: (rsd) => formatDisplay(Number(rsd) || 0, display),
    fmtExact: (rsd) => formatDisplayExact(Number(rsd) || 0, display),
    fmtShort: (rsd) => formatDisplayShort(Number(rsd) || 0, display),
    code: display.currency,
    display,
  };
}
