import { describe, expect, it } from "vitest";
import { sumEntries } from "./summary";
import { UNCATEGORIZED_CATEGORY_ID } from "./index";

/*
  This file is the reason the sum was pulled out of the two screens that ran it.

  Both ends of the money screen add the same entries up — the server for the whole span,
  the browser for whatever a filter has left standing — and while that arithmetic was
  written twice, nothing here could hold either copy to the other. Now there is one, and
  what it must do is written down: which kinds count where, what a missing price is worth,
  and which of the four figures a goal deposit is allowed to move.
*/

const e = (kind: string, amount: number | string | null, category_id?: string | null) => ({
  kind,
  amount_rsd: amount,
  category_id,
});

describe("sumEntries", () => {
  it("adds nothing up to zeroes rather than to NaN", () => {
    expect(sumEntries([])).toEqual({
      expense: 0,
      income: 0,
      saved: 0,
      withdrawn: 0,
      net: 0,
      byCategory: [],
    });
  });

  it("keeps the four kinds apart", () => {
    const totals = sumEntries([
      e("expense", 1000, "food"),
      e("income", 4000),
      e("saving", 500),
      e("withdraw", 200),
    ]);
    expect(totals.expense).toBe(1000);
    expect(totals.income).toBe(4000);
    expect(totals.withdrawn).toBe(200);
    expect(totals.saved).toBe(300);
  });

  it("leaves what was put aside out of net", () => {
    // A month with one small purchase and one big deposit is not a spending spree.
    const totals = sumEntries([e("expense", 500, "food"), e("saving", 60_000)]);
    expect(totals.net).toBe(-500);
    expect(totals.saved).toBe(60_000);
  });

  it("counts an entry with no price yet as nothing", () => {
    const totals = sumEntries([e("expense", null, "food"), e("expense", 250, "food")]);
    expect(totals.expense).toBe(250);
    expect(totals.byCategory).toEqual([{ id: "food", spent: 250 }]);
  });

  it("reads a price that arrives as a string", () => {
    // PostgREST hands numerics back as strings, so this is the shape a real row has.
    expect(sumEntries([e("expense", "1250.50", "food")]).expense).toBe(1250.5);
  });

  it("gathers spending by category, and files the categoryless together", () => {
    const totals = sumEntries([
      e("expense", 100, "food"),
      e("expense", 250, "food"),
      e("expense", 70, null),
      e("expense", 30),
      e("income", 900, "food"),
    ]);
    expect(new Map(totals.byCategory.map((c) => [c.id, c.spent]))).toEqual(
      new Map([
        ["food", 350],
        [UNCATEGORIZED_CATEGORY_ID, 100],
      ]),
    );
  });

  it("keeps income out of the category breakdown", () => {
    expect(sumEntries([e("income", 900, "salary")]).byCategory).toEqual([]);
  });

  it("ignores a kind it does not know", () => {
    // A transfer moves money between two of your own accounts; it is not spending.
    const totals = sumEntries([e("transfer", 5000, null), e("expense", 100, "food")]);
    expect(totals).toMatchObject({ expense: 100, income: 0, saved: 0, net: -100 });
  });

  it("gives the same answer over a span as over its parts added together", () => {
    const first = [e("expense", 100, "food"), e("income", 500)];
    const second = [e("expense", 40, "fuel"), e("saving", 60), e("withdraw", 10)];
    const whole = sumEntries([...first, ...second]);
    const halves = [sumEntries(first), sumEntries(second)];
    expect(whole.expense).toBe(halves[0].expense + halves[1].expense);
    expect(whole.income).toBe(halves[0].income + halves[1].income);
    expect(whole.saved).toBe(halves[0].saved + halves[1].saved);
    expect(whole.net).toBe(halves[0].net + halves[1].net);
  });
});
