/**
 * A fiscal receipt, turned into an entry.
 *
 * Every receipt printed in Serbia since 2022 carries a QR that points at the tax
 * service's own copy of it. Ask that address for JSON and it answers with the shop, the
 * time, the total — and `journal`, which is the receipt as it was printed, forty columns
 * wide, every line with its count and its price. So the app does not need to read a
 * photograph, guess at letters, or keep the picture afterwards: the numbers are already
 * numbers, and the only thing stored is the same text the entry has always stored.
 *
 * Everything here is pure. The fetching lives in the action, because fetching is the
 * part that can be aimed somewhere it should not go — see `receiptToken` for the half of
 * that guard which belongs to this module.
 */

import { MAX_ITEMS, type TxItem } from "./items";

/** The one host this app will ever ask about a receipt. Not a prefix, not a suffix. */
const SUF_HOST = "suf.purs.gov.rs";

/**
 * A receipt's whole identity is in one query parameter, so the URL is rebuilt, never
 * forwarded. Around 900 characters on an ordinary receipt; the cap is generous enough
 * for the longest ones and small enough that nothing else fits through.
 */
const MAX_TOKEN = 4096;

/** Forty of each, exactly as the printer lays them down. */
const SECTION = "=".repeat(40);
const RULE = "-".repeat(40);

/** The most a shop trip can carry into one entry — the entry's own limit, not a new one. */
const MAX_LINES = MAX_ITEMS;

export type ScannedReceipt = {
  /** The shop, as it calls itself. Fills the title, and is editable like any other. */
  store: string;
  /** The day it was rung up in Belgrade, as `YYYY-MM-DD`. */
  boughtOn: string;
  /** What was actually paid, in dinars. */
  total: number;
  /** The lines, in the shape the entry already stores them in. */
  items: TxItem[];
  /**
   * `ПФР број рачуна` — the only thing that tells two receipts apart.
   *
   * Kept so that scanning the same slip twice can be answered with "you entered this on
   * the 12th" rather than with a second copy of the shop.
   */
  number: string;
  /**
   * Whether the lines add up to what was paid.
   *
   * When they do, the entry can let the list carry the amount, which is the whole point
   * of having a list. When they do not — a line left off a very long receipt, a discount
   * printed somewhere this does not read — the total stands and the list is only a note,
   * because a figure that looks like a receipt total and is not one is worse than none.
   */
  balanced: boolean;
  /** What the person should know before pressing save. Empty when there is nothing. */
  notes: string[];
};

export type ReceiptRead = { ok: true; receipt: ScannedReceipt } | { ok: false; error: string };

/**
 * The token out of a scanned address, or nothing.
 *
 * This is the security of the whole feature in one function, so it is written as an
 * allow-list and not as a check. Whatever was scanned is parsed as a URL, the host has
 * to be that one host exactly, and then the address is *thrown away* and rebuilt from
 * the single parameter that matters. Nothing else survives the trip: not a port, not a
 * path, not a second query parameter, not a fragment, not `user:password@`, not a host
 * that merely ends in the right letters.
 *
 * The reason for the paranoia is that the next thing that happens to this value is the
 * server making a request with it. A server that will fetch whatever it is handed is a
 * server that can be pointed at the machine it is running on, which is the one address
 * an attacker cannot reach and the app can.
 */
export function receiptToken(scanned: string): string | null {
  const text = String(scanned ?? "").trim();
  if (!text || text.length > MAX_TOKEN * 2) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  // Http as well as https, because rebuilding makes the scheme that arrived irrelevant —
  // what leaves here is always https. Anything else (`file:`, `data:`, `javascript:`) is
  // not a receipt.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname !== SUF_HOST) return null;
  if (url.username || url.password) return null;

  const token = url.searchParams.get("vl");
  if (!token || token.length > MAX_TOKEN) return null;
  // The payload is base64 with the usual url-safe substitutions. Anything outside that
  // alphabet is not a receipt token, whatever else it might be.
  if (!/^[A-Za-z0-9+/=_-]+$/.test(token)) return null;

  return token;
}

/** The address to ask, built from the token alone. */
export function receiptUrl(token: string): string {
  return `https://${SUF_HOST}/v/?vl=${encodeURIComponent(token)}`;
}

/**
 * What the tax service answered, read as a receipt.
 *
 * The shop, the total, the number and the time are taken from the structured half of the
 * answer, which is typed and needs no parsing. Only the lines come out of the printed
 * text, because only the lines are printed and not sent.
 */
