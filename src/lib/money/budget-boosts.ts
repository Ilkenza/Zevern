/**
 * How much extra room a window gets because something one-off happened inside it.
 *
 * A month with a holiday in it is not the same kind of month as the eleven around it.
 * Forcing them to share one number means either the ordinary months are too generous or
 * the holiday month is reported as a failure — and reporting a month as a failure when
 * you knew in advance it would cost more is how a budget screen stops being read.
 *
 * The whole question this answers is: **does the trip fall inside this window at all**.
 * Not "is the trip running right now", which is the same question asked of the clock
 * instead of the calendar, and is subtly broken — see below.
 */

/** A window in the sense the budgets use: two wall-clock dates, both inclusive. */
export type Span = { from: string; to: string };

export type Boost = Span & {
  /** Dinars this grants to every window it falls in. */
  amount: number;
  /** The name to print in the line explaining where the extra came from. */
  source: string;
};

export type Boosted = {
  /** Dinars to add to the window's own amount. */
  extra: number;
  /** Which budgets granted it, in the order they start. */
  sources: string[];
};

/** Whether two inclusive date spans share at least one day. */
export function overlaps(a: Span, b: Span): boolean {
  return a.from <= b.to && a.to >= b.from;
}

/**
 * What `window` is allowed on top of its own amount.
 *
 * Two decisions are baked in here, both deliberate, both with a cost worth naming.
 *
 * **The answer never changes.** A boost is a fact about a window — the trip either falls
 * in these dates or it does not — so it is settled the moment the dates are typed. The
 * tempting alternative, adding the amount only while the trip is actually running, breaks
 * quietly in both directions: the day after you get home every month the trip touched
 * loses its extra room, so a month that was inside its limit yesterday is an overspend
 * today, and a September you are only a week into is suddenly over with three weeks left
 * to go. Nothing was spent to cause it. That is the one failure a budget screen must not
 * have, because there is no entry to look at and nothing to undo.
 *
 * **The full amount goes to each window the trip touches**, rather than being split
 * across them by day. Splitting sounds fairer and is worse: a day is not the unit any of
 * this is spent in — eating out in this ledger is two bills a month, so a fifth of a
 * boost buys nothing at all — and it makes the figure on the card differ from the figure
 * that was typed, for a reason nobody can reconstruct later. The price is that a trip
 * crossing the 1st grants its amount twice, once to each month. That is real, it is
 * visible on both cards, and it happens a few times a year.
 */
export function boostFor(window: Span, boosts: readonly Boost[]): Boosted {
  const hits = boosts.filter((boost) => overlaps(window, boost));
  if (hits.length === 0) return { extra: 0, sources: [] };

  // Earliest first, so the sentence under the card reads in the order things happen.
  const ordered = [...hits].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

  return {
    extra: ordered.reduce((sum, boost) => sum + (Number(boost.amount) || 0), 0),
    sources: ordered.map((boost) => boost.source),
  };
}

/**
 * The sentence under a raised budget, or null when there is nothing to explain.
 *
 * A limit that changed and does not say why is worse than a limit that was broken: in
 * three months you will not remember granting it, and you will read 25.000 on a budget
 * you know you set to 20.000 and trust neither number.
 */
/**
 * The money a hand-kept budget already paid for, and the room the limit gained for it.
 *
 * One sentence because it is one fact with two halves, and the card is unreadable without
 * both. The figure above counts the trip's spending, because it is real spending on this
 * category. The limit beside it has grown by the same amount, because the trip's own
 * ceiling already allowed it and no dinar should have to fit under two lids. Read on its
 * own, either half looks like an error: a category suddenly enormous, or a limit that
 * moved for no reason.
 *
 * "Paid by", not "of which": the money is not a slice of this budget that went elsewhere,
 * it is the same money answering to a plan that had already set it aside.
 */
export function filedNote(
  filed: number,
  where: readonly string[],
  fmt: (value: number) => string,
): string | null {
  if (filed <= 0 || where.length === 0) return null;
  const who =
    where.length === 1
      ? where[0]
      : `${where.slice(0, -1).join(", ")} and ${where[where.length - 1]}`;
  return `${fmt(filed)} covered by ${who}`;
}

export function boostNote(
  boosted: Boosted,
  fmt: (value: number) => string,
): string | null {
  if (boosted.extra <= 0 || boosted.sources.length === 0) return null;
  const who =
    boosted.sources.length === 1
      ? boosted.sources[0]
      : `${boosted.sources.slice(0, -1).join(", ")} and ${boosted.sources[boosted.sources.length - 1]}`;
  return `+${fmt(boosted.extra)} — ${who}`;
}



