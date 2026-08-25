import { describe, expect, it } from "vitest";
import type { BudgetLine } from "@/lib/types";
import { clean, shouldSuggest, statusOf, totalsOf } from "./status";

function line(limit: number, spent: number, typical = 0): BudgetLine {
  return {
    category: {
      id: "c1",
      user_id: "u",
      name: "Groceries",
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

  it("adds up limits and spending, uncapped categories included in the spend", () => {
    const t = totalsOf(lines, 0.81, true);
    expect(t.limit).toBe(57000);
    expect(t.spent).toBe(53900);
    expect(t.used).toBe(95);
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
    expect(t.used).toBe(0);
  });
});

describe("shouldSuggest", () => {
  it("offers a figure to a field that has none", () => {
    expect(shouldSuggest(42000, "")).toBe(true);
    expect(shouldSuggest(42000, "0")).toBe(true);
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
