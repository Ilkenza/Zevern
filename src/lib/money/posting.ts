/**
 * What one booking of a repeating rule comes to, and what that booking ends.
 *
 * These two questions used to be seven lines in the middle of `postRecurring`, wedged
 * between a Supabase read and a Supabase write, which meant the only way to run them was
 * to have a database and a signed-in user. They are the part of that action that touches
 * money — how much actually leaves, and whether the plan is over — and they had nothing
 * behind them but reading.
 *
 * So they are here, in the shape `paymentsLeft` and `weighLoanMove` are already in: the
 * arithmetic separated from the plumbing, so it can be tested by calling it. What stays
 * in the action is what genuinely needs the database — what is owed, whether the goal is
 * full — and those arrive here as plain numbers.
 */

/**
 * Rounding leaves ragged tenths of a dinar behind; do not fail a payment over one.
 *
 * It lives beside the arithmetic that uses it rather than in the actions folder, because
 * a tolerance is part of the sum, not part of the plumbing. `actions/shared` re-exports
 * it, so every caller that had it keeps it.
 */
export const PENNY = 0.01;

/**
 * How much this booking is worth, or why there is nothing to book.
 *
 * A refusal is a name rather than a sentence. The copy belongs on the screen — it has
 * already been reworded twice this month — and a test asserting on a sentence fails the
 * next time somebody improves the wording, which teaches people to stop trusting tests.
 */
export type BookingPlan =
  | { book: number; refusal?: undefined }
  | { book: null; refusal: "settled" | "no-amount" };

/**
 * What actually leaves the account, given what is still owed.
 *
 * `owed` is `null` for every rule that is not paying off a debt — rent, a salary, money
 * into a goal — and those book what they say they book. A rule that *is* paying off a
 * debt cannot pay more than is left on it.
 *
 * That trim is the whole reason this exists. Four payments of 30.776,48 clear 123.105,92
 * exactly, until the month somebody pays 35.000 instead; the plan still says four, so the
 * fourth booking would hand over 4.223,52 nobody owes. The rule cannot see that, because
 * what is owed lives in the ledger rather than on the rule.
 *
 * `asked` is checked here as well as by the caller's own early guard. That guard exists
 * to refuse a variable rule with no figure typed in before anything is read; this one
 * catches the same thing after the trim, when what is owed is a fraction of a dinar and
 * the trim leaves nothing worth writing down.
 */
export function amountToBook(asked: number, owed: number | null): BookingPlan {
  // Nothing to pay off, so nothing to book: booking against a cleared debt would write an
  // entry that makes the debt owe money back.
  if (owed != null && owed <= PENNY) return { book: null, refusal: "settled" };
  const book = owed != null ? Math.min(asked, owed) : asked;
  // `!(book > 0)` rather than `book <= 0`, so a NaN that reached this far is refused
  // instead of being written to the ledger.
  if (!(book > 0)) return { book: null, refusal: "no-amount" };
  return { book };
}

/** What this booking finished, if anything. */
export type PlanEnd = {
  /** The debt this rule was paying is now clear — the caller closes it. */
  loanCleared: boolean;
  /** The rule has done its job and should stop repeating. */
  finished: boolean;
};

/**
 * Whether the plan is over now that this booking has landed.
 *
 * Four conditions, and the interesting thing about them is which one outranks which.
 *
 * **The ledger outranks the count.** A rule paying off a debt stops when the debt is
 * clear, whatever number of payments anybody wrote down — pay extra one month and it
 * genuinely finishes early, pay short and it carries on until the money is actually
 * back. So `installmentsTotal` is not consulted at all while there is a debt attached:
 * four bookings against a credit that needed five would otherwise switch the rule off
 * with money still owed and nothing left pointing at it. Same reading as the projection
 * in `occurrencesFor` — the count is what was planned, the ledger is what happened, and
 * where they disagree the ledger is the one that is true.
 *
 * **`owed` is what was owed before this booking.** It is read once, before the entry is
 * written, and the sum here subtracts what was just booked rather than asking again —
 * the read is cached for the request, so asking again hands back the figure from before
 * the insert: the same number, quietly meaning something else.
 *
 * `goalFull` arrives already answered because only the ledger can answer it: a goal
 * fills from this rule, from money put in by hand, and empties again when some is taken
 * back out.
 */
export function planEnd(input: {
  /** What was owed on the linked debt before this booking, or `null` if there is none. */
  owed: number | null;
  /** What this booking actually wrote — the trimmed figure, not the asked one. */
  booked: number;
  /** `installments_done` after this booking. */
  done: number;
  installmentsTotal: number | null;
  endsOn: string | null;
  /** The date this rule moves to next. */
  next: string;
  goalFull: boolean;
}): PlanEnd {
  const { owed, booked, done, installmentsTotal, endsOn, next, goalFull } = input;

  const loanCleared = owed != null && owed - booked <= PENNY;
  const countedOut = owed == null && installmentsTotal != null && done >= installmentsTotal;
  const ranOut = endsOn != null && next > endsOn;

  return { loanCleared, finished: countedOut || ranOut || goalFull || loanCleared };
}
