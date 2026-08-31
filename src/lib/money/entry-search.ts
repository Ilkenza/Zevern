/**
 * Narrowing and ordering a list of entries, without a database.
 *
 * A year of one category is a few dozen rows, all of them already in hand — so searching
 * it is a filter over an array rather than a round trip, and the answer arrives as you
 * type. The rules live here rather than in the panel because they are the part worth
 * being sure about: a search that quietly misses a match is worse than no search, and
 * nobody notices it happening.
 */

export type SearchableEntry = {
  id: string;
  occurred_on: string;
  occurred_at?: string | null;
  amount_rsd: number | string | null;
  title?: string | null;
  note?: string | null;
  account?: { name: string } | null;
  category?: { name: string } | null;
  created_at?: string;
};

/**
 * What the list is ordered by. Which end it starts at is the other half, kept apart.
 *
 * It was four values — `newest`, `oldest`, `largest`, `smallest` — which is two questions
 * folded into one word, and it made the menu twice as long as the number of things it can
 * actually sort by. Two fields and a direction says the same in half the vocabulary, and
 * it is the pair every other list in this app already holds.
 */
export type EntrySort = "date" | "size";

/** Which end of the chosen order the list starts at. `asc` is the order as it is named. */
export type SortWay = "asc" | "desc";

/**
 * The two orders, in the words the screens print, from both ends.
 *
 * Beside the type rather than inside one of the two toolbars that offer them: a second
 * copy is how the ledger and a category's year end up disagreeing about what "largest"
 * is called.
 */
export const ENTRY_SORTS: { value: EntrySort; label: string; reverse: string }[] = [
  { value: "date", label: "Newest", reverse: "Oldest" },
  { value: "size", label: "Largest", reverse: "Smallest" },
];

export type EntryFilter = {
  /** Free text, matched against what a person would remember typing. */
  query?: string;
  /** Only entries on this account. Empty means every account. */
  accountName?: string;
  /**
   * Only entries on one of these accounts. Empty or absent means every account.
   *
   * Beside `accountName` rather than replacing it: one account is what most callers ask
   * for and a bare string says that plainly, while the ledger's toolbar can be answered
   * with three at once. Both are honoured, and an entry has to satisfy each that is set —
   * so passing both narrows twice rather than one silently winning.
   */
  accountNames?: readonly string[];
  /** Only the ones still waiting for a price. */
  unpricedOnly?: boolean;
  /**
   * First and last day to keep, both inclusive. Either may be left out.
   *
   * Inclusive because these are the dates somebody typed, and a person who writes
   * "to the 15th" means the 15th. An exclusive end is a correct-looking filter that
   * silently loses a day, and the day it loses is the one they were looking for.
   */
  from?: string;
  to?: string;
};

/**
 * Fold accents and case so `Koštana` is found by `kostana`.
 *
 * People type without diacritics far more often than with them, and a Serbian ledger is
 * full of č, ć, š, ž and đ. A search that only matches the exact spelling is a search
 * that fails on precisely the entries this app is full of.
 *
 * `đ` is handled explicitly: it is a letter in its own right rather than a d with a mark,
 * so NFD leaves it alone and stripping combining marks never reaches it.
 */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/** Every word in the query has to appear somewhere — order and field do not matter. */
export function matches(entry: SearchableEntry, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  /*
    The amount is searchable too, and both spellings of it: `11737` for somebody who
    remembers the figure, `11.737` for somebody reading it off the screen.
  */
  const amount = entry.amount_rsd === null ? "" : String(Number(entry.amount_rsd));
  const grouped = amount ? new Intl.NumberFormat("sr-RS").format(Number(amount)) : "";

  const hay = fold(
    [
      entry.title ?? "",
      entry.note ?? "",
      entry.account?.name ?? "",
      entry.category?.name ?? "",
      entry.occurred_on,
      amount,
      grouped,
    ].join(" "),
  );

  return words.every((word) => hay.includes(word));
}

/** Whatever survives the filter, in the asked-for order. */
export function siftEntries<T extends SearchableEntry>(
  entries: readonly T[],
  filter: EntryFilter,
  sort: EntrySort,
  way: SortWay = "asc",
): T[] {
  const kept = entries.filter((entry) => {
    if (filter.from && entry.occurred_on < filter.from) return false;
    if (filter.to && entry.occurred_on > filter.to) return false;
    if (filter.unpricedOnly && entry.amount_rsd !== null) return false;
    if (filter.accountName && entry.account?.name !== filter.accountName) return false;
    if (
      filter.accountNames &&
      filter.accountNames.length > 0 &&
      !filter.accountNames.includes(entry.account?.name ?? "")
    )
      return false;
    if (filter.query && !matches(entry, filter.query)) return false;
    return true;
  });

  const value = (e: SearchableEntry) => Number(e.amount_rsd) || 0;
  /*
    Date, then time of day, then the order they were typed — the same three keys the
    ledger sorts by, so a category's list and the ledger agree about which of two entries
    on one afternoon came first. An entry with no time sorts after one that has it: a
    known 18:40 is later in the day than "sometime that Tuesday".
  */
  const byDate = (a: SearchableEntry, b: SearchableEntry) => {
    if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? -1 : 1;
    const at = a.occurred_at ?? "";
    const bt = b.occurred_at ?? "";
    if (at !== bt) return at < bt ? -1 : 1;
    return (a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1;
  };

  const sorted = [...kept];
  if (sort === "size") {
    // Ties fall back to date, so two 3.000 dinners do not swap places between renders —
    // and they fall back the same way at both ends, because the tie-break is not the
    // thing being reversed.
    sorted.sort(
      way === "desc"
        ? (a, b) => value(a) - value(b) || byDate(b, a)
        : (a, b) => value(b) - value(a) || byDate(b, a),
    );
  } else {
    sorted.sort(way === "desc" ? byDate : (a, b) => byDate(b, a));
  }
  return sorted;
}

/** Month key → total, for whatever survived the filter. */
export function totalsByMonth(entries: readonly SearchableEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.occurred_on.slice(0, 7);
    out.set(key, (out.get(key) ?? 0) + (Number(entry.amount_rsd) || 0));
  }
  return out;
}

