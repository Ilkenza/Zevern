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
    default:
      console.error("save:", error.message);
      return "Could not save that. Try again.";
  }
}
