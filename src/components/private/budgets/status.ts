import type { BudgetLine } from "@/lib/types";

export type Status = "over" | "ahead" | "ontrack" | "untracked" | "unset";

/**
 * Where a category stands, in one word.
 *
 * "Ahead" is the state a plain percentage hides: 60% of the grocery budget spent is
 * fine on the 20th and a warning on the 8th. Pace is what separates those two, which
 * is why the comparison is against how much of the month has gone rather than against
 * the limit alone.
 *
 * The fifteen-point tolerance is what keeps the word from flickering. Without it a
 * category sitting exactly on its pace changes its verdict every time a coffee is
 * entered, and a status that changes that easily is one nobody reads.
 */
export function statusOf(line: BudgetLine, pace: number): Status {
  if (line.limit <= 0) return line.spent > 0 ? "untracked" : "unset";
  if (line.spent > line.limit) return "over";
  if (line.spent / line.limit > pace + 0.15) return "ahead";
  return "ontrack";
}

export const STATUS_LABEL: Record<Status, string> = {
  over: "Over",
  ahead: "Ahead of pace",
  ontrack: "On track",
  untracked: "No limit",
  unset: "Unused",
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
  /** Percent of the month gone. */
  pacePct: number;
  /** Where the month lands at today's rate — the month itself once it is finished. */
  projected: number;
  /** How far past the limit that projection goes. Negative means slack. */
  overshoot: number;
  left: number;
};

export function totalsOf(lines: BudgetLine[], pace: number, isCurrentMonth: boolean): Totals {
  const limit = lines.reduce((s, l) => s + l.limit, 0);
  const spent = lines.reduce((s, l) => s + l.spent, 0);
  // A finished month has already landed wherever it landed; only a running one is
  // being projected forward.
  const projected = pace > 0 && isCurrentMonth ? Math.round(spent / pace) : spent;

  return {
    limit,
    spent,
    used: limit > 0 ? Math.round((spent / limit) * 100) : 0,
    pacePct: Math.round(pace * 100),
    projected,
    overshoot: projected - limit,
    left: Math.max(limit - spent, 0),
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
 * So: offer it when there is no limit yet, and otherwise only when the limit is far
 * enough from what the month actually costs to be worth reconsidering.
 */
const SUGGEST_TOLERANCE = 0.15;

export function shouldSuggest(typical: number, value: string): boolean {
  if (!(typical > 0)) return false;

  const current = Number(value);
  if (!value || !Number.isFinite(current) || current <= 0) return true;

  return Math.abs(current - typical) / typical > SUGGEST_TOLERANCE;
}
