import type { BudgetLine } from "@/lib/types";

export type Status = "over" | "ahead" | "ontrack" | "untracked" | "unset";

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
  if (line.limit <= 0) return line.spent > 0 ? "untracked" : "unset";
  if (line.spent > line.limit) return "over";
  if (line.spent / line.limit > expectedBy(line, pace) / line.limit + 0.15) return "ahead";
  return "ontrack";
}

export const STATUS_LABEL: Record<Status, string> = {
  over: "Over",
  ahead: "Ahead of pace",
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
  const spent = limited.reduce((s, l) => s + l.spent, 0);
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
};

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

  let worst: { line: BudgetLine; gap: number } | null = null;
  for (const line of lines) {
    if (line.limit <= 0) continue;
    const gap = line.spent - expectedBy(line, pace);
    if (gap <= 0) continue;
    if (!worst || gap > worst.gap) worst = { line, gap };
  }
  if (!worst) return null;

  const room = Math.max(worst.line.limit - worst.line.spent, 0);
  return {
    category: worst.line.category.name,
    gap: Math.round(worst.gap),
    room: Math.round(room),
    limit: worst.line.limit,
    perWeek: Math.round((room / daysLeft) * 7),
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
