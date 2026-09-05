/**
 * A bank statement, read off the page.
 *
 * The bank sends a PDF and nothing else — no CSV, no export, an email once a month —
 * so the choice is between typing a month of entries by hand and reading the page the
 * bank drew. This reads the page.
 *
 * Nothing here knows about PDFs. It takes text with coordinates, which is all any PDF
 * reader hands back, and turns it into rows. That keeps the hard part — deciding which
 * scattered fragments are one line, and which column each fragment sits in — testable
 * without a PDF, and it is the part that actually goes wrong.
 *
 * The safety property is the last function in this file. A statement carries a running
 * balance beside every entry, so the file states its own arithmetic: opening balance,
 * minus each payment, plus each receipt, equals the closing balance. If the parse is
 * wrong that chain breaks, and a chain that breaks refuses the import. There is no
 * reading of this file that is silently wrong — either the numbers reconcile to the
 * dinar or nothing is offered.
 */

/** One fragment of text as a PDF reader reports it: what it says and where it sits. */
export type TextItem = { text: string; x: number; y: number };

/** The columns this statement is made of, in the bank's own words. */
export type Column =
  | "received"
  | "executed"
  | "card"
  | "description"
  | "refAmount"
  | "origAmount"
  | "paidOut"
  | "paidIn"
  | "balance";

/**
 * How each column is recognised, by a word from its heading.
 *
 * Headings wrap — "Datum prijema/ Datum transakcije" is two lines and "Iznos u ref.
 * valuti" is three fragments — so a column is found by one distinctive word rather than
 * by its whole label, and the word is matched without diacritics because a PDF may or
 * may not carry them.
 */
const HEADINGS: { column: Column; word: string }[] = [
  { column: "received", word: "prijema" },
  { column: "executed", word: "izvrsenja" },
  { column: "card", word: "kartice" },
  { column: "description", word: "promene" },
  { column: "refAmount", word: "ref." },
  { column: "origAmount", word: "orig." },
  { column: "paidOut", word: "isplata" },
  { column: "paidIn", word: "uplata" },
  { column: "balance", word: "stanje" },
];

/** Two fragments are on the same line when their baselines are this close, in points. */
const LINE_TOLERANCE = 3;

/** `01.08.2026` — the only date shape a row can start with. */
const DATE = /^(\d{2})\.(\d{2})\.(\d{4})\.?$/;

/** Serbian without its diacritics, lowercased — how headings are compared. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("č", "c")
    .replaceAll("ć", "c")
    .replaceAll("š", "s")
    .replaceAll("ž", "z")
    .replaceAll("đ", "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * A number as this statement writes it, in dinars.
 *
 * `157,895.85` — comma for thousands, dot for the decimal. That is the English
 * convention rather than the Serbian one, on a Serbian bank's statement, and it is the
 * single most dangerous thing in this file: read with the local convention, `26,000.00`
 * becomes twenty-six dinars, and a screen full of plausible small numbers is a screen
 * nobody checks. The balance chain catches it, which is why the balance chain exists.
 *
 * Returns null for anything that is not a number, so a heading or a stray word can never
 * be mistaken for a nought.
 */
export function parseAmount(raw: string): number | null {
  const text = raw.trim();
  if (!/^-?[\d,]*\d(\.\d+)?$/.test(text)) return null;
  const value = Number(text.replaceAll(",", ""));
  return Number.isFinite(value) ? value : null;
}

