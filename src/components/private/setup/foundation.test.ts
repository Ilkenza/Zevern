import { describe, expect, it } from "vitest";
import { foundationOf } from "./foundation";

const base = {
  accounts: 0,
  expense: 0,
  income: 0,
  earning: false,
  ratesUpdatedOn: null,
  calendarToken: null,
};

/** Everything the rest of the app cannot work without, and nothing else. */
const ready = { ...base, accounts: 2, expense: 10, income: 3, earning: true };

describe("foundationOf", () => {
  it("counts only the four the rest of the app cannot work without", () => {
    const f = foundationOf(base);
    expect(f.total).toBe(4);
    expect(f.done).toBe(0);
    expect(f.ready).toBe(false);
    // Six sections in the index, four of them required.
    expect(f.steps).toHaveLength(6);
  });

  it("is ready once the accounts, both kinds of category and the income exist", () => {
    const f = foundationOf(ready);
    expect(f.done).toBe(4);
    expect(f.ready).toBe(true);
  });

  /**
   * The hole this step was added to close.
   *
   * A category means income *can* be recorded. It does not mean any has been. Before
   * this, the page said three of three done while the app still had no idea what
   * arrived — so every month read as pure loss and nothing on the screen suggested
   * whose fault that was.
   */
  it("is not ready with somewhere to put income but no income in it", () => {
    const f = foundationOf({ ...ready, earning: false });
    expect(f.ready).toBe(false);
    expect(f.steps.find((s) => s.key === "earning")?.done).toBe(false);
  });

  it("takes a standing rule or a booking as the same answer", () => {
    expect(foundationOf({ ...ready, earning: true }).steps.find((s) => s.key === "earning")?.done)
      .toBe(true);
  });

  /**
   * Income categories are required on purpose. Without one there is no way to record
   * money coming in, so the net figure on Money is negative every month — which is a
   * hole people fall into rather than choose.
   */
  it("is not ready with no way to record money coming in", () => {
    const f = foundationOf({ ...ready, income: 0 });
    expect(f.ready).toBe(false);
    expect(f.steps.find((s) => s.key === "income")?.done).toBe(false);
  });

  it("does not hold readiness back over the two optional ones", () => {
    const f = foundationOf({ ...base, accounts: 1, expense: 1, income: 1, earning: true });
    expect(f.ready).toBe(true);
    expect(f.steps.filter((s) => !s.required).map((s) => s.key)).toEqual([
      "rates",
      "calendar",
    ]);
  });

  it("marks the optional two done once they have actually been used", () => {
    const f = foundationOf({
      ...base,
      earning: false,
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
