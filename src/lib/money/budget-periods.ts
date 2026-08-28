/**
 * Which window of a budget you are in.
 *
 * A budget's clock is three facts: a unit, how many of them, and the day it started
 * from. Everything else — "Aug 1 – Aug 31", "every second Monday", "the fortnight you
 * are in right now" — falls out of walking that clock forward from the anchor until it
 * reaches the day being asked about.
 *
 * Anchored rather than calendar-aligned, and that is the whole point. A monthly budget
 * anchored to the 15th runs the 15th to the 14th, because that is when the money
 * arrives; one anchored to the 1st runs the calendar month. Aligning every monthly
 * budget to the 1st would be simpler and would be wrong for anyone not paid on it.
 *
 * No database in here, so it is tested directly — the same arrangement as
 * `occurrences.ts`, and for the same reason: date arithmetic is where the bugs live,
 * and they are invisible until the month with 31 days.
 */

export type BudgetPeriod = "custom" | "day" | "week" | "month" | "year";

/** The clock, and nothing else — whatever else a budget carries is irrelevant here. */
export type BudgetClock = {
  period: BudgetPeriod;
  /** How many units to a window. `2` with `week` is a fortnight. */
  period_count: number;
  /** ISO date. The day the first window opens, and what every later one is measured from. */
  starts_on: string;
  /** ISO date. Only a custom budget has one; it is the last day of its single window. */
  ends_on: string | null;
};

/** A window, inclusive at both ends, and where it sits in the run. */
export type BudgetWindow = {
  from: string;
  to: string;
  /** 0 for the first window, 1 for the next, and so on. */
  index: number;
  /** True once a custom budget's only window is behind us. */
  ended: boolean;
};

const DAY_MS = 86_400_000;

function parse(iso: string): Date {
  // UTC throughout: these are wall-clock dates with no zone, and building them in local
  // time is how a date drifts a day either side of midnight.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Months, with the end of the month clamped rather than spilled.
 *
 * A budget anchored to the 31st has to land on the 30th in April and the 28th in
 * February. JavaScript's own answer is to roll into the next month — the 31st of April
 * becomes the 1st of May — which walks the anchor forward a day every short month until
 * a budget that started on the 31st is running from the 3rd.
 */
function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const lastOfTarget = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + months, Math.min(d, lastOfTarget)));
}

/** How many whole months lie between two dates, counting by the day of the month. */
function monthsBetween(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  // The day of the month decides whether the last one is whole. Compared against the
  // anchor *clamped into the target month*, so a 31st anchor in a 30-day month counts
  // the 30th as having completed it rather than being one day short forever.
  if (months > 0) {
    const stepped = addMonths(from, months);
    if (to < stepped) months -= 1;
  }
  return months;
}

/**
 * The window of `clock` that contains `on`.
 *
 * Before the budget has started, the first window is returned — a budget you set up for
 * next month should show you next month, not an invented window behind it. After a
 * custom budget has finished, its one window is returned with `ended` set, because "it
 * is over" is a thing the screen has to be able to say.
 */
export function budgetWindow(clock: BudgetClock, on: string): BudgetWindow {
  const start = parse(clock.starts_on);
  const today = parse(on);

  if (clock.period === "custom") {
    const end = clock.ends_on ? parse(clock.ends_on) : start;
    return { from: iso(start), to: iso(end), index: 0, ended: today > end };
  }

  const count = Math.max(1, Math.floor(clock.period_count) || 1);

  if (clock.period === "day" || clock.period === "week") {
    const span = count * (clock.period === "week" ? 7 : 1);
    const elapsed = Math.floor((today.getTime() - start.getTime()) / DAY_MS);
    const index = elapsed < 0 ? 0 : Math.floor(elapsed / span);
    return windowAt(clock, index);
  }

  const step = count * (clock.period === "year" ? 12 : 1);
  const elapsed = monthsBetween(start, today);
  const index = elapsed < 0 ? 0 : Math.floor(elapsed / step);
  return windowAt(clock, index);
}

/**
 * The nth window, measured from the anchor at both ends.
 *
 * Both ends from the anchor is the whole of it. Ending a window a step on from its own
 * *clamped* start looks equivalent and is not: a budget anchored to the 31st has its
 * February window start on the 28th, and a step on from the 28th is 27 March — while
 * the next window, measured from the anchor, starts on the 31st. The 28th, 29th and
 * 30th of March then belong to no window at all, and money spent on those days is money
 * no budget can see.
 */
function windowAt(clock: BudgetClock, index: number): BudgetWindow {
  const start = parse(clock.starts_on);
  const count = Math.max(1, Math.floor(clock.period_count) || 1);

  if (clock.period === "day" || clock.period === "week") {
    const span = count * (clock.period === "week" ? 7 : 1);
    return {
      from: iso(addDays(start, index * span)),
      to: iso(addDays(start, (index + 1) * span - 1)),
      index,
      ended: false,
    };
  }

  const step = count * (clock.period === "year" ? 12 : 1);
  return {
    from: iso(addMonths(start, index * step)),
    to: iso(addDays(addMonths(start, (index + 1) * step), -1)),
    index,
    ended: false,
  };
}

/** The window `offset` steps away from the one containing `on` — for walking back through history. */
export function shiftBudgetWindow(clock: BudgetClock, on: string, offset: number): BudgetWindow {
  if (clock.period === "custom" || offset === 0) return budgetWindow(clock, on);
  return windowAt(clock, Math.max(0, budgetWindow(clock, on).index + offset));
}

/**
 * How far through the window `on` is, as a fraction.
 *
 * This is what a budget is judged against: spending 60% of the money is fine on the
 * 20th and not on the 3rd. Counted in whole days and inclusive of today, because a day
 * you are part-way through is a day you can still spend in.
 */
export function windowProgress(window: BudgetWindow, on: string): number {
  const from = parse(window.from);
  const to = parse(window.to);
  const today = parse(on);
  const total = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (total <= 0) return 1;
  const gone = Math.round((today.getTime() - from.getTime()) / DAY_MS) + 1;
  return Math.min(1, Math.max(0, gone / total));
}

/** Whole days left in the window, today included. `0` once it is behind you. */
export function daysLeftInWindow(window: BudgetWindow, on: string): number {
  const to = parse(window.to);
  const today = parse(on);
  return Math.max(0, Math.round((to.getTime() - today.getTime()) / DAY_MS) + 1);
}

/** "every month", "every 2 weeks", "fixed dates" — how the clock reads in a sentence. */
export function clockLabel(clock: BudgetClock): string {
  if (clock.period === "custom") return "fixed dates";
  const n = Math.max(1, Math.floor(clock.period_count) || 1);
  return n === 1 ? `every ${clock.period}` : `every ${n} ${clock.period}s`;
}
