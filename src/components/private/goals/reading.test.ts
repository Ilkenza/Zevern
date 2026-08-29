import { describe, expect, it } from "vitest";
import type { GoalLine } from "@/lib/types";
import { daysBetween, isOpen, read } from "./reading";
import { formatRsd, formatRsdExact } from "@/lib/money";

const TODAY = "2026-08-25";

/*
  `progress` follows `saved` unless a case says otherwise.

  Every case here was written when a goal only ever collected, and `saved` was both
  what it held and how far along it was. Those are two facts now — a goal being paid
  off holds nothing and is still making progress — so the fixture keeps the old cases
  honest by deriving one from the other, and a paying case states both.
*/
function goal(overrides: Partial<GoalLine> = {}): GoalLine {
  const base = {
    id: "goal-1",
    user_id: "user-1",
    name: "New laptop",
    target_rsd: 200000,
    target_date: null,
    color: null,
    archived: false,
    completed_at: null,
    sort: 0,
    created_at: "2026-01-01T09:30:00Z",
    saved: 0,
    deposited: 0,
    withdrawn: 0,
    peak: 0,
    movements: 0,
    entries: [],
    lastAccountId: null,
    paying: false,
    ...overrides,
  } as GoalLine;
  return { ...base, progress: base.progress ?? base.saved } as GoalLine;
}

describe("a goal that is being paid off", () => {
  const debt = (over: Partial<GoalLine> = {}) =>
    goal({ paying: true, saved: 0, name: "Laptop instalments", target_rsd: 60000, ...over });

  it("counts what has been paid, not what is held", () => {
    const r = read(debt({ progress: 25000 }), TODAY, formatRsd);
    expect(r.pct).toBeCloseTo(25000 / 60000, 4);
    expect(r.note).toContain("left to pay");
    expect(r.done).toBe(false);
  });

  it("is paid off, not reached", () => {
    const r = read(debt({ progress: 60000 }), TODAY, formatRsd);
    expect(r.done).toBe(true);
    expect(r.badge?.label).toBe("Paid off");
    expect(r.note).toContain("is paid");
    expect(r.note).not.toContain("is there");
  });

  it("says how much was overpaid", () => {
    const r = read(debt({ progress: 62000 }), TODAY, formatRsd);
    expect(r.done).toBe(true);
    expect(r.note).toContain("over");
  });

  it("asks to clear it rather than to make it", () => {
    const r = read(debt({ progress: 10000, target_date: "2027-08-25" }), TODAY, formatRsd);
    expect(r.pace).toContain("to clear it");
    expect(r.pace).not.toContain("to make it");
  });

  it("counts what goes out when there is no amount set", () => {
    const r = read(debt({ target_rsd: 0, progress: 5000 }), TODAY, formatRsd);
    expect(r.pct).toBeNull();
    expect(r.note).toContain("goes out");
  });

  it("runs the same arithmetic as a goal that collects", () => {
    const a = read(goal({ saved: 50000 }), TODAY, formatRsd);
    const b = read(debt({ progress: 50000, target_rsd: 200000 }), TODAY, formatRsd);
    expect(b.pct).toBe(a.pct);
    expect(b.done).toBe(a.done);
  });
});

describe("daysBetween", () => {
  it("counts whole days, and ignores the time on a timestamp", () => {
    expect(daysBetween("2026-08-25", "2026-09-01")).toBe(7);
    expect(daysBetween("2026-08-25T23:59:00Z", "2026-08-26T00:01:00Z")).toBe(1);
  });

  it("goes negative when the second date is behind the first", () => {
    expect(daysBetween("2026-08-25", "2026-08-20")).toBe(-5);
  });

  it("is null rather than NaN for something that is not a date", () => {
    expect(daysBetween("not-a-date", "2026-08-25")).toBeNull();
  });
});

