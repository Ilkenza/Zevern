import { describe, expect, it } from "vitest";
import type { BudgetLine } from "@/lib/types";
import { clean, expectedBy, remedyFor, shouldSuggest, statusOf, totalsOf } from "./status";

function line(
  limit: number,
  spent: number,
  typical = 0,
  fixed: { paid?: number; due?: number; name?: string } = {},
): BudgetLine {
  return {
    category: {
      id: "c1",
      user_id: "u",
      name: fixed.name ?? "Groceries",
      kind: "expense",
      icon: null,
      color: null,
      archived: false,
      sort: 0,
      created_at: "2026-01-01T00:00:00Z",
    },
    limit,
    spent,
    typical,
    fixedPaid: fixed.paid ?? 0,
    fixedDue: fixed.due ?? 0,
  } as BudgetLine;
}

describe("statusOf", () => {
  it("is over the moment spending passes the limit", () => {
    expect(statusOf(line(10000, 10001), 0.5)).toBe("over");
    expect(statusOf(line(10000, 10000), 0.5)).not.toBe("over");
  });

  it("separates two identical percentages by where the month is", () => {
    // 60% spent is fine on the 20th and a warning on the 8th. This is the whole
    // reason the screen tracks pace at all.
    expect(statusOf(line(10000, 6000), 0.65)).toBe("ontrack");
    expect(statusOf(line(10000, 6000), 0.25)).toBe("ahead");
  });

  it("tolerates fifteen points, so the word does not flicker on every coffee", () => {
    expect(statusOf(line(10000, 6400), 0.5)).toBe("ontrack");
    expect(statusOf(line(10000, 6600), 0.5)).toBe("ahead");
  });

  it("tells an unlimited category apart from an unused one", () => {
    expect(statusOf(line(0, 4000), 0.5)).toBe("untracked");
    expect(statusOf(line(0, 0), 0.5)).toBe("unset");
  });
});

describe("totalsOf", () => {
  const lines = [line(45000, 31200), line(12000, 15400), line(0, 7300)];

  it("keeps spending without limits out of the limit totals", () => {
    const t = totalsOf(lines, 0.81, true);
    expect(t.limit).toBe(57000);
    expect(t.spent).toBe(46600);
    expect(t.used).toBe(82);
  });

  it("projects a running month forward at the rate so far", () => {
    const t = totalsOf([line(100000, 81000)], 0.81, true);
    expect(t.projected).toBe(100000);
    expect(t.overshoot).toBe(0);
  });

  it("does not project a month that has already finished", () => {
    // Half a month's spending in a past month is the answer, not half a projection.
    const t = totalsOf([line(100000, 40000)], 0.5, false);
    expect(t.projected).toBe(40000);
  });

  it("reports what is left, never a negative amount of room", () => {
    expect(totalsOf([line(10000, 4000)], 0.5, true).left).toBe(6000);
    expect(totalsOf([line(10000, 14000)], 0.5, true).left).toBe(0);
  });

  it("is all zeros rather than NaN when nothing has a limit", () => {
    const t = totalsOf([line(0, 500)], 0.5, true);
    expect(t.limit).toBe(0);
    expect(t.spent).toBe(0);
    expect(t.used).toBe(0);
  });
});

describe("shouldSuggest", () => {
  it("respects a category intentionally left flexible", () => {
    expect(shouldSuggest(42000, "")).toBe(false);
    expect(shouldSuggest(42000, "0")).toBe(false);
  });

  it("stays quiet when the limit is already about right", () => {
    // The noise this exists to stop: a chip saying "a normal month is 42.000" beside
    // a limit of 45.000, on every card, until nobody reads any of them.
    expect(shouldSuggest(42000, "45000")).toBe(false);
    expect(shouldSuggest(42000, "42000")).toBe(false);
  });

  it("speaks up when the limit is far from what the month costs", () => {
    expect(shouldSuggest(42000, "20000")).toBe(true);
    expect(shouldSuggest(42000, "70000")).toBe(true);
  });

  it("has nothing to say without history", () => {
    expect(shouldSuggest(0, "")).toBe(false);
  });
});

describe("clean", () => {
  it("keeps digits and nothing else", () => {
    expect(clean("45.000 RSD")).toBe("45000");
    expect(clean("-12e3")).toBe("123");
    expect(clean("abc")).toBe("");
  });

  it("caps the length rather than accepting a figure no budget could be", () => {
    expect(clean("9".repeat(20))).toHaveLength(12);
  });
});

