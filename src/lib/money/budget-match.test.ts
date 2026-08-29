import { describe, expect, it } from "vitest";
import {
  canFileInto,
  contributionOf,
  type BudgetMatchPlan,
  type BudgetMatchRow,
} from "./budget-match";

const plan = (over: Partial<BudgetMatchPlan> = {}): BudgetMatchPlan => ({
  id: "b1",
  membership: "all",
  kind: "expense",
  ...over,
});

const row = (over: Partial<BudgetMatchRow> = {}): BudgetMatchRow => ({
  kind: "expense",
  amount_rsd: 1000,
  category_id: "c1",
  account_id: "a1",
  budget_id: null,
  ...over,
});

describe("an all-transactions budget", () => {
  it("counts a plain expense", () => {
    expect(contributionOf(plan(), row())).toBe(1000);
  });

  it("ignores income, which is not what a ceiling is about", () => {
    expect(contributionOf(plan(), row({ kind: "income" }))).toBeNull();
  });

  it("counts everything when nothing is filtered", () => {
    expect(contributionOf(plan(), row({ category_id: null, account_id: null }))).toBe(1000);
  });

  it("keeps to the categories it names", () => {
    const cats = new Set(["c1", "c2"]);
    expect(contributionOf(plan(), row({ category_id: "c2" }), cats)).toBe(1000);
    expect(contributionOf(plan(), row({ category_id: "c9" }), cats)).toBeNull();
    expect(contributionOf(plan(), row({ category_id: null }), cats)).toBeNull();
  });

  it("has to match on both axes when both are named", () => {
    const cats = new Set(["c1"]);
    const accs = new Set(["a2"]);
    expect(contributionOf(plan(), row({ category_id: "c1", account_id: "a2" }), cats, accs)).toBe(1000);
    expect(contributionOf(plan(), row({ category_id: "c1", account_id: "a1" }), cats, accs)).toBeNull();
  });

  /*
    Filed by hand into a trip, and still spending on the category it was in.

    The category says what the money was; the budget says which plan it came out of. A
    dinner on holiday is eating out whether or not a holiday was paying, so both count
    it, and the overlap is reported rather than hidden — see `filed` on the budget line.
  */
  it("counts an entry that was also put in a budget by hand", () => {
    expect(contributionOf(plan(), row({ budget_id: "holiday" }))).toBe(1000);
    expect(contributionOf(plan(), row({ budget_id: "holiday", category_id: null }))).toBe(1000);
  });

  it("still respects the category filter on a filed entry", () => {
    const cats = new Set(["c1"]);
    expect(contributionOf(plan(), row({ budget_id: "holiday", category_id: "c1" }), cats)).toBe(1000);
    expect(contributionOf(plan(), row({ budget_id: "holiday", category_id: "c9" }), cats)).toBeNull();
  });
});

describe("an added-only budget", () => {
  const holiday = plan({ id: "holiday", membership: "added" });

  it("counts what was put in it", () => {
    expect(contributionOf(holiday, row({ budget_id: "holiday" }))).toBe(1000);
  });

  it("counts it whatever category or account it was on", () => {
    // The point of adding by hand: a filter would never gather exactly these.
    const cats = new Set(["nothing-like-it"]);
    expect(contributionOf(holiday, row({ budget_id: "holiday", category_id: "c9" }), cats)).toBe(1000);
  });

  it("ignores everything else, however well it matches", () => {
    expect(contributionOf(holiday, row())).toBeNull();
    expect(contributionOf(holiday, row({ budget_id: "another-trip" }))).toBeNull();
  });
});

describe("a savings budget", () => {
  const saving = plan({ kind: "savings" });

  it("counts income up and spending down, because it measures what is left", () => {
    expect(contributionOf(saving, row({ kind: "income", amount_rsd: 5000 }))).toBe(5000);
    expect(contributionOf(saving, row({ kind: "expense", amount_rsd: 2000 }))).toBe(-2000);
  });

  it("can go backwards, and says so rather than rounding up to nothing", () => {
    const month = [
      row({ kind: "expense", amount_rsd: 3000 }),
      row({ kind: "expense", amount_rsd: 1000 }),
    ];
    const total = month.reduce((sum, r) => sum + (contributionOf(saving, r) ?? 0), 0);
    expect(total).toBe(-4000);
  });
});

describe("an entry with no price yet", () => {
  it("counts for nothing rather than breaking the total", () => {
    expect(contributionOf(plan(), row({ amount_rsd: null }))).toBe(0);
  });
});

/*
  The form's offer and `contributionOf` are one rule read from two places. Anything the
  picker offers has to be something the budget will actually count — a filing that lands
  nowhere is silent, and the entry is excluded from the sweeping budgets as well, so the
  money disappears from budget accounting entirely.
*/
describe("what an entry may be filed into", () => {
  it("lets spending into a spending budget and into a savings one", () => {
    expect(canFileInto("expense", "expense")).toBe(true);
    expect(canFileInto("expense", "savings")).toBe(true);
  });

  it("keeps income out of a spending budget, which would never count it", () => {
    expect(canFileInto("income", "expense")).toBe(false);
    // A savings budget is income less spending, so income is exactly what it measures.
    expect(canFileInto("income", "savings")).toBe(true);
  });

  it("offers nothing to an entry no budget reads", () => {
    for (const kind of ["transfer", "saving", "withdraw", "loan_out", "loan_in"]) {
      expect(canFileInto(kind, "expense")).toBe(false);
      expect(canFileInto(kind, "savings")).toBe(false);
    }
  });

  /* The same pairs, through the function that does the counting. */
  it("agrees with what contributionOf actually counts", () => {
    for (const rowKind of ["expense", "income", "transfer"]) {
      for (const planKind of ["expense", "savings"]) {
        const counted =
          contributionOf(
            plan({ id: "b1", membership: "added", kind: planKind }),
            row({ kind: rowKind, budget_id: "b1", amount_rsd: 100 }),
          ) !== null;
        expect(canFileInto(rowKind, planKind)).toBe(counted);
      }
    }
  });
});

/*
  What is left over is a different question from what a ceiling allows, so it is answered
  from a different set of entries.
*/
describe("a savings budget against money filed elsewhere", () => {
  const savings = plan({ id: "s1", membership: "all", kind: "savings" });

  it("counts spending that was filed into another budget", () => {
    // A holiday dinner still left the account, and the month is poorer for it.
    expect(
      contributionOf(savings, row({ kind: "expense", amount_rsd: 11737, budget_id: "holiday" })),
    ).toBe(-11737);
  });

  it("counts income the same way whether or not it carries a budget", () => {
    expect(contributionOf(savings, row({ kind: "income", amount_rsd: 5000 }))).toBe(5000);
    expect(
      contributionOf(savings, row({ kind: "income", amount_rsd: 5000, budget_id: "x" })),
    ).toBe(5000);
  });

  it("counts it in a spending ceiling too, with the overlap reported rather than hidden", () => {
    const ceiling = plan({ id: "c1", membership: "all", kind: "expense" });
    expect(
      contributionOf(ceiling, row({ kind: "expense", amount_rsd: 11737, budget_id: "holiday" })),
    ).toBe(11737);
  });
});

