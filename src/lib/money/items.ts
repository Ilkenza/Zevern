/**
 * The things inside one entry.
 *
 * A shop trip is one movement of money and several things bought. The entry carries
 * the money; these carry what it was spent on — and because they are stored as plain
 * JSON on the row, everything that reads or writes them has to agree on the shape by
 * hand. That agreement lives here and nowhere else.
 *
 * `amount` is the price of ONE, in the entry's own currency, and `qty` multiplies it.
 *
 * It used to be the line's total, with `qty` carried alongside as a note that multiplied
 * nothing — defensible while every figure was copied off a printed receipt, where the
 * line total is what is in front of you.
 *
 * The shopping list ended that. `money_items.price` is what one of a thing costs, and
 * picking one off the list drops that figure straight into this box. Set the count to 2
 * and the old rule read those 119 dinars as the total for both — so the row said `59,5
 * each`, the entry was short by 119, and nothing on the screen was wrong-looking enough
 * to notice. A number that arrives meaning one thing and is read meaning another is the
 * exact shape of bug this app can least afford.
 *
 * Checked before changing it: of the 21 item lines on this account, the 5 with a count
 * above one all carry `amount: 0`. No stored line has both a count and a price, so no
 * existing figure changes meaning — the rule could be corrected rather than migrated.
 */

export type TxItem = {
  name: string;
  /** How many of it. Multiplies `amount`. */
  qty: number;
  /** What ONE costs, in the entry's currency. The line comes to `qty × amount`. */
  amount: number;
};

/** Enough for a weekly shop and then some. Past this it is a spreadsheet, not an entry. */
export const MAX_ITEMS = 60;
const MAX_NAME = 80;

/** One number, cleaned: no NaN, no Infinity, no negatives, two decimals at most. */
function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Whatever arrived, turned into items — or an empty list.
 *
 * This runs on data that has been through a form, a JSON round trip and a database
 * column, so it trusts none of it. A row without a name is dropped rather than kept as
 * a blank line: an unnamed item is the composer row nobody filled in, and keeping it
 * would put an empty line in every receipt in the app.
 */
export function parseItems(raw: unknown): TxItem[] {
  let data: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];

  const out: TxItem[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = String(row.name ?? "").trim().slice(0, MAX_NAME);
    if (!name) continue;
    const qty = Math.min(Math.max(Math.round(money(row.qty)) || 1, 1), 9999);
    out.push({ name, qty, amount: money(row.amount) });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/** What one line comes to: what one costs, times how many. */
export function lineTotal(item: TxItem): number {
  return Math.round(item.qty * item.amount * 100) / 100;
}

/** What the lines add up to, in the entry's currency. */
export function itemsTotal(items: TxItem[]): number {
  return Math.round(items.reduce((sum, i) => sum + lineTotal(i), 0) * 100) / 100;
}

/**
 * True when the list can stand in for the entry's amount.
 *
 * Every line has to carry a figure. One priced line among five unpriced ones sums to
 * something that looks like a total and is not one — worse than no total at all, since
 * nothing on the screen would say which of the two it is.
 */
export function itemsArePriced(items: TxItem[]): boolean {
  return items.length > 0 && items.every((i) => i.amount > 0);
}
