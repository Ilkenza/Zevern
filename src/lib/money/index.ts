/**
 * Money module — shared vocabulary and pure helpers.
 * Base currency is RSD; EUR/USD are converted with a rate the user keeps in Settings.
 */

export const CURRENCIES = ["RSD", "EUR", "USD"] as const;

/** URL-safe value used when an expense deliberately has no category row to point at. */
export const UNCATEGORIZED_CATEGORY_ID = "uncategorized";
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

/**
 * "Jun" — or "Jun 2027" once it leaves the year of `relativeTo`. It sits on the month
 * arrows, so a step shows you where it lands before you take it.
 */
export function shortMonthLabel(key: string, relativeTo: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return key;
  const name = MONTH_NAMES[(m - 1 + 12) % 12].slice(0, 3);
  const [ry] = relativeTo.split("-").map(Number);
  return y === ry ? name : `${name} ${y}`;
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

/**
 * Days still to come in the month, today spent. Zero for any month but this one,
 * which is what stops "for the rest of the month" advice appearing on a month that
 * has no rest.
 */
export function daysLeftInMonth(key: string): number {
  const now = new Date();
  if (key !== monthKey(now)) return 0;
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(days - now.getDate(), 0);
}

/* ------------------------------------------------------------- vocabulary */

/**
 * Every kind an entry can be. `saving` earmarks money that is already sitting on an
 * account — it does not leave, it stops being spendable. `withdraw` is the way back:
 * the goal gives the money up and it is free on that account again.
 */
export const TX_KINDS = [
  "expense",
  "income",
  "transfer",
  "saving",
  "withdraw",
  "loan_out",
  "loan_in",
  "correction",
] as const;
export type TxKind = (typeof TX_KINDS)[number];

export function isTxKind(value: string): value is TxKind {
  return (TX_KINDS as readonly string[]).includes(value);
}

/** The two kinds that move money between an account and a goal. */
export function isGoalKind(kind: string): boolean {
  return kind === "saving" || kind === "withdraw";
}

/**
 * The kinds that move a goal being paid off rather than one being saved up.
 *
 * An expense clears it and an income reverses that, and neither reserves anything —
 * the money left the account when it was spent. Kept next to `isGoalKind` because the
 * pair is the whole rule: these two lists must never overlap, or an entry would count
 * on both sides of the same question.
 */
export function isPayingKind(kind: string): boolean {
  return kind === "expense" || kind === "income";
}

/**
 * The distance between what the app believes an account holds and what it actually
 * holds.
 *
 * Not spending and not earning — nothing happened in the world, the record was simply
 * incomplete. Every total in this app names the kinds it adds, so a correction stays
 * out of all of them by not being named; the only sum that has to know about it is the
 * account balance, which is the one thing it exists to move.
 */
export function isCorrection(kind: string): boolean {
  return kind === "correction";
}

/**
 * The two kinds that move money without earning or spending it.
 *
 * Named for the direction the cash went rather than for the story, because the story
 * is on the loan and the ledger only has to say whether money arrived or left. Two
 * words then cover all four movements: lending and repaying in one lump are both
 * `loan_out`, taking a loan and being repaid are both `loan_in`.
 *
 * An instalment is deliberately not one of these — it is an ordinary expense that
 * happens to carry a `loan_id`. A rate of 50.000 is 50.000 the month genuinely cannot
 * spend elsewhere, and a budget that cannot see it promises room that is not there.
 */
export function isLoanKind(kind: string): boolean {
  return kind === "loan_out" || kind === "loan_in";
}

/**
 * What the entry form offers when you are making a new one.
 *
 * Five, and five is the number the row of buttons was drawn for. Two loan kinds went in
 * and two goal kinds came out to make room, which is not a trade — it is a duplicate
 * being dropped.
 *
 * Putting money aside already has a better home: the form inside each goal's own card,
 * where the goal is chosen by opening it rather than found again in a second dropdown.
 * Offering the same act here as well meant a worse version of it sitting permanently in
 * front of everyone, including the people who have no goals at all.
 *
 * They stay in `TX_KIND_ALL` because an entry that already is one has to be able to say
 * so while it is being edited.
 */
export const TX_KIND_OPTIONS: { value: TxKind; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "loan_out", label: "Lent out" },
  { value: "loan_in", label: "Borrowed" },
];

