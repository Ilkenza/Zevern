/**
 * What moves a goal, and which way.
 *
 * Pulled out of the data layer so the one rule every goal figure rests on can be tested
 * without a database. It is four lines of arithmetic and one question — does this entry
 * count toward this goal — and the question has a different answer depending on which
 * way the goal runs, which is exactly the kind of thing that is quietly wrong for months.
 */

export type GoalMove = { kind: string; amount: number };

/**
 * The kinds that belong to a goal running this way. Everything else is ignored, so a
 * mis-filed row cannot move a figure it has nothing to do with.
 *
 * A goal being **saved up** holds money that is still on the account: `saving` puts a
 * claim on it, `withdraw` releases it, and `income` is money that arrived and was kept
 * rather than spent — one entry instead of two, and the balance and the claim both move,
 * so `free to spend` is unchanged, which is the truth of it.
 *
 * A goal being **paid off** is fed by money that has already gone: an ordinary `expense`
 * that names it, and an `income` that names it is that payment coming back.
 *
 * The two lists overlap on `income` and that is not a conflict — a goal runs one way or
 * the other, never both, so an entry is read once.
 */
export function goalKinds(paying: boolean): readonly string[] {
  return paying ? ["expense", "income"] : ["saving", "withdraw", "income"];
}

/** Every kind either of the two lists can contain — what the query has to fetch. */
export const GOAL_MOVE_KINDS = ["saving", "withdraw", "expense", "income"] as const;

/** Whether this entry moves the goal closer to its target rather than back from it. */
export function movesToward(kind: string, paying: boolean): boolean {
  return paying ? kind === "expense" : kind === "saving" || kind === "income";
}

/**
 * Where a goal stands, walked oldest first.
 *
 * `peak` has to be walked rather than summed: it is the most the goal ever actually
 * stood at, which is not the same as everything that ever went in — a goal filled and
 * emptied twice peaked at half of what it took.
 */
export function walkGoal(
  moves: readonly GoalMove[],
  paying: boolean,
): { progress: number; peak: number; deposited: number; withdrawn: number } {
  let progress = 0;
  let peak = 0;
  let deposited = 0;
  let withdrawn = 0;

  for (const move of moves) {
    if (movesToward(move.kind, paying)) {
      progress += move.amount;
      deposited += move.amount;
    } else {
      progress -= move.amount;
      withdrawn += move.amount;
    }
    if (progress > peak) peak = progress;
  }

  return { progress, peak, deposited, withdrawn };
}
