import { describe, expect, it } from "vitest";
import {
  anchorDayFor,
  DEFAULT_RATES,
  formatRsdShort,
  isGoalKind,
  isTxKind,
  monthKey,
  monthLabel,
  monthNetNote,
  monthRange,
  nextDate,
  rateFor,
  shiftMonth,
  shortMonthLabel,
  toRsd,
} from "./index";

/**
 * `nextDate` is the one function in this file with a bug history — it is what a
 * recurring rule uses to find its next due date, and plain date arithmetic gets it
 * wrong in two different ways. Both of those ways are the first two blocks below.
 */
describe("nextDate", () => {
  it("advances a plain monthly date by one month", () => {
    expect(nextDate("2026-03-14", "month")).toBe("2026-04-14");
    expect(nextDate("2026-12-01", "month")).toBe("2027-01-01");
  });

  it("does not skip a month when the 31st has no counterpart", () => {
    // The bug this exists to prevent: adding one to the month number turns
    // 31 August into 1 October, and September never happens.
    expect(nextDate("2026-08-31", "month")).toBe("2026-09-30");
    expect(nextDate("2026-01-31", "month")).toBe("2026-02-28");
    expect(nextDate("2028-01-31", "month")).toBe("2028-02-29"); // leap year
  });

  it("keeps a month-end date on the month end rather than clamping it once", () => {
    // Without an anchor the date is all there is to go on, so 28 February still reads
    // as month-end. This is the legacy path, kept for rows written before anchors.
    expect(nextDate("2026-02-28", "month")).toBe("2026-03-31");
    expect(nextDate("2026-09-30", "month")).toBe("2026-10-31");
    // …but a 28th that is *not* the month end stays a 28th.
    expect(nextDate("2026-03-28", "month")).toBe("2026-04-28");
  });

  /*
    The bug the anchor exists to kill. Rent due on the 28th walked
    01-28 → 02-28 → 03-31 → 04-30 and stayed month-end for ever, because the guess
    could not tell "the 28th" from "the last day of February". `postRecurring` wrote
    the drifted date back, so one February permanently re-anchored the rule.
  */
  it("does not let February promote a 28th to month-end", () => {
    let on = "2026-01-28";
    const walked: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      on = nextDate(on, "month", 28);
      walked.push(on);
    }
    expect(walked).toEqual([
      "2026-02-28",
      "2026-03-28",
      "2026-04-28",
      "2026-05-28",
      "2026-06-28",
    ]);
  });

  it("clamps an anchored month-end rule and comes back", () => {
    // Anchor 31 is how month-end is written: it gives up days it cannot have and
    // takes them straight back.
    expect(nextDate("2026-01-31", "month", 31)).toBe("2026-02-28");
    expect(nextDate("2026-02-28", "month", 31)).toBe("2026-03-31");
    expect(nextDate("2026-03-31", "month", 31)).toBe("2026-04-30");
    expect(nextDate("2026-04-30", "month", 31)).toBe("2026-05-31");
    expect(nextDate("2028-01-31", "month", 31)).toBe("2028-02-29");
  });

  it("holds the 30th through February instead of losing it", () => {
    // The other half of the same bug: a 30th clamped to 28 in February and then
    // became month-end, so it never returned to the 30th.
    expect(nextDate("2026-01-30", "month", 30)).toBe("2026-02-28");
    expect(nextDate("2026-02-28", "month", 30)).toBe("2026-03-30");
    expect(nextDate("2026-03-30", "month", 30)).toBe("2026-04-30");
    expect(nextDate("2026-04-30", "month", 30)).toBe("2026-05-30");
  });

  it("reads the right anchor off the date a rule starts on", () => {
    // The last day of a short month means "month end" — nobody picks 30 September
    // and means 30 October rather than 31 October.
    expect(anchorDayFor("2026-09-30", "month")).toBe(31);
    expect(anchorDayFor("2026-02-28", "month")).toBe(31);
    expect(anchorDayFor("2026-01-31", "month")).toBe(31);
    // Any other day is itself.
    expect(anchorDayFor("2026-01-28", "month")).toBe(28);
    expect(anchorDayFor("2026-03-14", "month")).toBe(14);
    // A weekly rule has no day of the month at all.
    expect(anchorDayFor("2026-03-14", "week")).toBeNull();
  });

  it("steps a week without touching month logic", () => {
    expect(nextDate("2026-08-28", "week")).toBe("2026-09-04");
    expect(nextDate("2026-12-31", "week")).toBe("2027-01-07");
  });

  it("steps a year, and survives 29 February", () => {
    expect(nextDate("2026-06-15", "year")).toBe("2027-06-15");
    expect(nextDate("2028-02-29", "year")).toBe("2029-02-28");
  });

  it("is stable when walked repeatedly from a month end", () => {
    // Twelve steps from 31 January must land on twelve distinct month ends and
    // arrive back in January — the property the single-step tests imply but do
    // not actually prove.
    let on = "2026-01-31";
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      on = nextDate(on, "month");
      seen.push(on);
    }
    expect(seen).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
      "2027-01-31",
    ]);
  });
});