/** Every kind there is — the two goal movements included. */
export const TX_KIND_ALL: { value: TxKind; label: string }[] = [
  ...TX_KIND_OPTIONS,
  { value: "saving", label: "Put aside" },
  { value: "withdraw", label: "Take out" },
  /*
    Never offered in the entry form. You do not sit down to log a correction the way
    you log a coffee — you notice that a balance is wrong while looking at the account,
    and you fix it there. It lives in this list only so an entry that already is one
    can name itself in the ledger.
  */
  { value: "correction", label: "Balance correction" },
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
export function nextDate(from: string, every: string, anchorDay?: number | null): string {
  const d = new Date(`${from}T00:00:00Z`);
  if (every === "week") {
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }

  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const step = every === "year" ? 12 : 1;

  const target = new Date(Date.UTC(year, month + step, 1));
  const lastOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  /*
    With an anchor there is nothing to infer: the rule knows which day it belongs to,
    and a day past the end of the target month clamps to the end of it. Anchor 31 is
    how a month-end rule is written, so it lands on 30 in April and 28 in February and
    comes back to 31 in March.

    Without one — a rule created before the anchor existed — fall back to the old
    guess. It reads month-end out of the date itself, which is why the 28th of
    February used to promote a rule to month-end for ever. The fallback is kept so
    nothing changes underneath a row that has not been backfilled, not because it is
    right.
  */
  const nextDay =
    anchorDay != null
      ? Math.min(anchorDay, lastOfTarget)
      : day === new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
        ? lastOfTarget
        : Math.min(day, lastOfTarget);

  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), nextDay))
    .toISOString()
    .slice(0, 10);
}

/**
 * The anchor a rule should carry, worked out from the date it starts on.
 *
 * A rule set up on the last day of a 30-day month means "the end of the month", not
 * "the 30th" — nobody picks 30 September and means 30 October rather than 31 October.
 * So the last day of any short month reads as 31, which is how month-end is written.
 * Weekly rules have no day of the month at all.
 */