export function readReceipt(payload: unknown): ReceiptRead {
  if (!payload || typeof payload !== "object") return { ok: false, error: "Račun nije stigao u očekivanom obliku." };
  const body = payload as Record<string, unknown>;

  const request = asRecord(body.invoiceRequest);
  const result = asRecord(body.invoiceResult);
  const journal = typeof body.journal === "string" ? body.journal : "";

  if (!request || !result || !journal) {
    return { ok: false, error: "Račun nije stigao u očekivanom obliku." };
  }

  /*
    Only an ordinary sale becomes an expense.

    A refund, a copy, a training slip and a proforma all render as a receipt and none of
    them is money leaving the account today. Turning one into an entry would be a silent
    wrong number in the ledger, so each is refused by name instead — the person can see
    what they scanned and decide, which is the one thing a guess cannot offer.
  */
  const invoiceType = Number(request.invoiceType);
  const transactionType = Number(request.transactionType);
  if (transactionType === 1) {
    return { ok: false, error: "Ovo je račun za refundaciju, ne kupovinu — unesi ga kao prihod." };
  }
  if (invoiceType === 1) return { ok: false, error: "Ovo je predračun, nije fiskalni račun." };
  if (invoiceType === 2) return { ok: false, error: "Ovo je kopija računa — skeniraj original." };
  if (invoiceType === 3) return { ok: false, error: "Ovo je probni račun, nije pravi." };

  const total = money(result.totalAmount);
  if (!(total > 0)) return { ok: false, error: "Račun nema iznos." };

  const { items, dropped } = journalItems(journal);
  const notes: string[] = [];
  if (dropped > 0) {
    notes.push(
      `Račun ima ${dropped} ${dropped === 1 ? "stavku" : "stavki"} više nego što jedan unos prima — nisu ušle u listu.`,
    );
  }

  const sum = items.reduce((acc, i) => acc + Math.round(i.qty * i.amount * 100), 0) / 100;
  /*
    A dinar of slack, and no more.

    Weighed goods are printed to three decimals and charged to two, so a long receipt can
    round a dinar away from the sum of its own lines. More than that is a line this did
    not read, and then the list has to stop pretending to be the total.
  */
  const balanced = items.length > 0 && dropped === 0 && Math.abs(sum - total) <= 1;
  if (items.length > 0 && !balanced && dropped === 0) {
    notes.push(`Stavke daju ${sum.toLocaleString("sr-RS")} a račun kaže ${total.toLocaleString("sr-RS")} — iznos ostaje sa računa.`);
  }
  if (items.length === 0) notes.push("Nijedna stavka nije pročitana — iznos i datum jesu.");

  return {
    ok: true,
    receipt: {
      store: shopName(request),
      boughtOn: receiptDay(journal, result.sdcTime),
      total,
      items,
      number: String(result.invoiceNumber ?? "").trim().slice(0, 64),
      balanced,
      notes,
    },
  };
}

/* ------------------------------------------------------------------ the printed half */

/**
 * The lines of the receipt, as items.
 *
 * The printer gives each line a name row and, under it, a row of three numbers: what one
 * costs, how many, what the line came to. The name can run over several rows when it is
 * long, so the numbers are what is looked for — a row that is nothing but three figures
 * ends an item, and everything above it since the last one was the name.
 */
