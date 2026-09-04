import type { PostgrestError } from "@supabase/supabase-js";

/** A specific sentence to use instead of the generic one, per class of violation. */
type Overrides = {
  unique?: string;
  foreignKey?: string;
  check?: string;
  /** The last-resort sentence, for callers that are not saving. */
  fallback?: string;
};

/**
 * A Postgres error, said in a sentence the person in front of the form can act on.
 *
 * `error.message` names constraints and columns — `invoices_user_number_key`,
 * `profiles_handle_key` — which tells an attacker how the schema is shaped and tells
 * everyone else nothing. The real message still reaches the server log, where it is
 * the thing you actually want when something breaks.
 *
 * Pass an override where the caller knows which value collided; the constraint name
 * never says that as well as the caller can.
 */
export function saveErrorMessage(error: PostgrestError, overrides: Overrides = {}): string {
  switch (error.code) {
    case "23505":
      return overrides.unique ?? "That value is already taken.";
    case "23503":
      return overrides.foreignKey ?? "That reference no longer exists.";
    case "23514":
      return overrides.check ?? "That value is not allowed.";
    /*
      The app is ahead of its own database.

      PostgREST returns this when a column the request names is not in the schema
      cache — which in practice means a migration has been written and not applied. It
      fell through to "Try again" below, and that is the one thing that is guaranteed
      not to work: every retry sends the same column to the same schema. Saying so
      costs nothing and saves the ten minutes of retrying that the old message invited.
    */
    case "PGRST204":
    case "42703":
      console.error("save:", error.message);
      return "This needs a database change that has not been applied yet — nothing was saved.";
    /*
      The figure is wider than the column, not larger than the balance.

      Money is stored as numeric(14, 2) — twelve digits before the decimal point, so a
      shade under a thousand billion. Past that Postgres refuses the row, and the
      generic "try again" sent people off to check their accounts for a problem that is
      arithmetic about digits and has nothing to do with what they have.
    */
    case "22003":
      console.error("save:", error.message);
      return "That figure is too large to store — the most an amount holds is 999.999.999.999,99.";
    default:
      console.error("save:", error.message);
      return overrides.fallback ?? "Could not save that. Try again.";
  }
}

/**
 * The same translation, for a delete rather than a save.
 *
 * Every delete in this app used to log its error and carry on — revalidate the list,
 * redirect to it, and let the person watch the row they just deleted come back. That is
 * the worst shape a failure can take: the screen says it worked, the database says it
 * did not, and the only way to find out is to notice the row again later.
 *
 * A foreign key is the common one and deserves its own sentence: nothing is broken, the
 * thing is simply still in use, and "try again" is the one instruction guaranteed not to
 * help.
 */
export function deleteErrorMessage(error: PostgrestError, what = "that"): string {
  return saveErrorMessage(error, {
    foreignKey: `Could not delete ${what} — something else still points at it. Remove that first.`,
    fallback: `Could not delete ${what}. Nothing was removed — try again.`,
  });
}
