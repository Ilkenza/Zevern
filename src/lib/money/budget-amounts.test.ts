import { describe, expect, it } from "vitest";
import { amountAt, type AmountChange } from "./budget-amounts";

const AUGUST = { from: "2026-08-01", to: "2026-08-31" };
const JULY = { from: "2026-07-01", to: "2026-07-31" };
const JUNE = { from: "2026-06-01", to: "2026-06-30" };
const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" };

/** Groceries: 20.000 from the day it was made, raised to 25.000 on the 28th of August. */
const groceries: AmountChange[] = [
  { starts_on: "2026-06-01", amount: 20000 },
  { starts_on: "2026-08-28", amount: 25000 },
];

describe("what a window was allowed", () => {
  /*
    The whole point. Before this, raising the limit today re-judged every month behind it,
    so a July you overspent turned into a July you kept — silently, with no entry to look
    at and nothing on screen admitting the number had moved.
  */
  it("leaves finished months on the amount they actually ran under", () => {
    expect(amountAt(JUNE, groceries, 25000)).toBe(20000);
    expect(amountAt(JULY, groceries, 25000)).toBe(20000);
  });

  it("applies a change to the month it was made in, not the one after", () => {
    // Raised on 28 August: August is the month being thought about, so August gets it.
    expect(amountAt(AUGUST, groceries, 25000)).toBe(25000);
  });

  it("carries the newest amount forward to months with no change of their own", () => {
    expect(amountAt(SEPTEMBER, groceries, 25000)).toBe(25000);
    expect(amountAt({ from: "2027-03-01", to: "2027-03-31" }, groceries, 25000)).toBe(25000);
  });

  it("takes the last change when several land in one window", () => {
    const busy: AmountChange[] = [
      { starts_on: "2026-08-02", amount: 21000 },
      { starts_on: "2026-08-20", amount: 22000 },
      { starts_on: "2026-08-30", amount: 23000 },
    ];
    expect(amountAt(AUGUST, busy, 0)).toBe(23000);
  });

  it("is not confused by rows arriving in any order", () => {
    const shuffled = [...groceries].reverse();
    expect(amountAt(JULY, shuffled, 0)).toBe(20000);
    expect(amountAt(AUGUST, shuffled, 0)).toBe(25000);
  });
});

describe("when there is no history to read", () => {
  it("falls back to the budget's own amount rather than to nothing", () => {
    // A limit of zero would report every month as a catastrophic overspend, which is a
    // worse lie than the one this whole module exists to fix.
    expect(amountAt(AUGUST, [], 8000)).toBe(8000);
  });

  /*
    A window entirely before the earliest recorded amount. Happens when a budget's start
    date is moved backwards after the fact; judging those months against a limit nobody
    had thought of yet is the alternative, and it is worse.
  */
  it("uses the first amount it ever had for months before the record starts", () => {
    expect(amountAt({ from: "2026-01-01", to: "2026-01-31" }, groceries, 25000)).toBe(20000);
  });

  it("treats a zero limit as a real answer, not as missing", () => {
    expect(amountAt(AUGUST, [{ starts_on: "2026-08-01", amount: 0 }], 9999)).toBe(0);
  });
});
