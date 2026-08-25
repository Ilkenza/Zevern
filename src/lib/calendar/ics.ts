/**
 * iCalendar (RFC 5545) serialiser — the smallest one that is actually correct.
 *
 * A calendar subscription is parsed by software nobody here controls: Google fetches
 * it on a server, Apple on a phone, and neither reports what it disliked. So the two
 * rules that quietly break feeds are enforced here rather than left to the caller —
 * every text value is escaped, and every line is folded at 75 octets without ever
 * cutting a UTF-8 sequence in half. A dinar sign or a Serbian name in a rule's title
 * is two or three octets, so folding by character count is exactly how a feed ends up
 * with a mojibake title in one client and a parse error in another.
 *
 * Only what the feed needs is modelled: whole-day events with one alarm. That keeps
 * the surface small enough to reason about, and there is no dependency to add.
 */

/** RFC 5545 §3.1: a content line is at most 75 octets before folding. */
const MAX_OCTETS = 75;

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/**
 * A TEXT value, escaped. Backslash first — do it in any other order and the escapes
 * inserted for commas and semicolons get escaped again.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * One content line, folded. Continuations begin with a single space, which counts
 * against the 75 — so every line after the first carries one octet less of payload.
 *
 * The backing off at the end of each slice is the part that matters: a continuation
 * byte (0b10xxxxxx) can never start a line, so the cut moves back to the lead byte
 * of the character it landed inside.
 */
function foldLine(line: string): string {
  const bytes = ENCODER.encode(line);
  if (bytes.length <= MAX_OCTETS) return line;

  const parts: string[] = [];
  let start = 0;
  let limit = MAX_OCTETS;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    if (end < bytes.length) {
      while (end > start && (bytes[end] & 0xc0) === 0x80) end--;
      // A single character wider than the whole limit cannot happen in UTF-8, but a
      // slice of length zero would spin here forever, so refuse to make one.
      if (end === start) end = Math.min(start + limit, bytes.length);
    }
    parts.push(DECODER.decode(bytes.subarray(start, end)));
    start = end;
    limit = MAX_OCTETS - 1;
  }

  return parts.join("\r\n ");
}

/** "2026-09-01" → "20260901", the DATE form used by an all-day DTSTART. */
export function icsDate(plain: string): string {
  return plain.slice(0, 10).replace(/-/g, "");
}

/** A UTC timestamp in the DATE-TIME form DTSTAMP wants: "20260825T101112Z". */
export function icsStamp(at: Date): string {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * DTEND on an all-day event is exclusive: a thing happening on the 1st ends on the
 * 2nd. Leave it out and some clients render a zero-length event they then hide.
 */
function dayAfter(plain: string): string {
  const d = new Date(`${plain.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type IcsAlarm = {
  /** An RFC 5545 duration relative to the start, e.g. "-PT9H". */
  trigger: string;
  description: string;
};

export type IcsEvent = {
  /** Stable across fetches, or the subscriber gets a duplicate every refresh. */
  uid: string;
  stamp: Date;
  /** The single day this lands on, "YYYY-MM-DD". */
  date: string;
  summary: string;
  description?: string;
  alarm?: IcsAlarm;
};

export type IcsCalendar = {
  prodId: string;
  name: string;
  description?: string;
  /** How often a subscriber should come back, as a duration, e.g. "PT6H". */
  refresh?: string;
  events: IcsEvent[];
};

function alarmLines(alarm: IcsAlarm): string[] {
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(alarm.description)}`,
    `TRIGGER;RELATED=START:${alarm.trigger}`,
    "END:VALARM",
  ];
}

function eventLines(event: IcsEvent): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${icsStamp(event.stamp)}`,
    `DTSTART;VALUE=DATE:${icsDate(event.date)}`,
    `DTEND;VALUE=DATE:${icsDate(dayAfter(event.date))}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  // A bill is not an appointment: it should not make the day look busy to anyone
  // reading free/busy, and it is not something that can be cancelled by replying.
  lines.push("TRANSP:TRANSPARENT", "CLASS:PRIVATE", "SEQUENCE:0");
  if (event.alarm) lines.push(...alarmLines(event.alarm));
  lines.push("END:VEVENT");
  return lines;
}

/** The whole document, CRLF-terminated, ready to serve as text/calendar. */
export function buildCalendar(cal: IcsCalendar): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${escapeText(cal.prodId)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // NAME/DESCRIPTION are the standard (RFC 7986) spelling; the X-WR- pair is what
    // Google and Apple actually read. Both, or the calendar arrives called by its URL.
    `NAME:${escapeText(cal.name)}`,
    `X-WR-CALNAME:${escapeText(cal.name)}`,
  ];
  if (cal.description) {
    lines.push(
      `DESCRIPTION:${escapeText(cal.description)}`,
      `X-WR-CALDESC:${escapeText(cal.description)}`,
    );
  }
  if (cal.refresh) {
    lines.push(
      `REFRESH-INTERVAL;VALUE=DURATION:${cal.refresh}`,
      `X-PUBLISHED-TTL:${cal.refresh}`,
    );
  }

  for (const event of cal.events) lines.push(...eventLines(event));
  lines.push("END:VCALENDAR");

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
