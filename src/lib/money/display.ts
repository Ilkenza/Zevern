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

/**
 * The same, with the decimals kept where they say something — for a figure somebody is
 * meant to act on.
 *
 * It kept them at every size, and that broke the rule stated one function above: over a
 * thousand the decimals are noise. On Overview it showed: the headline read an overspend
 * of `5.434.768,3 RSD` while the row two inches below it printed the same figure as
 * `5.434.768 RSD`, and the two amounts in the headline's own sentence were rounded. One
 * figure, three formats, on the most-read line of the app.
 *
 * So the threshold is the same one everywhere now. Under a thousand this still differs
 * from `formatDisplay` — that is the whole point of it — and above a thousand there was
 * never a difference to draw.
 */
export function formatDisplayExact(rsd: number, display: Display): string {
  if (display.currency === "RSD") {
    return Math.abs(rsd) >= 1000 ? formatRsd(Math.round(rsd)) : formatRsdExact(rsd);
  }
  const converted = fromRsd(rsd, display);
  const rounded = Math.abs(converted) >= 1000 ? Math.round(converted) : Math.round(converted * 100) / 100;
  return formatAmount(rounded, display.currency);
}

/**
 * The compact form used on tight rows: "$485k", "$2.8M", "1,2k", "340".
 *
 * It stopped at thousands, which was right while everything on these screens was dinars
 * and a month was a six-figure number. In dollars a month of a holding company is seven,
 * and the bars over the trend panel read `2827k` — a unit nobody uses, next to `1939k` and
 * `464k`, which is three numbers you have to divide before you can compare them. Millions
 * and billions get their own step, so the label is always one or two significant places
 * and a letter.
 *
 * The symbol comes with it where there is one. A bar chart of money whose labels are bare
 * numerals is a bar chart of something; one character says which. `RSD` has no symbol and
 * its mark is four characters wide, so it stays bare in this form — the same as it has
 * always printed here — and the decimal comma stays with it, because that is the notation
 * the number is written in, not a property of the screen.
 */
export function formatDisplayShort(rsd: number, display: Display): string {
  const n = fromRsd(rsd, display);
  const abs = Math.abs(n);
  const [scale, suffix] =
    abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : abs >= 1e3 ? [1e3, "k"] : [1, ""];

  const scaled = abs / scale;
  // One decimal while the mantissa is small enough for it to mean anything: `2.8M` says
  // more than `3M`, `485k` says everything `485.2k` does.
  const body = scaled
    .toFixed(suffix && scaled < 100 ? 1 : 0)
    // `1.0M` is a decimal that carries nothing but its own point.
    .replace(/\.0$/, "");

  const symbol = display.currency === "EUR" ? "€" : display.currency === "USD" ? "$" : "";
  const text = display.currency === "RSD" ? body.replace(".", ",") : body;
  // The minus goes in front of the money, not in front of the amount: `-$2.8M`, the way
  // every other figure on these screens prints it.
  return `${n < 0 ? "-" : ""}${symbol}${text}${suffix}`;
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
