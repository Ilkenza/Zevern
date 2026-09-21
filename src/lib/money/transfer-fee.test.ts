import { describe, expect, it } from "vitest";
import { feeOf } from "@/lib/money";
import { sumEntries } from "@/lib/money/summary";

/*
  A cash machine that is not your bank's takes a charge. Withdraw 5.000 and the bank is
  debited 5.250 — two figures for one trip, where a transfer has room for one, because
  whatever leaves `account_id` arrives at `to_account_id` by construction.

  So the charge is written as a second row: an ordinary expense on the account the money
  left, pointing back at the transfer. These hold the two halves of that claim apart.
*/

describe("feeOf", () => {
  it("reads the charge off the paired row", () => {
    expect(feeOf({ fee: { amount: 250 } })).toBe(250);
  });

  it("is zero for a move that carried no charge", () => {
    expect(feeOf({ fee: null })).toBe(0);
    // Absent, which is every row that did not come through a loader that attaches fees.
    expect(feeOf({})).toBe(0);
  });

  it("is zero, not NaN, when the paired row has no figure on it", () => {
    // NaN in the form's fee box saves as nothing — which deletes the charge.
    expect(feeOf({ fee: { amount: null } })).toBe(0);
  });

  it("keeps the dinars, not just the whole number", () => {
    expect(feeOf({ fee: { amount: 249.5 } })).toBe(249.5);
  });
});

describe("a charged withdrawal, once it is two rows", () => {
  const withdrawal = { kind: "transfer", amount_rsd: 5000, category_id: null };
  const charge = { kind: "expense", amount_rsd: 250, category_id: "bank-fees" };

  it("puts the charge in the month's spending and leaves the move out of it", () => {
    /*
      The whole reason the fee is an expense row rather than a column on the transfer.
      Nothing in `sumEntries` was taught about fees — it counts this because it is
      spending, which is what it is.
    */
    expect(sumEntries([withdrawal, charge])).toMatchObject({ expense: 250, income: 0, net: -250 });
  });

  it("files the charge under a category, so it shows up in the breakdown", () => {
    expect(sumEntries([withdrawal, charge]).byCategory).toEqual([
      { id: "bank-fees", spent: 250, entries: 1 },
    ]);
  });

  it("is the version that used to be wrong: one row for the bank's figure", () => {
    // What the app forced before — 5.250 entered as the move. The month reports no
    // spending at all, and 250 dinars of cash appear that were never in a pocket.
    const lumped = sumEntries([{ kind: "transfer", amount_rsd: 5250, category_id: null }]);
    expect(lumped).toMatchObject({ expense: 0, net: 0 });
  });

  it("nets to the same money out of the account either way", () => {
    // 5.000 to cash plus 250 gone is 5.250 off the bank — the figure on the statement,
    // which is the number the pair has to keep agreeing with.
    expect(withdrawal.amount_rsd + charge.amount_rsd).toBe(5250);
  });
});
