/**
 * Money module — shared vocabulary and pure helpers.
 * Base currency is RSD; EUR/USD are converted with a rate the user keeps in Settings.
 */

export const CURRENCIES = ["RSD", "EUR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

export type Rates = { EUR: number; USD: number };

export const DEFAULT_RATES: Rates = { EUR: 117.2, USD: 101 };

/** How many RSD one unit of `currency` is worth. */
export function rateFor(currency: string, rates: Rates): number {
  if (currency === "EUR") return rates.EUR > 0 ? rates.EUR : DEFAULT_RATES.EUR;
  if (currency === "USD") return rates.USD > 0 ? rates.USD : DEFAULT_RATES.USD;
  return 1;
}

export function toRsd(amount: number, currency: string, rates: Rates): number {
  return Math.round(amount * rateFor(currency, rates) * 100) / 100;
}

/** Dinars, no cents — the only figure that matters at a glance. */
export function formatRsd(value: number | null | undefined): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("sr-RS", {
      style: "currency",
      currency: "RSD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${Math.round(n)} RSD`;
  }
}

/** Compact form for tight spots: 128.400 din -> "128,4k". */
export function formatRsdShort(value: number | null | undefined): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `${k.toFixed(Math.abs(k) < 100 ? 1 : 0).replace(".", ",")}k`;
  }
  return String(Math.round(n));
}

export function formatAmount(amount: number, currency: string): string {
  const n = Number.isFinite(amount) ? amount : 0;
  if (currency === "RSD") return formatRsd(n);
  const symbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : "";
  const body = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);
  return symbol ? `${symbol}${body}` : `${body} ${currency}`;
}

/* ---------------------------------------------------------------- months */

/** "2026-08" for the month `date` falls in (defaults to today, local time). */
export function monthKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthRange(key: string): { from: string; to: string } {
  const [y, m] = key.split("-").map(Number);
  const year = Number.isFinite(y) ? y : new Date().getFullYear();
  const month = Number.isFinite(m) ? m : new Date().getMonth() + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return key;
  return `${MONTH_NAMES[(m - 1 + 12) % 12]} ${y}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Fraction of the current month already gone — used to pace budget bars. */
export function monthProgress(key: string): number {
  const now = new Date();
  if (key !== monthKey(now)) return 1;
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() / days;
}

/* ------------------------------------------------------------- vocabulary */

export const TX_KINDS = ["expense", "income", "transfer", "saving"] as const;
export type TxKind = (typeof TX_KINDS)[number];

export const TX_KIND_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "saving", label: "Saving" },
  { value: "transfer", label: "Transfer" },
];

export const ACCOUNT_KIND_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank account" },
  { value: "card", label: "Card" },
  { value: "savings", label: "Savings" },
  { value: "other", label: "Other" },
];

export const CATEGORY_KIND_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

export const EVERY_OPTIONS = [
  { value: "month", label: "Every month" },
  { value: "week", label: "Every week" },
  { value: "year", label: "Every year" },
];

/**
 * Advance a recurring item to its next date, without the month-end trap: plain
 * date arithmetic turns 31 August into 1 October and silently skips September.
 * Two rules instead — a date sitting on the last day of its month stays on the
 * last day of the next one, which is how bills anchored to month-end behave, and
 * any other day is clamped so the 31st lands on the 30th or the 28th.
 */
export function nextDate(from: string, every: string): string {
  const d = new Date(`${from}T00:00:00Z`);
  if (every === "week") {
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }

  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const step = every === "year" ? 12 : 1;

  const lastOfThis = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(year, month + step, 1));
  const lastOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  const nextDay = day === lastOfThis ? lastOfTarget : Math.min(day, lastOfTarget);
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), nextDay))
    .toISOString()
    .slice(0, 10);
}

/** Palette used for categories, goals and accounts. */
export const SWATCHES = [
  "#d9a441", "#5fb88a", "#5b8fd6", "#de6b5e", "#a98bd6",
  "#4fb3b8", "#d6885b", "#8a909e",
];

export const DEFAULT_CATEGORIES: { name: string; kind: "expense" | "income"; color: string }[] = [
  { name: "Groceries", kind: "expense", color: "#5fb88a" },
  { name: "Eating out", kind: "expense", color: "#d6885b" },
  { name: "Transport", kind: "expense", color: "#5b8fd6" },
  { name: "Bills & utilities", kind: "expense", color: "#de6b5e" },
  { name: "Subscriptions", kind: "expense", color: "#a98bd6" },
  { name: "Health", kind: "expense", color: "#4fb3b8" },
  { name: "Shopping", kind: "expense", color: "#d9a441" },
  { name: "Fun", kind: "expense", color: "#a98bd6" },
  { name: "Learning", kind: "expense", color: "#5b8fd6" },
  { name: "Other", kind: "expense", color: "#8a909e" },
  { name: "Salary", kind: "income", color: "#5fb88a" },
  { name: "Freelance", kind: "income", color: "#d9a441" },
  { name: "Gift", kind: "income", color: "#a98bd6" },
];
