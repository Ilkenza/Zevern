import type { PostgrestError } from "@supabase/supabase-js";

/**
 * A read that failed, said out loud.
 *
 * Every figure in this app comes from a query, and every one of those queries used to be
 * written the same way: take `data`, drop `error`, and let `?? []` turn a failure into an
 * empty list. An empty list sums to zero, and zero is printed in the same weight, the same
 * font and the same place as a real figure. Nothing on the screen distinguishes "you spent
 * nothing this month" from "I could not read what you spent this month".
 *
 * That is the worst failure this app can have, because it is confident. A blank screen
 * makes you check; a wrong number makes you plan around it.
 *
 * So a failed read throws. Next catches it at `app/(app)/error.tsx` — which already
 * exists, keeps the sidebar, offers a retry and prints a reference — so the screen says
 * "this did not load" instead of quietly saying zero. Refusing to answer is the only
 * honest thing a ledger can do when it cannot see the ledger.
 *
 * What it deliberately does NOT do: retry, fall back to a cache, or degrade. Each of
 * those puts a number on the screen that came from somewhere other than the database,
 * which is the problem wearing a different coat.
 */
export class ReadFailed extends Error {
  constructor(
    readonly label: string,
    readonly reason: string,
  ) {
    /*
      The message names the read and nothing else. The Postgres error — table names,
      constraints, column names — goes to the server log, not into an object that a
      client error boundary might one day print.
    */
    super(`Could not read ${label}.`);
    this.name = "ReadFailed";
  }
}

type Result<T> = { data: T | null; error: PostgrestError | null };

/**
 * A list, or a thrown failure — never a quietly empty list.
 *
 * `label` is what the screen could not read, in the words of the thing rather than of the
 * schema: it lands in the log beside the digest the error screen shows, and that pair is
 * what turns a user's screenshot into a line to look at.
 */
export function must<T>(result: Result<T[]>, label: string): T[] {
  if (result.error) {
    console.error(`read ${label}:`, result.error.message);
    throw new ReadFailed(label, result.error.message);
  }
  return result.data ?? [];
}

/**
 * One row, or none — but never "none" because the read broke.
 *
 * The distinction `must` cannot express: a `maybeSingle()` that finds nothing is a real
 * answer ("no profile yet"), while one that errors is not an answer at all. Collapsing
 * the two is how a missing setting and a broken connection end up looking identical.
 */
export function mustOne<T>(result: Result<T>, label: string): T | null {
  if (result.error) {
    console.error(`read ${label}:`, result.error.message);
    throw new ReadFailed(label, result.error.message);
  }
  return result.data;
}

/**
 * The same failure, on the way in rather than on the way out.
 *
 * A server action reads before it writes: is this goal still open, does this budget take
 * entries by hand, how much has that account already promised elsewhere. Those reads were
 * written like the ones above — `data` taken, `error` dropped — and the consequence is
 * worse here than on a screen, because the answer is not shown to anybody. It is used.
 *
 * `const { data: goalRow } = …` on a failed read gives `undefined`, `goalRow?.completed_at`
 * is then falsy, and the guard that exists to stop an entry landing on a closed goal waves
 * it through. The check did not fail; it was never made. Half of these fail open like that
 * and half fail closed with a message that is simply untrue ("that budget is not on your
 * profile" — it is, the read broke).
 *
 * An action cannot throw the way a page can, because there is no error boundary around a
 * form submit — so it says so and saves nothing. Refusing is always available, and is the
 * only answer that is true when the check could not be made.
 */
export function unreadable(label: string): string {
  return `Could not check ${label} — nothing was saved. Try again.`;
}
