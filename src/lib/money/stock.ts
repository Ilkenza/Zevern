/**
 * What is left of a thing that was bought, and how urgently it wants eating.
 *
 * The whole feature exists because of one afternoon's evidence: bananas bought, forgotten,
 * rotten in four days, binned. So the arithmetic is small and the ordering is the point —
 * a list that does not put the thing about to go off at the top has answered a question
 * nobody asked.
 *
 * There is no money in this file, deliberately, and the reason is worth keeping written
 * down where the next person will look: costing the waste was offered and turned down.
 * Most item lines carry no price at all — the price is on the receipt, not per article —
 * so a figure in dinars would be the app splitting a shopping bag's total across nine
 * things and printing the estimate as a fact. `What do I still have' is a question the
 * data can actually answer.
 */

import { backDays } from "./date-range";

/** One thing that happened to a lot: some of it eaten, or some of it binned. */
export type StockMove = { kind: string; qty: number };

/**
 * How many are left.
 *
 * Both kinds subtract. Eating four bananas and binning two leaves four of ten, and the
 * difference between the two is a fact about the four rather than about the six — which
 * is exactly why the moves are kept separately instead of a counter being decremented.
 *
 * Never below nought: saying twelve of ten went is a slip, and a list that answers it
 * with `-2 left' has turned a typo into arithmetic.
 */
export function leftOf(bought: number, moves: readonly StockMove[]): number {
  let gone = 0;
  for (const move of moves) {
    if (move.kind !== "eaten" && move.kind !== "binned") continue;
    gone += Number(move.qty) || 0;
  }
  // Thousandths, because the column carries three decimals and floats do not land on
  // nought on their own — nine tenths taken from one leaves 0.09999999999999998.
  return Math.max(0, Math.round((bought - gone) * 1000) / 1000);
}

/** How much of a lot this movement actually takes, or why it takes nothing. */
export type Take = { take: number; refusal?: undefined } | { take: null; refusal: "empty" | "none" };

/**
 * What saying "I ate three" comes to, given what is actually there.
 *
 * Trimmed to what is left, for the same reason a repayment is trimmed to what is owed:
 * the number is typed by a person who is looking at a bowl rather than at the app, and
 * "three" when two are left means the two. Recording three would leave the lot at minus
 * one, and every list that reads it would then be describing a bowl that cannot exist.
 */
export function takeOf(asked: number, left: number): Take {
  if (!(left > 0)) return { take: null, refusal: "empty" };
  const take = Math.min(asked, left);
  // `!(take > 0)` rather than `take <= 0`, so a NaN typed into the box is refused
  // instead of being written down.
  if (!(take > 0)) return { take: null, refusal: "none" };
  return { take: Math.round(take * 1000) / 1000 };
}

/**
 * The day a lot goes off, worked out once when it is bought.
 *
 * Not followed afterwards. Deciding later that bananas keep four days rather than five
 * must not silently move the date on the bunch already in the bowl — the bunch in the
 * bowl was bought under the old answer, and a date that changes by itself is a date
 * nobody trusts.
 */
export function expiryFor(boughtOn: string, keepsDays: number | null | undefined): string | null {
  if (keepsDays == null || !(keepsDays > 0)) return null;
  return backDays(boughtOn, -Math.round(keepsDays));
}

/** How much attention a lot wants. */
export type Standing = "gone" | "today" | "soon" | "later" | "none";

/** Within this many days is `soon` — long enough to plan a meal round it. */
const SOON_DAYS = 3;

/**
 * Where a lot stands against today.
 *
 * `none` is a real answer rather than a missing one: a tin of fish has no date, is not
 * late, and must never be dressed up as fine — `fine' would imply somebody checked.
 */
export function standingOf(expiresOn: string | null | undefined, today: string): Standing {
  if (!expiresOn) return "none";
  if (expiresOn < today) return "gone";
  if (expiresOn === today) return "today";
  return expiresOn <= backDays(today, -SOON_DAYS) ? "soon" : "later";
}

/** What each standing is called, and how loudly. */
export const STANDING_LABEL: Record<Standing, string> = {
  gone: "past its date",
  today: "today",
  soon: "soon",
  later: "keeps",
  none: "no date",
};

/** The order the list is read in: what is about to go, first. */
const RANK: Record<Standing, number> = { gone: 0, today: 1, soon: 2, later: 3, none: 4 };

/**
 * Soonest first, and everything without a date last.
 *
 * Dateless things are not sorted to the bottom because they matter less — a tin of fish is
 * as bought as a banana — but because they never become urgent, and a list whose top is
 * always the same is a list that stops being looked at.
 */
export function byUrgency<T extends { expiresOn: string | null; boughtOn: string; name: string }>(
  lines: readonly T[],
  today: string,
): T[] {
  return [...lines].sort((a, b) => {
    const rank = RANK[standingOf(a.expiresOn, today)] - RANK[standingOf(b.expiresOn, today)];
    if (rank !== 0) return rank;
    if (a.expiresOn && b.expiresOn && a.expiresOn !== b.expiresOn)
      return a.expiresOn < b.expiresOn ? -1 : 1;
    // Then oldest first, because the bunch bought last week goes before the one bought
    // yesterday whether or not either carries a date.
    if (a.boughtOn !== b.boughtOn) return a.boughtOn < b.boughtOn ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
