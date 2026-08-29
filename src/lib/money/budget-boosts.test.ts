import { describe, expect, it } from "vitest";
import { boostFor, boostNote, overlaps, type Boost } from "./budget-boosts";

/** The trip this whole feature was designed around: 28 Aug – 6 Sep, +5.000 on Groceries. */
const sea: Boost = { from: "2026-08-28", to: "2026-09-06", amount: 5000, source: "na moru" };

const AUGUST = { from: "2026-08-01", to: "2026-08-31" };
const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" };
const OCTOBER = { from: "2026-10-01", to: "2026-10-31" };
const JULY = { from: "2026-07-01", to: "2026-07-31" };

const fmt = (v: number) => new Intl.NumberFormat("sr-RS").format(Math.round(v));

describe("whether a trip falls in a window", () => {
  it("counts a window the trip starts in, ends in, or sits inside", () => {
    expect(overlaps(AUGUST, sea)).toBe(true);
    expect(overlaps(SEPTEMBER, sea)).toBe(true);
    expect(overlaps({ from: "2026-08-29", to: "2026-08-30" }, sea)).toBe(true);
  });

  it("does not count a window the trip merely touches the edge of", () => {
    expect(overlaps(JULY, sea)).toBe(false);
    expect(overlaps(OCTOBER, sea)).toBe(false);
  });

  /*
    Both ends are inclusive, and a trip of one day is a real thing. Off by one here means
    a budget that quietly does or does not get raised on the boundary day, which is
    exactly the sort of error nobody ever notices.
  */
  it("counts a single shared day at either end", () => {
    expect(overlaps({ from: "2026-08-28", to: "2026-08-28" }, sea)).toBe(true);
    expect(overlaps({ from: "2026-09-06", to: "2026-09-06" }, sea)).toBe(true);
    expect(overlaps({ from: "2026-08-27", to: "2026-08-27" }, sea)).toBe(false);
    expect(overlaps({ from: "2026-09-07", to: "2026-09-07" }, sea)).toBe(false);
  });
});

describe("what a window is allowed on top of its own amount", () => {
  it("gives the full amount to every month the trip touches", () => {
    expect(boostFor(AUGUST, [sea])).toEqual({ extra: 5000, sources: ["na moru"] });
    expect(boostFor(SEPTEMBER, [sea])).toEqual({ extra: 5000, sources: ["na moru"] });
  });

  /*
    The trade this design makes, written down as a test so nobody "fixes" it by accident.
    Ten days across a month boundary grant 10.000 in total, not 5.000. Splitting by day
    was rejected: a day is not the unit eating out is spent in, and a figure on the card
    that differs from the figure that was typed cannot be reconstructed later.
  */
  it("grants twice over when the trip crosses the first of the month, on purpose", () => {
    const total = boostFor(AUGUST, [sea]).extra + boostFor(SEPTEMBER, [sea]).extra;
    expect(total).toBe(10000);
  });

  it("gives nothing to a month the trip is nowhere near", () => {
    expect(boostFor(OCTOBER, [sea])).toEqual({ extra: 0, sources: [] });
    expect(boostFor(JULY, [sea])).toEqual({ extra: 0, sources: [] });
  });

  it("adds up two trips in the same month and names both, earliest first", () => {
    const wedding: Boost = { from: "2026-08-15", to: "2026-08-16", amount: 3000, source: "svadba" };
    expect(boostFor(AUGUST, [sea, wedding])).toEqual({
      extra: 8000,
      sources: ["svadba", "na moru"],
    });
  });

  it("has nothing to say when there are no trips at all", () => {
    expect(boostFor(AUGUST, [])).toEqual({ extra: 0, sources: [] });
  });

  /*
    The failure this whole design exists to avoid.

    A boost tied to "is the trip running right now" disappears on 7 September, and August —
    finished, unchangeable, and inside its limit while it was being lived — becomes an
    overspend. The answer here is a property of the dates, so asking on any day gives the
    same answer.
  */
  it("answers the same on every day, before, during and long after the trip", () => {
    const answers = ["2026-08-01", "2026-08-28", "2026-09-06", "2026-09-07", "2027-03-01"].map(
      () => boostFor(AUGUST, [sea]).extra,
    );
    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toBe(5000);
  });

  it("ignores an amount that is not a number rather than poisoning the total", () => {
    const broken = { ...sea, amount: Number.NaN };
    expect(boostFor(AUGUST, [broken]).extra).toBe(0);
  });
});

describe("the line that explains where the extra came from", () => {
  it("names the one trip that granted it", () => {
    expect(boostNote(boostFor(AUGUST, [sea]), fmt)).toBe("+5.000 — na moru");
  });

  it("names both when two granted it", () => {
    const wedding: Boost = { from: "2026-08-15", to: "2026-08-16", amount: 3000, source: "svadba" };
    expect(boostNote(boostFor(AUGUST, [sea, wedding]), fmt)).toBe("+8.000 — svadba and na moru");
  });

  it("says nothing when nothing was granted", () => {
    expect(boostNote(boostFor(OCTOBER, [sea]), fmt)).toBeNull();
  });
});
