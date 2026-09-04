import type { BudgetLine } from "@/lib/types";

export type Status = "over" | "ahead" | "ontrack" | "untracked" | "unset";

/**
 * The figure a budget is judged against.
 *
 * `spent` is what the category cost and is a report; `counted` is what the budget that
 * owns it actually counts, and they differ by the entries deliberately filed into a
 * budget of their own — a holiday's lunches are real spending on Eating out and are not
 * an overspend against the monthly Eating out budget. Falling back to `spent` keeps a
 * category no budget owns judged against itself, exactly as before.
 */
export function judged(line: BudgetLine): number {
  return line.counted ?? line.spent;
}

/**
 * How much of a category's month should have been spent by now.
 *
 * The naive answer — limit times the fraction of days gone — is wrong for any category
 * carrying a bill, and wrong in the direction that does the most damage. Rent is not
 * 1/31st spent on the 1st; it is entirely spent on the 1st. A budget that spreads it
 * across the days reports a catastrophe every month for a week and then quietly
 * corrects itself, which teaches people to stop reading the one figure that is
 * supposed to warn them.
 *
 * So the month is split. Charges with dates count from their dates: whatever has
 * already booked is expected in full the moment it books. What is left of the limit
 * after every dated charge in the month is taken out is the part that genuinely
 * accrues with the days, and only that part is multiplied by the calendar.
 *
 * With no recurring charges at all — `fixedPaid` and `fixedDue` both zero — this
 * collapses to exactly the old behaviour, which is the point: the model gets more
 * careful only where there is something to be careful about.
 */
export function expectedBy(line: BudgetLine, pace: number): number {
  if (line.limit <= 0) return 0;
  const paid = Math.max(line.fixedPaid ?? 0, 0);
  const dated = paid + Math.max(line.fixedDue ?? 0, 0);
  const daily = Math.max(line.limit - dated, 0);
  return Math.min(paid + daily * pace, line.limit);
}

/**
 * Where a category stands, in one word.
 *
 * "Ahead" is the state a plain percentage hides: 60% of the grocery budget spent is
 * fine on the 20th and a warning on the 8th. Pace is what separates those two, which
 * is why the comparison is against where the month should be rather than against the
 * limit alone — and `expectedBy` is what makes "should be" mean something on a
 * category whose month is mostly one bill.
 *
 * The fifteen-point tolerance is what keeps the word from flickering. Without it a
 * category sitting exactly on its pace changes its verdict every time a coffee is
 * entered, and a status that changes that easily is one nobody reads.
 */
export function statusOf(line: BudgetLine, pace: number): Status {
  const used = judged(line);
  if (line.limit <= 0) return used > 0 ? "untracked" : "unset";
  if (used > line.limit) return "over";
  if (used / line.limit > expectedBy(line, pace) / line.limit + 0.15) return "ahead";
  return "ontrack";
}

export const STATUS_LABEL: Record<Status, string> = {
  over: "Over",
  // Same condition, same word as the plans screen: money leaving faster than the days.
  ahead: "Spending fast",
  ontrack: "On track",
  untracked: "No limit",
  unset: "No activity",
};

/** The one word that decides every colour on a row, so they can never disagree. */
export const STATUS_TONE: Record<Status, string> = {
  over: "var(--color-danger)",
  ahead: "var(--color-gold)",
  ontrack: "var(--color-ok)",
  untracked: "var(--color-muted)",
  unset: "var(--color-faint)",
};

/** Digits only — a limit is whole dinars, and this makes an unparseable one impossible. */
export function clean(value: string): string {
  return value.replace(/\D/g, "").slice(0, 12);
}

export type Totals = {
  limit: number;
  spent: number;
  /** Percent of the total limit spent. Uncapped: 120 is a real and useful answer. */
  used: number;
  /**
   * Percent of the budget that is due to have gone by now — dated charges in full,
   * the rest spread over the days. This is what `used` is judged against and where
   * the tick sits, not the calendar.
   */
  pacePct: number;
  /** Percent of the month's days gone. Only ever shown as the explanation. */
  calendarPct: number;
  /** Where the month lands at today's rate — the month itself once it is finished. */
  projected: number;
  /** How far past the limit that projection goes. Negative means slack. */
  overshoot: number;
  left: number;
};

