/**
 * The things inside one entry.
 *
 * A shop trip is one movement of money and several things bought. The entry carries
 * the money; these carry what it was spent on — and because they are stored as plain
 * JSON on the row, everything that reads or writes them has to agree on the shape by
 * hand. That agreement lives here and nowhere else.
 *
 * `amount` is the line's total in the entry's own currency, not a unit price. It is the
 * figure printed beside the line on a receipt, which is what somebody copying a receipt
 * has in front of them — asking for a unit price instead would make them divide.
 */

export type TxItem = {
  name: string;
  /** How many. Informational: it does not multiply anything, `amount` is already the line. */
  qty: number;
  /** The line's total, in the entry's currency. */
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

/** What the lines add up to, in the entry's currency. */
export function itemsTotal(items: TxItem[]): number {
  return Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
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
