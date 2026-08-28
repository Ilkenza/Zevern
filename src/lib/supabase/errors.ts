import type { PostgrestError } from "@supabase/supabase-js";

/** A specific sentence to use instead of the generic one, per class of violation. */
type Overrides = {
  unique?: string;
  foreignKey?: string;
  check?: string;
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
      return "Could not save that. Try again.";
  }
}