export function totalsOf(lines: BudgetLine[], pace: number, isCurrentMonth: boolean): Totals {
  // A percentage can only compare like with like. Spending from a category with no
  // limit has no denominator, so it stays visible in the separate summary callout but
  // must not make the categories that do have limits look further spent than they are.
  const limited = lines.filter((line) => line.limit > 0);
  const limit = limited.reduce((s, l) => s + l.limit, 0);
  const spent = limited.reduce((s, l) => s + judged(l), 0);
  const fixedPaid = limited.reduce((s, l) => s + Math.max(l.fixedPaid ?? 0, 0), 0);
  const fixedDue = limited.reduce((s, l) => s + Math.max(l.fixedDue ?? 0, 0), 0);

  /*
    Only the everyday part is extrapolated. The bills already paid are a fact and the
    bills still to come are a date, so both go in at face value and neither is divided
    by how much of the month has gone.

    This is the whole fix. Rent of 60.000 against 100.000 of limits, on the 3rd, used
    to project 639.000 and announce half a million over; it now projects 60.000 plus
    three days of groceries stretched to a month, and says nothing, because there is
    nothing to say yet.

    A finished month has already landed wherever it landed; only a running one is being
    projected forward at all.
  */
  const everyday = Math.max(spent - fixedPaid, 0);
  const projected =
    pace > 0 && isCurrentMonth ? Math.round(fixedPaid + fixedDue + everyday / pace) : spent;

  const expected = limited.reduce((s, l) => s + expectedBy(l, pace), 0);

  return {
    limit,
    spent,
    used: limit > 0 ? Math.round((spent / limit) * 100) : 0,
    pacePct: limit > 0 ? Math.round((expected / limit) * 100) : Math.round(pace * 100),
    calendarPct: Math.round(pace * 100),
    projected,
    overshoot: projected - limit,
    left: Math.max(limit - spent, 0),
  };
}

/** The one category worth naming when the month is heading over, and what closes it. */
export type Remedy = {
  category: string;
  /** How far past where it should be by now this category has got. */
  gap: number;
  /** What is left of its limit. */
  room: number;
  /**
   * That category's limit, so a caller can decide whether the gap is worth a sentence.
   * Two hundred dinars past pace on the 3rd is arithmetic, not a warning, and a screen
   * that says so every morning teaches you to stop reading it.
   */
  limit: number;
  /** Holding to this much a week keeps it inside. Zero when there is no room left. */
  perWeek: number;
  /**
   * How many more purchases of this category's usual size fit in what is left — set
   * only where a week is the wrong unit, and `null` where it is the right one.
   *
   * A weekly rate assumes the money leaves in a stream. On a category that is two shops
   * a month it leaves in lumps, and "1,4k a week" is advice about a stream that does
   * not exist: there is no week in which spending 1,4k on Shopping is a thing you do.
   * "Two more shops like your usual" is the same arithmetic in a unit the person
   * actually acts in.
   */
  buys: number | null;
  /** What a purchase in this category has cost on average this period. */
  typicalBuy: number;
};

/**
 * How much of the period must have passed before pace is worth reporting.
 *
 * On the 4th of a 30-day month the calendar expects a category to be an eighth spent,
 * so one ordinary purchase clears the bar and the screen announces an overspend. That
 * is not a warning, it is arithmetic about a small number, and a screen that cries wolf
 * on the 4th of every month is one nobody reads on the 25th.
 */
const ENOUGH_MONTH = 0.25;

/**
 * How many purchases a category needs before its pace means anything.
 *
 * With one you cannot tell "bought the monthly thing" from "spending fast", and the app
 * has no business guessing which. Three is the smallest number that can show a habit
 * rather than an event.
 */