export function anchorDayFor(startOn: string, every: string): number | null {
  if (every === "week") return null;
  const d = new Date(`${startOn}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDate();
  const lastOfMonth = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return day === lastOfMonth ? 31 : day;
}


/** Palette used for categories, goals and accounts. */
/**
 * The built-in palette, laid out as a warm-to-cool sweep so the picker reads as a
 * spectrum rather than a bag of colours. Every value is muted to roughly the same
 * lightness, which is what keeps a wall of category dots looking like one system
 * instead of a highlighter set — the eye should find the shape, not the loudest hue.
 */
/*
  Four are missing from this list on purpose.

  `#de6b5e`, `#5fb88a`, `#d9a441` and `#8a909e` are `--color-danger`, `--color-ok`,
  `--color-gold` and `--color-muted` exactly — the app's four state colours. They were
  in here, and the seeded categories duly took three of them: Bills & utilities was
  painted the same red that elsewhere means overspent, Groceries and Salary the same
  green that means income. Anything a screen can colour to mean a state must not also
  be available to mean a name.
*/
export const SWATCHES = [
  "#d6885b", "#c2b24a", "#8fb85f",
  "#4fb3b8", "#5b8fd6", "#7a86d6", "#a98bd6", "#c97fc0", "#d6759b",
  "#b08968", "#6b7185", "#c9c4bb",
];

/*
  The seeded set, and the six colours that had to change.

  Nothing draws a category's colour any more, so these are inert — but a seed that
  writes values the palette above refuses is a contradiction waiting for whoever adds a
  picker back. Three of them were state colours (Bills & utilities was danger, Groceries
  and Salary were ok, Shopping and Freelance were gold), and two pairs were duplicates
  of each other: Fun matched Subscriptions and Learning matched Transport, which is how
  ten categories managed to spend only eight colours.

  The ten expense colours are now distinct, and none of them is a state colour. The
  three income ones may repeat an expense colour: they are never listed together.
*/
export const DEFAULT_CATEGORIES: { name: string; kind: "expense" | "income"; color: string }[] = [
  { name: "Groceries", kind: "expense", color: "#8fb85f" },
  { name: "Eating out", kind: "expense", color: "#d6885b" },
  { name: "Transport", kind: "expense", color: "#5b8fd6" },
  { name: "Bills & utilities", kind: "expense", color: "#c97fc0" },
  { name: "Subscriptions", kind: "expense", color: "#a98bd6" },
  { name: "Health", kind: "expense", color: "#4fb3b8" },
  { name: "Shopping", kind: "expense", color: "#b08968" },
  { name: "Fun", kind: "expense", color: "#d6759b" },
  { name: "Learning", kind: "expense", color: "#7a86d6" },
  { name: "Other", kind: "expense", color: "#6b7185" },
  { name: "Salary", kind: "income", color: "#c2b24a" },
  { name: "Freelance", kind: "income", color: "#c9c4bb" },
  { name: "Gift", kind: "income", color: "#a98bd6" },
];

/* ------------------------------------------------------------- the month's net */

/**
 * What to say under the month's net figure, and how loudly.
 *
 * The figure is `income − spending − put aside`: a statement about one month's
 * movement, not about what you have. Those two got confused because the card used to
 * be called "Left over" and sat next to a balance — so a month with no salary entered
 * yet showed "Left over −670" beside "On accounts 149.503", and the app appeared to be
 * arguing with itself.
 *
 * The note is what settles it, and the two negative cases are genuinely different:
 *
 *  - Nothing was logged as income. The minus is the spending mirrored back, because
 *    the income column is empty. That is a bookkeeping fact, not a warning, and
 *    colouring it red cries wolf at someone who is paid on the 30th.
 *
 *    It says "logged" rather than "came in" on purpose. What an account opened with —
 *    the figure typed into Setup — is money you have, but it is not money that arrived
 *    this month, so it is not in this column. "Nothing came in" read as an argument
 *    with the balance sitting next to it.
 *  - Money came in and it still went negative. That is the real one, and it is red.
 */
export type NetNote = {
  text: string;
  tone: "danger" | "muted";
  /** True when the fix is in Setup rather than in this month. */
  setup?: boolean;
} | null;

/**
 * Why the month is negative, in one line.
 *
 * Zero income is two entirely different situations and this used to say the same thing
 * about both. Nothing on file anywhere is a gap in the setup and wants an action. Money
 * simply not in yet, on a profile that gets paid on the 10th, is what every month looks
 * like until the 10th — a fact, not a finding, and phrasing it as a warning teaches
 * people to stop reading the line that will one day matter.
 *
 * `onFile` covers standing rules as well as bookings, so writing down the salary
 * silences the setup prompt immediately rather than a month later.
 */
export function monthNetNote(net: number, income: number, onFile = true): NetNote {
  if (net >= 0) return null;
  if (income <= 0 && !onFile)
    return { text: "Nothing on file as income yet", tone: "muted", setup: true };
  if (income <= 0) return { text: "Nothing in yet this month", tone: "muted" };
  return { text: "More went out than came in", tone: "danger" };
}

/**
 * What a wallet count means in ledger terms.
 *
 * Kept out of the action because this is the whole of the thinking and none of the
 * plumbing, and because the two cases it has to get right are easy to get wrong in
 * opposite directions: the count is typed in the account's own currency while the
 * balance is carried in dinars, so a EUR cash tin counted at 40 is 40 EUR against a
 * dinar figure — convert the wrong way and the app books a five-figure loss.
 *
 * `null` is "close enough": under a dinar apart is rounding, and rounding does not
 * deserve a row in the ledger.
 */
export type CashDifference = { kind: "expense" | "income"; amount: number } | null;
