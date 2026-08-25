import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { occurrencesFor } from "@/lib/money/occurrences";
import { buildCalendar, type IcsEvent } from "@/lib/calendar/ics";
import { formatAmount } from "@/lib/money";
import type { RecurringRow } from "@/lib/types";

/**
 * The private calendar feed.
 *
 * This is the only address in the app that answers without a session. It is fetched
 * by Google's servers, by a phone's calendar daemon, by nothing that has a cookie —
 * so the token in the path is the whole credential, and it is a capability URL of the
 * same shape as Google's own "secret address in iCal format".
 *
 * Three things follow from that, and they are the entire security posture here:
 *
 *  1. The token is read from the path and passed straight to `calendar_feed`, which
 *     is SECURITY DEFINER and does the lookup. Nothing else in this file decides who
 *     the caller is, so there is no second code path to get wrong.
 *  2. Every failure — malformed token, unknown token, database down, missing env —
 *     is the same bare 404. A different answer for "no such token" than for "wrong
 *     shape" is an oracle: it turns guessing into a search with feedback.
 *  3. Nothing is logged that contains the token, and nothing is cached anywhere but
 *     the subscriber's own client.
 *
 * Route Handlers are not cached by default, so there is no segment config to add —
 * the response says `no-store` and that is the only cache instruction that matters.
 */

/** How far ahead the feed looks. Far enough for a quarterly bill, short enough to read. */
const DAYS_AHEAD = 120;

/** Roughly what Google's own fetch interval is, and often enough for a daily reminder. */
const REFRESH = "PT6H";

/**
 * 15:00 the day before, not midnight. A whole-day event triggers its alarm relative to
 * 00:00 on the day, so `-P1D` fires in the middle of the night before — which is the
 * one moment the reminder cannot be acted on. Nine hours earlier than the start is the
 * afternoon before, while a bank is still open.
 */
const ALARM_TRIGGER = "-PT9H";

const PRODID = "-//Zevern//Upcoming//EN";

/**
 * The token as it is generated: base64url from 32 random bytes. Checking the shape
 * before the round trip costs nothing and keeps a scanner hammering the path from
 * reaching the database at all. The function refuses anything under 24 characters
 * itself, so this is a filter, never the check.
 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{24,200}$/;

/** The only failure this endpoint has. No body, no header, nothing to compare. */
function notFound(): Response {
  return new Response(null, { status: 404 });
}

/* --------------------------------------------------------------- feed shape */

/**
 * What `calendar_feed` returns. It hands back rows rather than dates on purpose: the
 * walk from a rule to the days it falls due already exists in `occurrencesFor`, and a
 * second implementation in SQL is how the calendar and the screen start disagreeing.
 */
type FeedRule = {
  id: string;
  name: string;
  kind: string;
  amount: number | string;
  currency: string;
  variable: boolean;
  every: string;
  next_on: string;
  active: boolean;
  ends_on: string | null;
  installments_total: number | null;
  installments_done: number | null;
  goal_id: string | null;
  created_at: string;
  category_name: string | null;
  /** The day of the month the rule is anchored to — the feed must walk the same
      dates the app does, or a subscribed calendar quietly disagrees with it. */
  anchor_day: number | null;
};

