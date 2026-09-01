/**
 * Reading every row a query matches, rather than the first page of them.
 *
 * Pure on purpose: it takes a function that fetches one page and knows nothing about
 * Supabase, Postgres or HTTP. What it holds is the part that was actually wrong — where
 * a page starts, when to stop, and what a caller owes the ordering.
 */

import { ReadFailed } from "@/lib/data/must";

/**
 * How many rows PostgREST will hand back before it stops, without saying that it did.
 *
 * This is the default `max-rows` on the API in front of Postgres. A `select` with no
 * range asking for 1.384 rows returns 1.000 of them, with no error, no flag, and a
 * perfectly ordinary-looking array — so the arithmetic downstream is simply wrong and
 * nothing anywhere complains.
 *
 * It is the worst shape a bug can have in a money app: silent, correct for a long time,
 * and wrong in the direction of "you have more than you have". A household entering
 * sixty rows a month crosses it after about sixteen months, which is exactly the point
 * at which the ledger has become worth trusting.
 */
export const PAGE = 1000;

/** A runaway guard. Sixteen pages is 16.000 rows — years of a real ledger. */
export const MAX_PAGES = 64;

/**
 * Read every row a query matches, not the first thousand.
 *
 * Takes a factory rather than a query, because a Supabase builder is spent once it is
 * awaited and each page has to be built again with its own `.range()`.
 *
 * The order matters and is not optional: `range` is an offset into a result set, and
 * Postgres makes no promise about the order of one without `order by`. Page two of an
 * unordered query can repeat or skip rows from page one. Every caller here therefore
 * ends its ordering with a unique column, and the last page is the one that comes back
 * short — which is also why a ledger whose size is an exact multiple of PAGE costs one
 * extra empty round trip rather than losing its tail.
 */
export async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  label: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    /*
      A failed page used to return the rows collected so far. That is the worse of the two
      wrong answers available: the caller adds up an arbitrary prefix of the ledger and
      prints the sum as a fact. Half a ledger is not a smaller ledger, it is a wrong one,
      and there is nothing on the screen to say which half is missing.
    */
    if (error) throw new ReadFailed(label, error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
  // Sixty-four full pages means either a ledger past anything this reader was written for
  // or a query that never narrows. Both make the total below wrong; neither is guessable.
  throw new ReadFailed(
    label,
    `stopped at ${MAX_PAGES * PAGE} rows — the ledger is bigger than this reader expects.`,
  );
}
