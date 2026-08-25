import { describe, expect, it } from "vitest";
import { foundationOf } from "./foundation";

const base = { accounts: 0, expense: 0, income: 0, ratesUpdatedOn: null, calendarToken: null };

describe("foundationOf", () => {
  it("counts only the three the rest of the app cannot work without", () => {
    const f = foundationOf(base);
    expect(f.total).toBe(3);
    expect(f.done).toBe(0);
    expect(f.ready).toBe(false);
    // Five sections in the index, three of them required.
    expect(f.steps).toHaveLength(5);
  });

  it("is ready once accounts and both kinds of category exist", () => {
    const f = foundationOf({ ...base, accounts: 2, expense: 10, income: 3 });
    expect(f.done).toBe(3);
    expect(f.ready).toBe(true);
  });

  /**
   * Income categories are required on purpose. Without one there is no way to record
   * money coming in, so the net figure on Money is negative every month — which is a
   * hole people fall into rather than choose.
   */
  it("is not ready with no way to record money coming in", () => {
    const f = foundationOf({ ...base, accounts: 2, expense: 10, income: 0 });
    expect(f.ready).toBe(false);
    expect(f.steps.find((s) => s.key === "income")?.done).toBe(false);
  });

  it("does not hold readiness back over the two optional ones", () => {
    const f = foundationOf({ ...base, accounts: 1, expense: 1, income: 1 });
    expect(f.ready).toBe(true);
    expect(f.steps.filter((s) => !s.required).map((s) => s.key)).toEqual([
      "rates",
      "calendar",
    ]);
  });

  it("marks the optional two done once they have actually been used", () => {
    const f = foundationOf({
      ...base,
      ratesUpdatedOn: "2026-08-25",
      calendarToken: "a".repeat(32),
    });
    expect(f.steps.find((s) => s.key === "rates")?.done).toBe(true);
    expect(f.steps.find((s) => s.key === "calendar")?.done).toBe(true);
    // …and still says nothing about being ready.
    expect(f.ready).toBe(false);
  });

  it("gives every step an anchor the index can jump to", () => {
    const ids = foundationOf(base).steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("setup-"))).toBe(true);
  });
});
