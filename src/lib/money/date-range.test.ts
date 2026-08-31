import { describe, expect, it } from "vitest";
import { isRangeKey, RANGE_OPTIONS, rangeFor, type RangeKey } from "./date-range";

describe("rangeFor", () => {
  it("counts today as one of the last seven days", () => {
    // Today and the six behind it. Seven days that include today is a week; today and
    // seven behind it is eight days wearing a week's label.
    expect(rangeFor("d7", "2026-08-29")).toEqual({ from: "2026-08-23", to: "2026-08-29" });
  });

  it("walks back over a month boundary", () => {
    expect(rangeFor("d30", "2026-03-05")).toEqual({ from: "2026-02-04", to: "2026-03-05" });
  });

  it("walks back over a leap day", () => {
    // 2024 is a leap year: thirty days back from 5 March crosses 29 February.
    expect(rangeFor("d30", "2024-03-05")).toEqual({ from: "2024-02-05", to: "2024-03-05" });
  });

  it("clamps three months back to the end of a shorter month", () => {
    // Not 3 March. `setUTCMonth` alone rolls 31 February forward and quietly hands back
    // a span three months and three days long.
    expect(rangeFor("m3", "2026-05-31")).toEqual({ from: "2026-02-28", to: "2026-05-31" });
    expect(rangeFor("m3", "2024-05-31")).toEqual({ from: "2024-02-29", to: "2024-05-31" });
  });

  it("clamps six months back the same way three does", () => {
    expect(rangeFor("m6", "2026-08-31")).toEqual({ from: "2026-02-28", to: "2026-08-31" });
    expect(rangeFor("m6", "2026-05-15")).toEqual({ from: "2025-11-15", to: "2026-05-15" });
  });

  it("crosses the year going back three months", () => {
    expect(rangeFor("m3", "2026-01-15")).toEqual({ from: "2025-10-15", to: "2026-01-15" });
  });

  it("starts the year on the first of January", () => {
    expect(rangeFor("ytd", "2026-08-29")).toEqual({ from: "2026-01-01", to: "2026-08-29" });
  });

  it("answers a calendar month, ends included", () => {
    expect(rangeFor("month", "2026-08-29")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(rangeFor("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    // A leap February ends on the 29th, which is the case a hardcoded 28 gets wrong.
    expect(rangeFor("month", "2024-02-10")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });

  it("recognises only the spans it offers", () => {
    for (const { value } of RANGE_OPTIONS) expect(isRangeKey(value)).toBe(true);
    expect(isRangeKey("last-tuesday")).toBe(false);
    expect(isRangeKey(undefined)).toBe(false);
    expect(isRangeKey("")).toBe(false);
  });

  it("leaves both ends open for all time and for custom", () => {
    expect(rangeFor("all", "2026-08-29")).toEqual({ from: "", to: "" });
    // Custom's answer lives in the two pickers, so the span itself bounds nothing.
    expect(rangeFor("custom", "2026-08-29")).toEqual({ from: "", to: "" });
  });

  it("never hands back a span that runs backwards", () => {
    const today = "2026-08-29";
    for (const { value } of RANGE_OPTIONS) {
      const { from, to } = rangeFor(value, today);
      if (from && to) expect(from <= to).toBe(true);
    }
  });

  it("offers every key exactly once", () => {
    const keys = RANGE_OPTIONS.map((o) => o.value);
    expect(new Set(keys).size).toBe(keys.length);
    const every: RangeKey[] = ["month", "d7", "d30", "m3", "m6", "ytd", "all", "custom"];
    expect(keys.sort()).toEqual(every.sort());
  });
});