describe("expectedBy", () => {
  it("is the plain calendar share when nothing in the month is dated", () => {
    expect(expectedBy(line(10000, 0), 0.5)).toBe(5000);
    expect(expectedBy(line(10000, 0), 0)).toBe(0);
  });

  it("counts a bill in full from the day it books, not by the days since", () => {
    // Rent of 6.000 inside a 10.000 limit, on the 3rd of the month. The 4.000 that is
    // left is the only part that accrues: 6.000 + 4.000 x 0.1.
    expect(expectedBy(line(10000, 6000, 0, { paid: 6000 }), 0.1)).toBe(6400);
  });

  it("takes what is still to come out of the daily part without expecting it yet", () => {
    // 6.000 due later, so only 4.000 is spread over the days — and none of the 6.000
    // is expected until it lands.
    expect(expectedBy(line(10000, 0, 0, { due: 6000 }), 0.5)).toBe(2000);
  });

  it("never expects more than the limit", () => {
    expect(expectedBy(line(10000, 0, 0, { paid: 14000 }), 0.9)).toBe(10000);
  });

  it("has nothing to expect of a category with no limit", () => {
    expect(expectedBy(line(0, 4000), 0.5)).toBe(0);
  });
});

describe("statusOf, with dated charges", () => {
  it("does not call a paid bill on the 3rd 'ahead of pace'", () => {
    // The bug this model exists for. 6.000 of a 10.000 limit gone on day three reads
    // as 60% against a 10% month, which the old comparison called a warning every
    // single month for a week.
    const rent = line(10000, 6000, 0, { paid: 6000 });
    expect(statusOf(rent, 0.1)).toBe("ontrack");
  });

  it("still catches everyday spending running away underneath a bill", () => {
    // Same rent, but 2.500 of groceries on top of it by day three.
    const both = line(10000, 8500, 0, { paid: 6000 });
    expect(statusOf(both, 0.1)).toBe("ahead");
  });

  it("behaves exactly as before when there is nothing dated", () => {
    expect(statusOf(line(10000, 6000), 0.65)).toBe("ontrack");
    expect(statusOf(line(10000, 6000), 0.25)).toBe("ahead");
  });

  it("is over the moment the limit is passed, dated or not", () => {
    expect(statusOf(line(10000, 10001, 0, { paid: 10001 }), 0.1)).toBe("over");
  });
});

describe("totalsOf, with dated charges", () => {
  it("does not multiply a paid bill by the month it has not had", () => {
    // 60.000 of rent and 2.000 of groceries against 100.000, on the 3rd. The old
    // projection divided the lot by 0.1 and announced 620.000.
    const t = totalsOf([line(100000, 62000, 0, { paid: 60000 })], 0.1, true);
    expect(t.projected).toBe(80000);
    expect(t.overshoot).toBeLessThan(0);
  });

  it("counts what is still to come at face value", () => {
    const t = totalsOf([line(100000, 0, 0, { due: 60000 })], 0.1, true);
    expect(t.projected).toBe(60000);
  });

  it("keeps the calendar separately from the pace it no longer is", () => {
    const t = totalsOf([line(100000, 62000, 0, { paid: 60000 })], 0.1, true);
    expect(t.calendarPct).toBe(10);
    // 60.000 landed plus a tenth of the 40.000 that accrues.
    expect(t.pacePct).toBe(64);
  });

  it("leaves a month with no dated charges where it was", () => {
    const t = totalsOf([line(100000, 81000)], 0.81, true);
    expect(t.projected).toBe(100000);
    expect(t.pacePct).toBe(t.calendarPct);
  });
});

describe("remedyFor", () => {
  const overspent = line(10000, 8000, 0, { name: "Eating out" });
  const onPace = line(60000, 30000, 0, { name: "Groceries" });

  it("names the category furthest past its own pace, not the biggest one", () => {
    // Groceries spends three times as much and is exactly on pace. Telling someone to
    // cut it would be advice that ignores the plan they already made.
    expect(remedyFor([onPace, overspent], 0.5, 14)?.category).toBe("Eating out");
  });

  it("turns what is left into a rate, because a total is not actionable on a Tuesday", () => {
    // 2.000 left over 14 days is 1.000 a week.
    expect(remedyFor([overspent], 0.5, 14)?.perWeek).toBe(1000);
  });

  it("says nothing when every category is where it should be", () => {
    expect(remedyFor([onPace], 0.5, 14)).toBeNull();
  });

  it("says nothing on a month with no days left to change anything", () => {
    expect(remedyFor([overspent], 0.5, 0)).toBeNull();
  });

  it("reports no room rather than a rate once the limit is gone", () => {
    const gone = remedyFor([line(10000, 12000, 0, { name: "Eating out" })], 0.5, 14);
    expect(gone?.room).toBe(0);
    expect(gone?.perWeek).toBe(0);
  });

  it("ignores categories carrying no limit at all", () => {
    expect(remedyFor([line(0, 9000)], 0.5, 14)).toBeNull();
  });
});