const ENOUGH_PURCHASES = 3;

/**
 * Below this many purchases a month, the money leaves in lumps rather than in a stream,
 * and a weekly rate stops describing anything the person does.
 */
const LUMPY_BELOW = 8;

/**
 * The screen already says the month is heading over. This says what to do about it.
 *
 * A verdict without a lever is a diagnosis without a prescription — true, useful once,
 * and then the same sentence every day until the month ends. The pattern is borrowed
 * from `ShortfallActions` on the upcoming screen, which had the same problem and
 * solved it by naming a move rather than a number.
 *
 * The category picked is the one furthest past where it should be, not the one
 * spending most: a category three times its size can be perfectly on pace, and telling
 * someone to cut the biggest number is advice that ignores the plan they already made.
 *
 * The weekly figure is what is left of that category's limit spread over the days that
 * are left. It is deliberately a rate rather than a total — "12.000 for the rest of
 * August" is a number nobody can act on on a Tuesday.
 */
export function remedyFor(lines: BudgetLine[], pace: number, daysLeft: number): Remedy | null {
  if (daysLeft <= 0) return null;
  /*
    Too early in the month to have an opinion.

    This was the whole of a real complaint: a Shopping budget of 8.000 with one purchase
    of 2.649 on the 2nd produced "Shopping is 1,6k past its pace — 1,4k a week keeps it
    inside" on the 4th. Every figure in that sentence was correct and the sentence was
    worthless: two thirds of the limit were still there, and the only evidence of a
    habit was a single unnamed buy.
  */
  if (pace < ENOUGH_MONTH) return null;

  let worst: { line: BudgetLine; gap: number } | null = null;
  for (const line of lines) {
    if (line.limit <= 0) continue;
    /* One purchase is an event; a pace is a habit, and you cannot see one in a sample
       of one. Bills are exempt: a dated charge is known, not extrapolated. */
    if (line.entries < ENOUGH_PURCHASES && (line.fixedPaid ?? 0) <= 0) continue;
    const gap = judged(line) - expectedBy(line, pace);
    if (gap <= 0) continue;
    if (!worst || gap > worst.gap) worst = { line, gap };
  }
  if (!worst) return null;

  const line = worst.line;
  const room = Math.max(line.limit - judged(line), 0);
  /* Purchases so far, carried forward at the same rate, to say what a whole month of
     this category looks like — the question is its shape, not its size. */
  const perMonth = pace > 0 ? line.entries / pace : line.entries;
  const typicalBuy = line.entries > 0 ? judged(line) / line.entries : 0;
  const lumpy = perMonth < LUMPY_BELOW && typicalBuy > 0;

  return {
    category: line.category.name,
    gap: Math.round(worst.gap),
    room: Math.round(room),
    limit: line.limit,
    perWeek: Math.round((room / daysLeft) * 7),
    buys: lumpy ? Math.floor(room / typicalBuy) : null,
    typicalBuy: Math.round(typicalBuy),
  };
}

/**
 * Whether the "a normal month is…" chip is worth showing.
 *
 * It used to appear whenever the typical figure differed from the field at all, which
 * meant it appeared on nearly every card — including ones whose limit was already
 * within a few hundred dinars of it. A suggestion that shows up next to a correct
 * answer is not advice, it is noise, and it teaches you to stop reading the chip on
 * the one card where it matters.
 *
 * A blank field can be intentional: some categories are meant to stay flexible. Never
 * turn history into pressure to limit everything. Once a person has chosen a limit,
 * offer the historical figure only when their number is far enough away to be useful.
 */
const SUGGEST_TOLERANCE = 0.15;

export function shouldSuggest(typical: number, value: string): boolean {
  if (!(typical > 0)) return false;

  const current = Number(value);
  if (!value || !Number.isFinite(current) || current <= 0) return false;

  return Math.abs(current - typical) / typical > SUGGEST_TOLERANCE;
}
