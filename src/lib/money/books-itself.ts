import type { RecurringRow } from "@/lib/types";

/**
 * Whether a rule writes its own entry, or waits to be told that it happened.
 *
 * Two screens ask this — the overview's needs list and the timeline's "Due now" panel —
 * and each used to answer it with its own copy of the rule. The copies agreed, which is
 * the dangerous kind of duplication: they would have gone on agreeing right up until one
 * of them was changed, and then the same rule would book itself on one screen and sit
 * waiting on the other.
 *
 * The switch is the person's, and it is off until they turn it on. Everything else here
 * is a guard on top of that answer, because there are two cases where booking itself
 * cannot be honest whatever the switch says:
 *
 * - A variable rule has no amount to write. Electricity is a different figure every month
 *   and the app has never seen the bill.
 * - A rule entered *on or after* the day it falls due would post the moment it was saved,
 *   before anybody had seen it on a screen. Writing down a payment nobody confirmed is
 *   the fault this whole switch exists to prevent, so it does not get made at the one
 *   moment the person is least able to catch it.
 */
export type SelfBooking = Pick<
  RecurringRow,
  "books_itself" | "variable" | "amount" | "created_at" | "next_on"
>;

export function booksItself(rule: SelfBooking): boolean {
  if (!rule.books_itself) return false;
  if (rule.variable || !(Number(rule.amount) > 0)) return false;
  return String(rule.created_at).slice(0, 10) < rule.next_on;
}