describe("month keys", () => {
  it("brackets a month, leap year included", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("shifts across a year boundary in both directions", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-08", -6)).toBe("2026-02");
    expect(shiftMonth("2026-08", 0)).toBe("2026-08");
  });

  it("reads a date's own month, in local time", () => {
    expect(monthKey(new Date(2026, 7, 25))).toBe("2026-08");
    expect(monthKey(new Date(2026, 0, 1))).toBe("2026-01");
  });

  it("names a month, and only says the year when it is a different one", () => {
    expect(monthLabel("2026-06")).toBe("June 2026");
    expect(shortMonthLabel("2026-06", "2026-08")).toBe("Jun");
    expect(shortMonthLabel("2027-06", "2026-08")).toBe("Jun 2027");
  });

  it("hands a malformed key back rather than inventing a month", () => {
    expect(monthLabel("nonsense")).toBe("nonsense");
    expect(shortMonthLabel("nonsense", "2026-08")).toBe("nonsense");
  });
});

describe("currency", () => {
  it("leaves RSD alone and converts the others", () => {
    const rates = { EUR: 117.2, USD: 101 };
    expect(rateFor("RSD", rates)).toBe(1);
    expect(toRsd(100, "RSD", rates)).toBe(100);
    expect(toRsd(10, "EUR", rates)).toBe(1172);
    expect(toRsd(10, "USD", rates)).toBe(1010);
  });

  it("falls back to the defaults rather than multiplying by zero", () => {
    // A profile that has never had rates saved reads back as 0, and a rate of 0
    // silently turns every foreign amount into nothing.
    const broken = { EUR: 0, USD: -1 };
    expect(rateFor("EUR", broken)).toBe(DEFAULT_RATES.EUR);
    expect(rateFor("USD", broken)).toBe(DEFAULT_RATES.USD);
  });

  it("rounds to the para rather than carrying float noise", () => {
    expect(toRsd(3, "EUR", { EUR: 117.23456, USD: 101 })).toBe(351.7);
  });
});

describe("formatRsdShort", () => {
  it("compacts thousands with a comma, as Serbian writes it", () => {
    expect(formatRsdShort(128400)).toBe("128k");
    expect(formatRsdShort(12840)).toBe("12,8k");
    expect(formatRsdShort(-12840)).toBe("-12,8k");
  });

  it("leaves small figures whole, and treats nothing as zero", () => {
    expect(formatRsdShort(999)).toBe("999");
    expect(formatRsdShort(null)).toBe("0");
    expect(formatRsdShort(undefined)).toBe("0");
    expect(formatRsdShort(Number.NaN)).toBe("0");
  });
});

describe("vocabulary", () => {
  it("recognises the kinds an entry may be", () => {
    expect(isTxKind("expense")).toBe(true);
    expect(isTxKind("withdraw")).toBe(true);
    expect(isTxKind("donation")).toBe(false);
  });

  it("knows which kinds move money between an account and a goal", () => {
    expect(isGoalKind("saving")).toBe(true);
    expect(isGoalKind("withdraw")).toBe(true);
    expect(isGoalKind("expense")).toBe(false);
    expect(isGoalKind("transfer")).toBe(false);
  });
});

describe("monthNetNote", () => {
  it("says nothing at all when the month is in the black", () => {
    expect(monthNetNote(12000, 90000)).toBeNull();
    expect(monthNetNote(0, 0)).toBeNull();
  });

  /**
   * The case that started this: a month with the salary not entered yet showed
   * "Left over −670" beside "On accounts 149.503", so the app appeared to be arguing
   * with itself. The minus is real, but it is the spending mirrored back off an empty
   * income column — a bookkeeping fact, not a warning.
   */
  it("explains a minus that is only an empty income column, and does not shout", () => {
    expect(monthNetNote(-670, 0)).toEqual({
      text: "No income logged this month",
      tone: "muted",
    });
  });

  it("is red only when money did come in and it still went negative", () => {
    expect(monthNetNote(-670, 90000)).toEqual({
      text: "More went out than came in",
      tone: "danger",
    });
  });
});
