import { PENNY } from "./posting";

/**
 * Which way a movement moves a debt, and by how much.
 *
 * Pulled out of the data layer so the one rule every debt figure rests on can be tested
 * without a database — the same arrangement `goal-progress.ts` has, for the same reason:
 * it is a handful of arithmetic and one question, and the question has a different
 * answer depending on which way the debt runs, which is exactly the kind of thing that
 * is quietly wrong for months.
 *
 * Four kinds can carry a `loan_id`, and on a debt running one way they mean:
 *
 * | borrowed (you owe)      | lent (they owe you)     |
 * | ----------------------- | ----------------------- |
 * | `loan_in`  — you took it, this opened the debt   | `loan_out` — you handed it over, this opened it |
 * | `loan_out` — you paid some back                  | `loan_in`  — they paid some back |
 * | `expense`  — an instalment, and a real expense   | `income`   — a repayment that also counts as income |
 * | `income`   — money came *back* off a payment     | `expense`  — you gave them more, or refunded one |
 *
 * The last row is what this file exists for. It used to be lumped in with the opening
 * movement and ignored, so a bank refunding an instalment left the debt claiming it had
 * been paid: money back on the account, and nothing on the debt saying so. Refunds
 * subtract; the opening does not count at all, because the total is stated on the debt
 * rather than derived from the entry that started it.
 */

/**
 * Whether the debt should now close itself, open itself again, or be left alone.
 *
 * A debt paid down to nothing used to sit in the open list at nought, beside a button
 * asking to be told what the row already said. `postRecurring` fixed that for the
 * instalment years ago — the last rate closes the debt — and left the same money entered
 * by hand doing nothing, so the identical fact recorded two ways gave two answers.
 *
 * Reopening is the harder half, and the reason it takes `before` at all. Closing a debt
 * with a balance still on it is a real thing somebody does — the rest was forgiven, see
 * `settleLoan` — and a rule that reopened any closed debt showing money owed would undo
 * that the moment anything else was touched. So the door only swings back for a debt that
 * was standing at nothing: it was closed because it was paid, the payment has gone, and
 * the reason it was closed went with it.
 */
export type LoanClosure = "close" | "reopen" | null;

export function loanClosure(input: {
  /** What was owed before the entry was written, edited or removed. */
  before: number;
  /** And what is owed now. */
  after: number;
  /** Whether the debt currently carries a settled date. */
  settled: boolean;
}): LoanClosure {
  const { before, after, settled } = input;
  if (after <= PENNY && !settled) return "close";
  if (after > PENNY && settled && before <= PENNY) return "reopen";
  return null;
}

/** A movement against a debt, reduced to what this file needs. */
export type LoanMove = { kind: string; amount: number };

/**
 * How this movement counts toward settling the debt: paid down, taken back, or the one
 * that opened it.
 *
 * `0` is a real answer rather than a missing one. The opening movement is money that
 * genuinely moved and belongs in the account balance and in the debt's history — it
 * simply says nothing about how much of the debt has been paid.
 */
export function weighLoanMove(direction: string, kind: string): -1 | 0 | 1 {
  /*
    Named rather than inferred from the cash direction alone.

    Written as "money in or money out", every kind that is not `loan_in` or `income`
    counts as money out — including `saving` and `transfer`, which mean nothing to a
    debt. `saveTransaction` strips `loan_id` from those, so the app cannot produce one;
    a row written before that rule existed, or by hand, still can, and it would have
    been counted as a repayment. Four kinds can pay a debt. Anything else is nought.
  */
  if (!MOVES.has(kind)) return 0;
  const lent = direction === "lent";
  // The debt was opened by money going the way the debt itself goes: out of the account
  // when you lend, into it when you borrow.
  if (kind === (lent ? "loan_out" : "loan_in")) return 0;
  // A refund of an instalment is that instalment coming back, which is the same movement
  // an `income` against a debt has always been and is now the word for it.
  const moneyIn = kind === "loan_in" || kind === "income" || kind === "refund";
  // Lent money comes back to you; borrowed money goes away from you.
  if (lent) return moneyIn ? 1 : -1;
  return moneyIn ? -1 : 1;
}

/** The only kinds `saveTransaction` lets carry a `loan_id`. */
const MOVES = new Set(["loan_in", "loan_out", "expense", "income", "refund"]);

/**
 * What has been paid against the debt so far.
 *
 * Never below nought. A refund larger than everything ever paid would otherwise make
 * `settled` negative and `outstanding` larger than the debt itself — the app inventing
 * money owed out of a bookkeeping mistake. Nought is the honest floor: nothing has been
 * paid, and whatever else is going on is between the two parties.
 */
export function settledOf(direction: string, moves: readonly LoanMove[]): number {
  let total = 0;
  for (const move of moves) total += weighLoanMove(direction, move.kind) * move.amount;
  return Math.max(0, total);
}