describe("read", () => {
  it("says a goal is reached once it holds the target", () => {
    const r = read(goal({ saved: 200000 }), TODAY, formatRsd);
    expect(r.done).toBe(true);
    expect(r.pct).toBe(1);
    expect(r.badge).toEqual({ status: "ok", label: "Reached" });
  });

  it("names the overshoot rather than hiding it", () => {
    const r = read(goal({ saved: 230000 }), TODAY, formatRsd);
    expect(r.done).toBe(true);
    expect(r.note).toContain("over");
  });

  it("has no progress at all without a target", () => {
    const r = read(goal({ target_rsd: 0, saved: 50000 }), TODAY, formatRsd);
    expect(r.pct).toBeNull();
    expect(r.done).toBe(false);
    expect(r.badge).toBeNull();
  });

  it("reports what is left against the target", () => {
    const r = read(goal({ saved: 50000 }), TODAY, formatRsd);
    expect(r.pct).toBeCloseTo(0.25);
    expect(r.done).toBe(false);
  });

  it("flags a target date that has gone past", () => {
    const r = read(goal({ saved: 50000, target_date: "2026-08-20" }), TODAY, formatRsd);
    expect(r.badge).toEqual({ status: "danger", label: "Date passed" });
    expect(r.pace).toBe("5 days ago");
  });

  it("says today rather than nought days", () => {
    const r = read(goal({ saved: 50000, target_date: TODAY }), TODAY, formatRsd);
    expect(r.badge).toEqual({ status: "active", label: "Due today" });
    expect(r.pace).toBe("today");
  });

  it("picks the unit that fits the time left", () => {
    // Far out: a monthly figure. Close in: a weekly one. Very close: just the days,
    // because "38.000 a week" is not advice anyone can act on with nine days left.
    expect(read(goal({ saved: 0, target_date: "2027-08-25" }), TODAY, formatRsd).pace).toContain("a month");
    expect(read(goal({ saved: 0, target_date: "2026-09-24" }), TODAY, formatRsd).pace).toContain("a week");
    expect(read(goal({ saved: 0, target_date: "2026-09-01" }), TODAY, formatRsd).pace).toBe("7 days left");
  });

  /**
   * The pace verdict is the one thing on the card that makes a claim about the
   * future, so it stays quiet until it has grounds.
   */
  describe("the pace badge", () => {
    it("stays silent with less than a fortnight of history", () => {
      const r = read(
        goal({ saved: 10000, created_at: "2026-08-20T00:00:00Z", target_date: "2026-12-01" }),
        TODAY,
        formatRsd,
      );
      expect(r.badge).toBeNull();
    });

    it("stays silent when nothing has been put aside yet", () => {
      const r = read(
        goal({ saved: 0, created_at: "2026-01-01T00:00:00Z", target_date: "2026-12-01" }),
        TODAY,
        formatRsd,
      );
      expect(r.badge).toBeNull();
    });

    it("says on track when the rate so far covers what is left", () => {
      // 236 days in, 180.000 saved of 200.000, and 98 days to find 20.000.
      const r = read(
        goal({ saved: 180000, created_at: "2026-01-01T00:00:00Z", target_date: "2026-12-01" }),
        TODAY,
        formatRsd,
      );
      expect(r.badge).toEqual({ status: "ok", label: "On track" });
    });

    it("says behind pace when it does not", () => {
      const r = read(
        goal({ saved: 20000, created_at: "2026-01-01T00:00:00Z", target_date: "2026-10-01" }),
        TODAY,
        formatRsd,
      );
      expect(r.badge).toEqual({ status: "active", label: "Behind pace" });
    });
  });
});

describe("isOpen", () => {
  it("reads the closed date alone, never the archive flag", () => {
    // A goal still holding money back has to keep reserving it, whatever else has
    // been done to it — this is the same test the account balances apply.
    expect(isOpen(goal())).toBe(true);
    expect(isOpen(goal({ archived: true }))).toBe(true);
    expect(isOpen(goal({ completed_at: "2026-08-01" }))).toBe(false);
  });
});

describe("what a month has to look like", () => {
  /*
    The figure has one job: pay that much, that often, and the goal is clear on the day.
    It used to divide by a fraction of a month — 126 days is 4.14 of them — so four
    payments of what it said left you thousands short on the due date.
  */
  it("divides by the payments left, not by a fraction of a month", () => {
    const r = read(
      goal({ target_rsd: 123105.92, saved: 0, target_date: "2027-01-01" }),
      "2026-08-28",
      formatRsd,
      formatRsdExact,
    );
    // 126 days is four whole months of payments, and 123.105,92 / 4 is 30.776,48 —
    // printed to the para, because it is a figure you are meant to act on.
    expect(r.pace).toContain("30.776,48");
  });

  it("clears the goal when you actually pay it", () => {
    const target = 123105.92;
    const months = Math.floor(126 / 30.44);
    expect(months).toBe(4);
    const per = Math.ceil((target / months) * 100) / 100;
    expect(per).toBe(30776.48);
    expect(per * months).toBeGreaterThanOrEqual(target);
  });
});
