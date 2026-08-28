import { describe, expect, it } from "vitest";
import {
  budgetWindow,
  clockLabel,
  daysLeftInWindow,
  shiftBudgetWindow,
  windowProgress,
  type BudgetClock,
} from "./budget-periods";

const clock = (over: Partial<BudgetClock> = {}): BudgetClock => ({
  period: "month",
  period_count: 1,
  starts_on: "2026-08-01",
  ends_on: null,
  ...over,
});

describe("a monthly budget", () => {
  it("runs the calendar month when it is anchored to the 1st", () => {
    expect(budgetWindow(clock(), "2026-08-14")).toMatchObject({
      from: "2026-08-01",
      to: "2026-08-31",
      index: 0,
    });
  });

  it("runs 15th to 14th when that is when the money arrives", () => {
    expect(budgetWindow(clock({ starts_on: "2026-08-15" }), "2026-09-02")).toMatchObject({
      from: "2026-08-15",
      to: "2026-09-14",
      index: 0,
    });
    expect(budgetWindow(clock({ starts_on: "2026-08-15" }), "2026-09-15")).toMatchObject({
      from: "2026-09-15",
      to: "2026-10-14",
      index: 1,
    });
  });

  it("keeps counting into later months", () => {
    expect(budgetWindow(clock(), "2026-11-05")).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-30",
      index: 3,
    });
  });

  /*
    The case that breaks naive date arithmetic: a budget anchored to a day that not
    every month has. Adding a month to 31 January must give 28 February, not 3 March —
    otherwise the anchor walks forward a few days a year and a budget started on the
    31st ends up running from the 3rd.
  */
  it("clamps to the end of a short month instead of spilling into the next", () => {
    const c = clock({ starts_on: "2026-01-31" });
    expect(budgetWindow(c, "2026-02-10")).toMatchObject({ from: "2026-01-31", to: "2026-02-27" });
    expect(budgetWindow(c, "2026-02-28")).toMatchObject({ from: "2026-02-28", to: "2026-03-30" });
  });

  /*
    The one a naive implementation gets wrong. Ending February's window a month on from
    its own clamped start gives 27 March, while March's window starts on the 31st — and
    the 28th, 29th and 30th belong to no window at all. Every day has to be in exactly
    one.
  */
  it("leaves no gap between a clamped window and the next", () => {
    const c = clock({ starts_on: "2026-01-31" });
    for (const day of ["2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30"]) {
      expect(budgetWindow(c, day)).toMatchObject({ from: "2026-02-28", to: "2026-03-30" });
    }
    expect(budgetWindow(c, "2026-03-31")).toMatchObject({ from: "2026-03-31", to: "2026-04-29" });
  });

  it("does not lose the anchor after a short month — March is the 31st again", () => {
    expect(budgetWindow(clock({ starts_on: "2026-01-31" }), "2026-04-01")).toMatchObject({
      from: "2026-03-31",
      to: "2026-04-29",
    });
  });
});

describe("other clocks", () => {
  it("counts a fortnight from the anchor, not from the calendar", () => {
    const c = clock({ period: "week", period_count: 2, starts_on: "2026-08-03" });
    expect(budgetWindow(c, "2026-08-03")).toMatchObject({ from: "2026-08-03", to: "2026-08-16" });
    expect(budgetWindow(c, "2026-08-17")).toMatchObject({
      from: "2026-08-17",
      to: "2026-08-30",
      index: 1,
    });
  });

  it("handles a single day", () => {
    const c = clock({ period: "day", period_count: 1, starts_on: "2026-08-01" });
    expect(budgetWindow(c, "2026-08-09")).toMatchObject({
      from: "2026-08-09",
      to: "2026-08-09",
      index: 8,
    });
  });

  it("handles a year, and a half-decade", () => {
    expect(budgetWindow(clock({ period: "year" }), "2027-03-02")).toMatchObject({
      from: "2026-08-01",
      to: "2027-07-31",
      index: 0,
    });
    expect(budgetWindow(clock({ period: "year" }), "2027-08-01")).toMatchObject({
      from: "2027-08-01",
      to: "2028-07-31",
      index: 1,
    });
    expect(budgetWindow(clock({ period: "year", period_count: 5 }), "2032-01-01")).toMatchObject({
      from: "2031-08-01",
      to: "2036-07-31",
      index: 1,
    });
  });

  it("treats a custom budget as one window that can be over", () => {
    const c = clock({ period: "custom", starts_on: "2026-07-04", ends_on: "2026-07-18" });
    expect(budgetWindow(c, "2026-07-10")).toMatchObject({
      from: "2026-07-04",
      to: "2026-07-18",
      ended: false,
    });
    expect(budgetWindow(c, "2026-07-19").ended).toBe(true);
  });
});

describe("a budget that has not started yet", () => {
  /*
    Set one up on the 20th for next month and the screen must show next month. Walking
    the index negative would invent a window behind the anchor that the budget never had.
  */
  it("shows its first window rather than inventing one behind it", () => {
    expect(budgetWindow(clock({ starts_on: "2026-09-01" }), "2026-08-20")).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      index: 0,
    });
  });
});

describe("walking through the run", () => {
  it("steps back and forward a window at a time", () => {
    const c = clock({ starts_on: "2026-06-01" });
    expect(budgetWindow(c, "2026-08-14").index).toBe(2);
    expect(shiftBudgetWindow(c, "2026-08-14", -1)).toMatchObject({
      from: "2026-07-01",
      to: "2026-07-31",
      index: 1,
    });
    expect(shiftBudgetWindow(c, "2026-08-14", 1)).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      index: 3,
    });
  });

  it("will not walk back past the first window", () => {
    expect(shiftBudgetWindow(clock(), "2026-08-14", -5)).toMatchObject({
      from: "2026-08-01",
      index: 0,
    });
  });
});

describe("how far through", () => {
  it("counts today as spent, because you can still spend in it", () => {
    const w = budgetWindow(clock(), "2026-08-01");
    expect(windowProgress(w, "2026-08-01")).toBeCloseTo(1 / 31, 5);
    expect(windowProgress(w, "2026-08-31")).toBe(1);
  });

  it("clamps outside its own window rather than going negative or past one", () => {
    const w = budgetWindow(clock(), "2026-08-10");
    expect(windowProgress(w, "2026-07-20")).toBe(0);
    expect(windowProgress(w, "2026-09-20")).toBe(1);
  });

  it("counts the days left inclusively, and stops at zero", () => {
    const w = budgetWindow(clock(), "2026-08-10");
    expect(daysLeftInWindow(w, "2026-08-31")).toBe(1);
    expect(daysLeftInWindow(w, "2026-08-29")).toBe(3);
    expect(daysLeftInWindow(w, "2026-09-04")).toBe(0);
  });
});

describe("how the clock reads", () => {
  it("says it in words", () => {
    expect(clockLabel(clock())).toBe("every month");
    expect(clockLabel(clock({ period: "week", period_count: 2 }))).toBe("every 2 weeks");
    expect(clockLabel(clock({ period: "custom", ends_on: "2026-09-01" }))).toBe("fixed dates");
  });
});
