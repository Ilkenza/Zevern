import { describe, expect, it } from "vitest";
import { anchorDayFor, monthlyDayFrom, nextDate, nextMonthlyOn } from "@/lib/money";

/*
  The setup run asks "what day of the month?" and gets a number typed into a box. These
  two turn that number into the pair of columns a recurring rule is made of — the date it
  first lands on, and the day it belongs to for ever after. Everything here is a case
  where those two want to disagree.
*/

describe("monthlyDayFrom", () => {
  it("takes a day somebody typed", () => {
    expect(monthlyDayFrom("15")).toBe(15);
    expect(monthlyDayFrom(" 1 ")).toBe(1);
    expect(monthlyDayFrom("31")).toBe(31);
    expect(monthlyDayFrom(7)).toBe(7);
  });

  it("treats nothing typed as nothing said, not as the first", () => {
    expect(monthlyDayFrom("")).toBeNull();
    expect(monthlyDayFrom("   ")).toBeNull();
    expect(monthlyDayFrom(null)).toBeNull();
    expect(monthlyDayFrom(undefined)).toBeNull();
  });

  it("refuses a day no month has", () => {
    expect(monthlyDayFrom("0")).toBeNull();
    expect(monthlyDayFrom("32")).toBeNull();
    expect(monthlyDayFrom("-5")).toBeNull();
    expect(monthlyDayFrom("later")).toBeNull();
  });

  it("drops the fraction rather than the line", () => {
    expect(monthlyDayFrom("15.7")).toBe(15);
  });
});

describe("nextMonthlyOn", () => {
  it("lands this month when the day has not gone yet", () => {
    expect(nextMonthlyOn(25, "2026-09-20")).toBe("2026-09-25");
  });

  it("counts today as not gone — a bill due today is due today", () => {
    expect(nextMonthlyOn(20, "2026-09-20")).toBe("2026-09-20");
  });

  it("rolls into next month once the day has passed", () => {
    expect(nextMonthlyOn(5, "2026-09-20")).toBe("2026-10-05");
  });

  it("rolls into next year from December", () => {
    expect(nextMonthlyOn(5, "2026-12-20")).toBe("2027-01-05");
  });

  it("clamps a 31st to the end of a thirty-day month", () => {
    expect(nextMonthlyOn(31, "2026-09-01")).toBe("2026-09-30");
  });

  it("clamps to the end of February, and knows a leap year from a common one", () => {
    expect(nextMonthlyOn(30, "2026-02-01")).toBe("2026-02-28");
    expect(nextMonthlyOn(30, "2028-02-01")).toBe("2028-02-29");
  });

  it("clamps after rolling forward, not before", () => {
    // Typed 30 on the 31st of January: January is done with, so it is February's end.
    expect(nextMonthlyOn(30, "2026-01-31")).toBe("2026-02-28");
  });

  it("means today when no day was given", () => {
    expect(nextMonthlyOn(null, "2026-09-20")).toBe("2026-09-20");
  });
});

/*
  The pair, which is the part that actually went wrong.

  `anchorDayFor` promotes the last day of a short month to 31, because a rule built from
  30 September means month-end. That reading is right for a date somebody picked off a
  calendar and wrong for a number they typed — so the typed number is kept as the anchor,
  and these check that the months after the first one land where the person said.
*/
describe("the day typed survives the first month", () => {
  it("keeps the 30th on the 30th, where reading it back off the date would not", () => {
    const first = nextMonthlyOn(30, "2026-09-20");
    expect(first).toBe("2026-09-30");

    // What the date alone says — month-end, so the 31st from October on.
    expect(anchorDayFor(first, "month")).toBe(31);
    expect(nextDate(first, "month", anchorDayFor(first, "month"))).toBe("2026-10-31");

    // What the person typed, which is the one that is stored.
    expect(nextDate(first, "month", 30)).toBe("2026-10-30");
    expect(nextDate("2026-10-30", "month", 30)).toBe("2026-11-30");
  });

  it("keeps a 31st coming back to the 31st after a short month", () => {
    const first = nextMonthlyOn(31, "2026-09-01");
    expect(first).toBe("2026-09-30");
    expect(nextDate(first, "month", 31)).toBe("2026-10-31");
    expect(nextDate("2027-01-31", "month", 31)).toBe("2027-02-28");
    expect(nextDate("2027-02-28", "month", 31)).toBe("2027-03-31");
  });

  it("falls back to reading the date when nothing was typed", () => {
    const first = nextMonthlyOn(null, "2026-09-12");
    expect(first).toBe("2026-09-12");
    expect(anchorDayFor(first, "month")).toBe(12);
  });
});
