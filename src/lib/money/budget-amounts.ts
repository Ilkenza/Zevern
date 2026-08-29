/**
 * What a budget allowed during a given window.
 *
 * A budget used to carry one amount and no memory of it. Raise Groceries from 20.000 to
 * 25.000 today, walk back to July, and July was measured against 25.000 — a month you
 * planned at 20.000 and overspent read as comfortable, with nothing on screen to say the
 * number had moved since. Every past month quietly re-judged by today's intentions.
 *
 * So the amount is effective-dated, and a window is measured by whichever amount was in
 * force while it ran.
 */

export type AmountChange = {
  /** First day this amount applies from. */
  starts_on: string;
  amount: number;
};

/**
 * The amount in force for a window running `from`..`to`.
 *
 * Measured against the window's **last** day, not its first. Somebody raising a limit on
 * the 28th means "this month is allowed more", not "next month is" — the month they are
 * standing in is the one they are thinking about. Taking the amount at the window's start
 * would make every change take effect a month late: not wrong enough to report as a bug,
 * just wrong enough to stop believing the screen.
 *
 * `fallback` is the plan's own current amount, used when there is no history at all —
 * a budget made before this table existed, or one whose rows were removed. It keeps the
 * old behaviour rather than reading zero, because a budget reporting a limit of nought is
 * a budget reporting every month as a catastrophic overspend.
 */
export function amountAt(
  window: { from: string; to: string },
  changes: readonly AmountChange[],
  fallback: number,
): number {
  let best: AmountChange | null = null;
  for (const change of changes) {
    if (change.starts_on > window.to) continue;
    if (!best || change.starts_on > best.starts_on) best = change;
  }

  /*
    Nothing in force yet, but history exists: the window ran entirely before the earliest
    recorded amount. That happens when a budget's start date is moved backwards after the
    fact, and the honest reading is the first amount it ever had — the alternative is
    judging those months against a limit that had not been thought of.
  */
  if (!best) {
    let earliest: AmountChange | null = null;
    for (const change of changes) {
      if (!earliest || change.starts_on < earliest.starts_on) earliest = change;
    }
    return earliest ? earliest.amount : fallback;
  }

  return best.amount;
}