type FeedPlanned = {
  id: string;
  name: string;
  kind: string;
  amount: number | string;
  currency: string;
  due_on: string;
  note: string | null;
  settled_at: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Rows out of a jsonb payload, or an empty list. A malformed feed is an empty one. */
function rowsOf<T>(value: unknown, key: string): T[] {
  if (!isRecord(value)) return [];
  const list = value[key];
  return Array.isArray(list) ? (list as T[]) : [];
}

/**
 * A feed row in the shape `occurrencesFor` reads.
 *
 * The function returns no foreign keys and no owner — the feed has no use for them and
 * they are not the anonymous caller's business — so the columns that only exist to
 * satisfy the row type are filled with something inert. `occurrencesFor` touches none
 * of them: it reads the dates, the interval, the instalments and the end date.
 */
function asRecurringRow(rule: FeedRule): RecurringRow {
  return {
    id: rule.id,
    name: rule.name,
    kind: rule.kind,
    amount: Number(rule.amount) || 0,
    currency: rule.currency,
    variable: Boolean(rule.variable),
    every: rule.every,
    next_on: rule.next_on,
    active: Boolean(rule.active),
    ends_on: rule.ends_on,
    installments_total: rule.installments_total,
    installments_done: rule.installments_done ?? 0,
    goal_id: rule.goal_id,
    created_at: rule.created_at,
    anchor_day: rule.anchor_day ?? null,
    user_id: "",
    account_id: null,
    category_id: null,
    category: rule.category_name ? { name: rule.category_name, color: null } : null,
    account: null,
    goal: null,
  };
}

/* ------------------------------------------------------------------- wording */

const EVERY_LABEL: Record<string, string> = {
  week: "Repeats every week.",
  month: "Repeats every month.",
  year: "Repeats every year.",
};

/**
 * What the event is called in a month view, where the title may be all that is read.
 * The amount is part of the title for that reason — a row saying only "Hosting" is a
 * reminder that something is happening, not a reminder of what it costs.
 */
function summaryFor(
  name: string,
  kind: string,
  amount: number,
  currency: string,
  variable: boolean,
): string {
  if (variable || !(amount > 0)) return `${name} — amount varies`;
  const money = formatAmount(amount, currency);
  return kind === "income" ? `${name} — ${money} in` : `${name} — ${money}`;
}

function describe(lines: (string | null)[]): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

/* ---------------------------------------------------------------------- dates */

function addDays(from: string, days: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ----------------------------------------------------------------------- GET */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!TOKEN_SHAPE.test(token ?? "")) return notFound();

  let payload: unknown;
  try {
    // The anon key, deliberately: `calendar_feed` is SECURITY DEFINER and granted to
    // anon, so it is the only thing this client can usefully reach. No cookies, no
    // session, nothing to persist — a session here would be a second way in.
    const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
    // `unauthorized` and a broken connection are the same answer to the caller. The
    // message goes to the server log, where the token is not, because it is not in it.
    if (error) {
      if (error.message !== "unauthorized") console.error("calendar feed:", error.message);
      return notFound();
    }
    payload = data;
  } catch (cause) {
    console.error("calendar feed:", cause);
    return notFound();
  }

  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDays(today, DAYS_AHEAD);
  const stamp = new Date();
  const events: IcsEvent[] = [];

  for (const rule of rowsOf<FeedRule>(payload, "rules")) {
    if (!rule?.id || !PLAIN_DATE.test(String(rule.next_on ?? ""))) continue;

    const amount = Number(rule.amount) || 0;
    const row = asRecurringRow(rule);
    const left =
      rule.installments_total != null
        ? Math.max(rule.installments_total - (rule.installments_done ?? 0), 0)
        : null;

    const summary = summaryFor(rule.name, rule.kind, amount, rule.currency, rule.variable);
    const description = describe([
      EVERY_LABEL[rule.every] ?? "Repeats.",
      rule.goal_id ? "Goes into a goal rather than paying a bill." : rule.category_name,
      left != null ? `${left} of ${rule.installments_total} payments left.` : null,
      rule.variable ? "The amount changes — enter it when it comes in." : null,
      "From your Zevern register.",
    ]);

    for (const occurrence of occurrencesFor(row, amount, rule.variable, horizon)) {
      // A rule whose date has already passed is waiting to be booked in the app; the
      // calendar's job is the days still ahead, so the backlog is left out.
      if (occurrence.on < today) continue;
      events.push({
        uid: `recurring-${rule.id}-${occurrence.on}@zevern`,
        stamp,
        date: occurrence.on,
        summary,
        description,
        alarm: { trigger: ALARM_TRIGGER, description: summary },
      });
    }
  }

  for (const item of rowsOf<FeedPlanned>(payload, "planned")) {
    if (!item?.id || item.settled_at != null) continue;
    const due = String(item.due_on ?? "");
    if (!PLAIN_DATE.test(due) || due < today || due > horizon) continue;

    const amount = Number(item.amount) || 0;
    const summary = summaryFor(item.name, item.kind, amount, item.currency, false);
    events.push({
      uid: `planned-${item.id}@zevern`,
      stamp,
      date: due,
      summary,
      description: describe([
        "A one-off you planned — it happens once and then it is done.",
        item.note,
        "From your Zevern register.",
      ]),
      alarm: { trigger: ALARM_TRIGGER, description: summary },
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid));

  const body = buildCalendar({
    prodId: PRODID,
    name: "Zevern — upcoming",
    description: `What falls due over the next ${DAYS_AHEAD} days: everything that repeats, and every one-off you have planned.`,
    refresh: REFRESH,
    events,
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      // `inline` so a calendar client renders it; the filename is what a browser saves
      // it as when someone opens the address by hand instead of subscribing.
      "content-disposition": 'inline; filename="zevern-upcoming.ics"',
      // Private in the HTTP sense as well as the ordinary one: no proxy, no CDN and no
      // shared cache may keep a copy, and the subscriber refetches rather than reusing.
      "cache-control": "private, no-store, max-age=0, must-revalidate",
      // If the address ever ends up somewhere a crawler can see it, it stops there.
      "x-robots-tag": "noindex, nofollow, noarchive",
      vary: "Accept-Encoding",
    },
  });
}

/**
 * Several calendar clients probe with HEAD before they will subscribe, and a route
 * that only exports GET answers those with 405 — which reads, to the client, as an
 * address that does not work. The body is discarded for a HEAD response, so this only
 * ever costs the one query.
 */
export async function HEAD(request: Request, context: { params: Promise<{ token: string }> }) {
  return GET(request, context);
}
