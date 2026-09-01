/**
 * An amount you can break across two lines.
 *
 * `Intl.NumberFormat` with `style: "currency"` joins the figure and its unit with a
 * NO-BREAK SPACE (U+00A0). In a sentence that is right. In a box it makes the whole
 * amount one unbreakable word, so the box's minimum width is the width of the entire
 * amount — and a box too narrow for it does not wrap, it *clips*. A figure loses its
 * currency and nothing anywhere says so.
 *
 * Which is what happened: `46.764.923 RSD` came out of a phone-width card as
 * `46.764.923` and a sliver of an R. Every formatter in the app that asks Intl for a
 * currency has to come through here, or half of them keep the bug — `formatMoney`
 * below did, on every currency but the euro, for the whole freelance side.
 */
export function breakable(text: string): string {
  return text.replace(/\u00a0/g, " ");
}

export function formatCurrency(value: number | null | undefined, currency = "EUR") {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return breakable(
    new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n),
  );
}

export function formatMoney(amount: number | null | undefined, currency = "EUR") {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  const locale = currency === "USD" ? "en-US" : currency === "RSD" ? "sr-RS" : "en-IE";
  try {
    return breakable(
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
      }).format(n),
    );
  } catch {
    return `${n} ${currency}`;
  }
}

/* ------------------------------------------------------------------ the clock
 *
 * A due date in Zevern is a wall clock, not an instant. A task set for 15:20 is
 * due at 15:20 — it does not become 17:20 because the reader sits two hours east
 * of UTC, and it does not become 13:20 if he answers mail from Lisbon.
 *
 * That distinction is where the bug lived. The browser posts exactly what was
 * typed, `2026-08-25T15:20`, with no offset on it; Postgres reads the naive text
 * in the session zone (UTC) and hands back `2026-08-25T15:20:00+00:00`. Both
 * strings already carry the answer in their first sixteen characters. The old
 * code threw them into `new Date()` and read the pieces back out with local
 * getters — which is precisely the step that added two hours.
 *
 * So we never parse. We read the characters.
 */
const WALL = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/;

/** `YYYY-MM-DD`, exactly as stored. Plain date columns pass through untouched. */
export function formatDate(value: string | null | undefined) {
  const m = WALL.exec(String(value ?? ""));
  return m ? m[1] : "—";
}

/**
 * The date, plus the time when one was actually set. Midnight is how a date-only
 * value reaches a `timestamptz` column, so it reads as no time rather than 00:00.
 */
export function formatDateTime(value: string | null | undefined) {
  const m = WALL.exec(String(value ?? ""));
  if (!m) return "—";
  if (!m[2] || (m[2] === "00" && m[3] === "00")) return m[1];
  return `${m[1]} ${m[2]}:${m[3]}`;
}

/**
 * The user's own calendar date. This one is deliberately local: "today" and
 * "overdue" are questions a person asks about their own day, and at 01:00 in
 * Belgrade the UTC answer is still yesterday.
 */
export function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isToday(value: string | null | undefined) {
  return !!value && value.slice(0, 10) === todayISO();
}

export function isOverdue(value: string | null | undefined) {
  return !!value && value.slice(0, 10) < todayISO();
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w`;
  return formatDate(value);
}

/**
 * The greeting in the topbar, from an hour of the day.
 *
 * A function of an hour rather than of `new Date()`, and that is the whole point: the
 * hour is read once on the server — where `APP_TIMEZONE` has already put the clock in
 * Belgrade — and handed down as a string. Read on both sides instead, it was a
 * hydration mismatch waiting for two moments: a browser in another zone, and the stroke
 * of noon or six, when the server renders "Good morning" and the client hydrates "Good
 * afternoon" over it. React then throws away the tree and redraws it, in the middle of
 * the frame the app is being looked at.
 */
export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
