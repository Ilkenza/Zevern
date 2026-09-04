import { describe, expect, it } from "vitest";
import type { BudgetPlanLine } from "@/lib/types";
import { capsCategory, scopeOf } from "./plan-reading";

/**
 * A budget line, in the shape the two rules below read.
 *
 * The fixtures are deliberately built around the case that broke: a monthly budget
 * somebody named after a category, watching every category, twenty thousand a month.
 */
function planLine(over: {
  name?: string;
  membership?: string;
  kind?: string;
  categoryIds?: string[];
  limitRsd?: number;
  ended?: boolean;
} = {}): BudgetPlanLine {
  return {
    plan: {
      id: "b1",
      user_id: "u",
      name: over.name ?? "Groceries",
      membership: over.membership ?? "all",
      kind: over.kind ?? "expense",
      period: "month",
      period_count: 1,
      starts_on: "2026-01-01",
      ends_on: null,
      amount_rsd: over.limitRsd ?? 20000,
      archived: false,
      sort: 0,
      created_at: "2026-01-01T00:00:00Z",
    },
    window: { from: "2026-08-01", to: "2026-08-31", index: 7, ended: over.ended ?? false },
    categoryIds: over.categoryIds ?? [],
    accountIds: [],
    used: 7667.8,
    entries: 9,
    filed: 0,
    filedIn: [],
    baseRsd: over.limitRsd ?? 20000,
    extra: 0,
    boostedBy: [],
    limitRsd: over.limitRsd ?? 20000,
  } as unknown as BudgetPlanLine;
}

const NAMES: Record<string, string> = {
  groceries: "Groceries",
  shopping: "Shopping",
  transport: "Transport",
  eating: "Eating out",
};
const nameOf = (id: string) => NAMES[id];

describe("scopeOf", () => {
  it("says a budget with no categories watches all of them", () => {
    // The whole bug in one assertion: nothing about the name says this, and until now
    // nothing on the screen did either.
    expect(scopeOf(planLine(), nameOf)).toBe("every category");
  });

  it("stays quiet when the one category repeats the budget's own name", () => {
    expect(scopeOf(planLine({ categoryIds: ["groceries"] }), nameOf)).toBeNull();
    // Case and stray spacing are typing, not meaning.
    expect(scopeOf(planLine({ name: " groceries " , categoryIds: ["groceries"] }), nameOf)).toBeNull();
  });

  it("names the category when it is not the one the budget is called", () => {
    expect(scopeOf(planLine({ name: "Food", categoryIds: ["groceries"] }), nameOf)).toBe(
      "Groceries",
    );
  });

  it("names two, and counts the rest", () => {
    expect(scopeOf(planLine({ categoryIds: ["groceries", "shopping"] }), nameOf)).toBe(
      "Groceries · Shopping",
    );
    expect(
      scopeOf(planLine({ categoryIds: ["groceries", "shopping", "transport", "eating"] }), nameOf),
    ).toBe("Groceries · Shopping +2");
  });

  it("calls a hand-kept budget what it is, whatever is attached to it", () => {
    expect(scopeOf(planLine({ membership: "added", categoryIds: ["shopping"] }), nameOf)).toBe(
      "added only",
    );
  });

  it("does not turn an archived category into `every category`", () => {
    /*
      The screen's category list leaves archived ones out, so their names do not resolve.
      A budget watching one archived category watches exactly one thing — calling that
      `every category` would print the very sentence this whole change exists to stop.
    */
    expect(scopeOf(planLine({ categoryIds: ["gone"] }), nameOf)).toBe("1 category");
    expect(scopeOf(planLine({ categoryIds: ["gone", "also-gone"] }), nameOf)).toBe(
      "2 categories",
    );
  });

  it("counts the ones it cannot name among the rest", () => {
    // Two named, two links it cannot resolve: the `+2` is about the links, not about
    // how many of them happened to have a name in hand.
    expect(
      scopeOf(planLine({ categoryIds: ["groceries", "shopping", "gone", "also-gone"] }), nameOf),
    ).toBe("Groceries · Shopping +2");
  });
});

describe("capsCategory", () => {
  it("caps every category when it names none", () => {
    expect(capsCategory(planLine(), "groceries")).toBe(true);
    expect(capsCategory(planLine(), "shopping")).toBe(true);
  });

  it("caps only what it names when it names any", () => {
    const line = planLine({ categoryIds: ["shopping"] });
    expect(capsCategory(line, "shopping")).toBe(true);
    expect(capsCategory(line, "groceries")).toBe(false);
  });

  it("is not a ceiling when it is a savings target", () => {
    expect(capsCategory(planLine({ kind: "savings" }), "groceries")).toBe(false);
  });

  it("is not a ceiling when nothing is swept into it", () => {
    // A hand-kept budget counts an entry only because you filed it there. It says
    // nothing about what a category is allowed.
    expect(capsCategory(planLine({ membership: "added" }), "groceries")).toBe(false);
  });

  it("is not a ceiling with no amount on it", () => {
    expect(capsCategory(planLine({ limitRsd: 0 }), "groceries")).toBe(false);
  });

  it("stops capping once its window is behind us", () => {
    // A holiday that has finished is not a limit on next month's groceries.
    expect(capsCategory(planLine({ ended: true }), "groceries")).toBe(false);
  });
});
