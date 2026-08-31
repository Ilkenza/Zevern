/**
 * The date filter, as a handful of named spans rather than two empty pickers.
 *
 * Two `dd. mm. yyyy.` boxes and an arrow is the control a database gives you. It asks
 * for six digits before it will do anything, it cannot be read at a glance once it is
 * set, and the question people actually arrive with — "what did the last week look
 * like" — takes two calendar visits to ask. A named span answers it in one click and
 * says what it is in words afterwards.
 *
 * The pickers are not gone: `custom` brings them back, for the one case a preset cannot
 * cover. They are the exception now instead of the whole control.
 *
 * Pure on purpose, and given `today` rather than reading the clock: a span that depends
 * on when it is asked is a span that cannot be tested, and this is the kind of
 * arithmetic — month ends, leap days, quarter starts — that is wrong in exactly the
 * cases nobody clicks through by hand.
 */

export type RangeKey = "month" | "d7" | "d30" | "m3" | "m6" | "ytd" | "all" | "custom";

/**
 * The spans offered, in the order they are offered.
 *
 * Three rolling windows, then the calendar year, then everything. The labels say which
 * kind each one is — "Last 30 days" is not "This month" and the difference matters on
 * the 2nd — because a filter whose meaning you have to guess is a filter you stop
 * trusting the first time it surprises you.
 */
export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "d7", label: "Last 7 days" },
  { value: "d30", label: "Last 30 days" },
  { value: "m3", label: "Last 3 months" },
  { value: "m6", label: "Last 6 months" },
  { value: "ytd", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Pick dates…" },
];

/** Whether a string off the address bar is a span this app knows. */
export function isRangeKey(value: string | undefined): value is RangeKey {
  return RANGE_OPTIONS.some((o) => o.value === value);
}

/** Midday UTC, so a shift can never land on the wrong side of a daylight-saving edge. */
function at(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** `n` days before `day`, as a day. Exported for the screens that build their own
 *  spans out of a window they already have. */
export function backDays(day: string, n: number): string {
  const d = at(day);
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
}

/**
 * Whole months back, clamped to the end of a short month.
 *
 * Three months back from 31 May is 28 or 29 February, not 3 March. `setUTCMonth` rolls
 * over on its own, which is the behaviour that turns a "last 3 months" filter into a
 * "last 3 months and a bit" filter four times a year.
 */
function backMonths(day: string, n: number): string {
  const d = at(day);
  const target = d.getUTCMonth() - n;
  const wanted = new Date(Date.UTC(d.getUTCFullYear(), target + 1, 0, 12));
  d.setUTCDate(Math.min(d.getUTCDate(), wanted.getUTCDate()));
  d.setUTCMonth(target);
  return iso(d);
}

/**
 * What a span means, as two days.
 *
 * Both ends are inclusive, and both are empty strings when the span does not bound that
 * end — which is what the callers already treat as "no limit". `custom` returns nothing
 * because the answer is whatever is in the two pickers; the caller keeps those.
 *
 * The rolling windows end today and count today as one of their days: "last 7 days" is
 * today and the six behind it, not today and seven behind it. Off by one here is the
 * difference between a week and a week and a day, every time.
 */
export function rangeFor(key: RangeKey, today: string): { from: string; to: string } {
  /*
    A calendar month, and the one span here that is normally answered elsewhere: the
    screen browses months by their own key, so it never asks this. Answered anyway,
    with the month `today` falls in, because a function with a hole in it is a function
    somebody eventually falls through.
  */
  if (key === "month") {
    const first = `${today.slice(0, 7)}-01`;
    const d = at(first);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
    return { from: first, to: iso(last) };
  }
  if (key === "d7") return { from: backDays(today, 6), to: today };
  if (key === "d30") return { from: backDays(today, 29), to: today };
  if (key === "m3") return { from: backMonths(today, 3), to: today };
  if (key === "m6") return { from: backMonths(today, 6), to: today };
  if (key === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: "", to: "" };
}