export function journalItems(journal: string): { items: TxItem[]; dropped: number } {
  const body = section(journal, 1);
  if (!body) return { items: [], dropped: 0 };

  /*
    The payment summary sits under a rule in the same section, so only what is above it
    is an item — and the first line of that is the column heading, which is not one
    either. Trimmed before the heading is dropped: the section begins with the newline
    that ended the delimiter above it, and counting that as the heading would leave the
    heading itself to be read as the name of the first thing bought.
  */
  const [listing = ""] = body.split(RULE);
  const lines = listing.trim().split("\n").slice(1);

  const items: TxItem[] = [];
  let dropped = 0;
  let name = "";

  for (const line of lines) {
    const figures = /^\s*([\d.,]+)\s+([\d.,]+)\s+(-?[\d.,]+)\s*$/.exec(line);
    if (!figures) {
      name += line.trim() ? ` ${line.trim()}` : "";
      continue;
    }

    const each = serbian(figures[1]);
    const count = serbian(figures[2]);
    const lineTotal = serbian(figures[3]);
    const clean = itemName(name);
    name = "";

    if (!clean || lineTotal <= 0) continue;
    if (items.length >= MAX_LINES) {
      dropped++;
      continue;
    }

    /*
      A count that is a whole number is a count; anything else is a weight.

      The entry's list multiplies the price of one by how many, and it counts in whole
      things — which is right for four yoghurts and meaningless for 0,412 kg of peppers.
      So a weighed line is folded into a single line at what it actually cost, with the
      weight kept in the name where it reads as it did on the paper. The sum stays exact
      either way, and that is the point: a list whose total drifts from the receipt is a
      list nobody can use to check the receipt.
    */
    const whole = Number.isInteger(count) && count >= 1 && count <= 9999;
    const consistent = Math.abs(Math.round(count * each * 100) / 100 - lineTotal) <= 0.01;

    if (whole && consistent && each > 0) {
      items.push({ name: clean, qty: count, amount: each });
    } else {
      const measure = count > 0 && count !== 1 ? ` (${count.toLocaleString("sr-RS")})` : "";
      items.push({ name: `${clean}${measure}`.slice(0, 80), qty: 1, amount: lineTotal });
    }
  }

  return { items, dropped };
}

/**
 * A line's name, with the printer's marks taken off and nothing else.
 *
 * Two things at the end of a name belong to the receipt rather than to the thing: the
 * tax letter every line carries in brackets, and sometimes a unit. Both come off. What
 * does not come off is anything that might be part of the name — `24/KOM` on a case of
 * water is how the shop sells it, and a rule clever enough to strip that is a rule that
 * will one day strip a size or a flavour. The name is what he will read in the ledger and
 * search by later, so it errs towards leaving too much in.
 */
function itemName(raw: string): string {
  let name = raw.replace(/\s+/g, " ").trim();
  // The tax mark: one or two letters in brackets, right at the end.
  name = name.replace(/\s*\(\s*[\p{L}]{1,2}\s*\)\s*$/u, "");
  // A unit in its own brackets, if the printer put one there.
  name = name.replace(/\s*[([]\s*(kom\.?|kg|kgr|l|lit\.?|kut|por|m|pce|ko|fl|ком\.?|кг|кгр|л|кут|пор|м|ко|фл)\s*[)\]]\s*$/iu, "");
  return name.trim().slice(0, 80);
}

/** The n-th slab between the printer's double rules. */
function section(journal: string, index: number): string {
  const text = journal.replace(/\r\n/g, "\n");
  const parts = text.split(SECTION);
  return parts[index] ?? "";
}

/**
 * The day on the receipt, in Belgrade.
 *
 * `ПФР време` is taken first because it is the line the shop printed and the person is
 * holding: whatever the clock did that night, the paper says a day, and the entry should
 * agree with the paper. The signed timestamp is the fallback, converted rather than
 * sliced — it arrives in UTC, and after ten at night in Belgrade the UTC answer is still
 * yesterday.
 */
export function receiptDay(journal: string, sdcTime: unknown): string {
  const printed = /ПФР време:\s*(\d{2})\.(\d{2})\.(\d{4})\./.exec(journal.replace(/\r\n/g, "\n"));
  if (printed) return `${printed[3]}-${printed[2]}-${printed[1]}`;

  const stamp = new Date(String(sdcTime ?? ""));
  if (Number.isNaN(stamp.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(stamp);
}

/**
 * What to call the shop.
 *
 * The registered company, not the branch. The branch line is often the more colourful of
 * the two — `Lounge bar EPIC` against `ETER DOO` — and just as often a store code like
 * `NI148`, and a title that is sometimes a name and sometimes a code is worse than one
 * that is always a name. It is a text field; anyone who prefers the other can type it.
 */
function shopName(request: Record<string, unknown>): string {
  const company = String(request.businessName ?? "").replace(/\s+/g, " ").trim();
  if (company.length >= 3) return company.slice(0, 80);

  const location = String(request.locationName ?? "").replace(/\s+/g, " ").trim();
  return location.replace(/^\d+\s*-\s*/, "").slice(0, 80);
}

/* ------------------------------------------------------------------------- arithmetic */

/** `1.234,56` is a thousand two hundred and thirty-four dinars and fifty-six para. */
function serbian(raw: string): number {
  const [whole = "", fraction] = String(raw ?? "").split(",", 2);
  const n = Number(`${whole.replace(/\./g, "")}.${fraction ?? "0"}`);
  return Number.isFinite(n) ? n : 0;
}

function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