/** `01.08.2026` to `2026-08-01`, or null when it is not a date. */
export function parseDate(raw: string): string | null {
  const m = DATE.exec(raw.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = Number(d);
  const month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo}-${d}`;
}

export type Line = { y: number; items: TextItem[] };

/**
 * Fragments grouped into lines, top to bottom, each read left to right.
 *
 * A PDF has no lines — it has glyphs at coordinates — so a line is a decision, and the
 * tolerance is the whole of it. Too tight and a row whose date sits half a point higher
 * than its amount becomes two rows; too loose and two rows of a dense table become one.
 * Three points is under a third of a line's height at this size and well over the drift
 * within one row.
 */
export function toLines(items: TextItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - item.y) <= LINE_TOLERANCE) {
      line.items.push(item);
      continue;
    }
    lines.push({ y: item.y, items: [item] });
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

export type Layout = Partial<Record<Column, number>>;

/**
 * Where each column starts, learned from the headings the bank printed.
 *
 * Read from the page rather than written down here, because column positions are the
 * one thing about a statement that is certain to move: a longer account name, a
 * different template, a bank redesign. A parser holding hard-coded x positions is a
 * parser that will one day put the balance in the description and reconcile anyway,
 * because both columns still hold numbers.
 */
export function findLayout(lines: Line[]): Layout {
  /*
    The heading line is the one with the most heading words on it, not the first line
    holding any.

    The first version took the first match of each word anywhere on the page, and the
    page defeated it twice over. `Prethodno stanje:` sits above the table and contains
    "stanje", so the balance column was learned from the header banner and every balance
    landed in the wrong column. And a heading is rarely its own word — the column called
    `description` is printed `Opis promene`, `card` is `Broj kartice` — so matching had
    to become "contains", which is exactly what made the banner match.

    Scoring the lines settles both. The banner scores one; the heading line scores six.
  */
  const score = (line: Line) => {
    const flat = line.items.map((i) => fold(i.text)).join(" ");
    return HEADINGS.filter((h) => flat.includes(h.word)).length;
  };

  let best = -1;
  let at = -1;
  for (const [i, line] of lines.entries()) {
    const n = score(line);
    if (n > best) {
      best = n;
      at = i;
    }
  }
  // Six of the nine on one line is a heading band; anything less is a page that has no
  // table on it, and guessing from it would be worse than saying so.
  if (at < 0 || best < 6) return {};

  const layout: Layout = {};
  /*
    The heading line and the one under it.

    Four of these headings wrap — `Datum prijema/ Datum transakcije`, `Datum izvršenja`,
    `Iznos u ref. valuti`, `Iznos u orig. valuti` — and the wrapped half carries the word
    that identifies the column. So the band is two lines, and the second is read only for
    columns the first did not settle.
  */
  for (const line of [lines[at], lines[at + 1]]) {
    if (!line) continue;
    for (const item of line.items) {
      const word = fold(item.text);
      for (const heading of HEADINGS) {
        if (layout[heading.column] !== undefined) continue;
        if (word.includes(heading.word)) layout[heading.column] = item.x;
      }
    }
  }
  return layout;
}

/**
 * Which column a fragment belongs to.
 *
 * Numbers are right-aligned under their headings and text is left-aligned, so a
 * fragment's own left edge does not say which column it is in. What does is the nearest
 * column *start* at or before it, with the numeric columns claimed by proximity to the
 * heading's own right edge — which for these headings means the closest start wins.
 */
function columnAt(x: number, layout: Layout): Column | null {
  let best: Column | null = null;
  let bestDistance = Infinity;
  for (const [column, start] of Object.entries(layout) as [Column, number][]) {
    const distance = Math.abs(x - start);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = column;
    }
  }
  return best;
}

export type StatementRow = {
  /** The date the money actually moved, which is the order the balance follows. */
  on: string;
  /** The date on the receipt, kept only when it differs from the one above. */
  transactedOn: string | null;
  description: string;
  /** Dinars out. Nought on a receipt. */
  paidOut: number;
  /** Dinars in. Nought on a payment. */
  paidIn: number;
  /** The bank's running balance after this entry — what the chain is checked against. */
  balance: number;
};

export type ParsedStatement = {
  /** The balance the statement opens on. */
  opening: number;
  /** The balance it closes on, as printed at the end. */
  closing: number | null;
  rows: StatementRow[];
};

const OPENING = "prethodno stanje";
const CLOSING = "stanje";

/**
 * The whole statement, from every page's fragments in page order.
 *
 * Pages are concatenated by the caller rather than read one at a time, because the
 * balance chain runs through the document and a page on its own cannot check itself.
 * Repeated headings on later pages are simply lines that hold no date, and are skipped
 * by the same rule that skips every other line that is not an entry.
 */
export function parseStatement(items: TextItem[]): ParsedStatement | { error: string } {
  const lines = toLines(items);
  const layout = findLayout(lines);

  const missing = HEADINGS.filter((h) => layout[h.column] === undefined).map((h) => h.word);
  if (missing.length > 0) {
    return {
      error:
        `This does not look like a Raiffeisen statement — the columns ` +
        `${missing.join(", ")} are not on the page.`,
    };
  }

  let opening: number | null = null;
  let closing: number | null = null;
  const rows: StatementRow[] = [];

  for (const line of lines) {
    const text = line.items.map((i) => i.text).join(" ");
    const flat = fold(text);

    /*
      The opening balance, from the first page that states one.

      Every page repeats it, and every page states the same figure — the balance the
      statement opens on, not the balance that page opens on. Taking the first and
      ignoring the rest is right for that reason, not merely convenient.
    */
    if (opening === null && flat.includes(OPENING)) {
      const numbers = line.items.map((i) => parseAmount(i.text)).filter((n): n is number => n !== null);
      if (numbers.length > 0) opening = numbers[numbers.length - 1];
      continue;
    }

    // Cells, by column.
    const cells = new Map<Column, string[]>();
    for (const item of line.items) {
      const column = columnAt(item.x, layout);
      if (!column) continue;
      const list = cells.get(column);
      if (list) list.push(item.text);
      else cells.set(column, [item.text]);
    }

    const cell = (column: Column) => (cells.get(column) ?? []).join(" ").trim();

    const executed = parseDate(cell("executed"));
    const received = parseDate(cell("received"));
    const balance = parseAmount(cell("balance"));

    /*
      An entry is a line carrying a date and a balance. Everything else on the page — the
      heading band, the page number, the repeated column titles, the footer — fails that
      and is skipped without needing a rule of its own.
    */
    if (executed && balance !== null) {
      rows.push({
        on: executed,
        transactedOn: received && received !== executed ? received : null,
        description: cell("description").replace(/\s+/g, " ").trim(),
        paidOut: parseAmount(cell("paidOut")) ?? 0,
        paidIn: parseAmount(cell("paidIn")) ?? 0,
        balance,
      });
      continue;
    }

    /*
      A line with no date but with words under the description column is the rest of a
      description that did not fit. It belongs to the entry above it.

      Whether this bank ever wraps a description is not settled — the statement in hand
      gives every line its own date. So this is written for the case rather than against
      it: a wrapped line that is dropped loses half a description quietly, and one that
      is treated as an entry would break the chain loudly. Neither is acceptable, and
      joining it is correct either way.
    */
    const tail = cell("description");
    if (
      !executed &&
      balance === null &&
      tail !== "" &&
      rows.length > 0 &&
      parseAmount(tail) === null &&
      !flat.startsWith(CLOSING)
    ) {
      const last = rows[rows.length - 1];
      last.description = `${last.description} ${tail}`.replace(/\s+/g, " ").trim();
      continue;
    }

    /*
      The closing balance, from the last line that states one — `STANJE` on its own,
      after the entries. Checked as `startsWith` because `Prethodno stanje` contains the
      same word and is handled above.
    */
    if (flat.startsWith(CLOSING) && !flat.includes(OPENING)) {
      const numbers = line.items.map((i) => parseAmount(i.text)).filter((n): n is number => n !== null);
      if (numbers.length > 0) closing = numbers[numbers.length - 1];
    }
  }

  if (opening === null) {
    return { error: "The opening balance (Prethodno stanje) is not on this statement." };
  }
  if (rows.length === 0) {
    return { error: "No entries were found on this statement." };
  }

  return { opening, closing, rows };
}

export type Reconciliation =
  | { ok: true; out: number; in: number; closing: number }
  | { ok: false; error: string };

/** A cent, in dinars — the tolerance for the chain, and only for binary rounding. */
const EPSILON = 0.005;

/**
 * The statement checked against its own arithmetic.
 *
 * This is the reason the import can be trusted at all. A PDF has no structure, so a
 * parser reading one is guessing — well, but guessing — and a wrong guess produces rows
 * that look entirely reasonable. What a wrong guess cannot do is reconcile: a misread
 * decimal, a column read as the wrong column, a row dropped at a page break, a heading
 * taken for an entry — every one of those breaks the running balance, and this refuses
 * the file and names the row where it broke.
 *
 * So the promise the screen can make is not "this parser is careful". It is "these
 * numbers add up to the balance your bank printed, or you were shown nothing".
 */
export function reconcile(statement: ParsedStatement): Reconciliation {
  let running = statement.opening;
  let out = 0;
  let paidIn = 0;

  for (const [i, row] of statement.rows.entries()) {
    running = running - row.paidOut + row.paidIn;
    out += row.paidOut;
    paidIn += row.paidIn;
    if (Math.abs(running - row.balance) > EPSILON) {
      return {
        ok: false,
        error:
          `The running balance stops matching at entry ${i + 1} (${row.on}, ` +
          `${row.description || "no description"}). The statement says ` +
          `${row.balance.toFixed(2)}, the entries above it add up to ${running.toFixed(2)}. ` +
          `Nothing was brought in — a statement that does not add up has been read wrongly.`,
      };
    }
  }

  if (statement.closing !== null && Math.abs(running - statement.closing) > EPSILON) {
    return {
      ok: false,
      error:
        `The entries add up to ${running.toFixed(2)} but the statement closes on ` +
        `${statement.closing.toFixed(2)}. Some entries are missing. Nothing was brought in.`,
    };
  }

  return { ok: true, out, in: paidIn, closing: running };
}

/**
 * What makes one bank entry that entry, so the same statement twice adds nothing.
 *
 * The running balance is in the key on purpose. Date, amount and description are not
 * enough — two coffees at the same place on the same day are one row twice over, and
 * dropping the second would silently lose a real payment. The balance after each is
 * different by construction, so it is the one field that tells identical twins apart.
 */
export function bankRef(row: StatementRow): string {
  const amount = row.paidOut > 0 ? -row.paidOut : row.paidIn;
  return `rba:${row.on}:${amount.toFixed(2)}:${row.balance.toFixed(2)}`;
}
