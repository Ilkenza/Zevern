import { describe, expect, it } from "vitest";
import type { GoalLine } from "@/lib/types";
import { daysBetween, isOpen, read } from "./reading";

const TODAY = "2026-08-25";

function goal(overrides: Partial<GoalLine> = {}): GoalLine {
  return {
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
    ...overrides,
  } as GoalLine;
}

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
    const r = read(goal({ saved: 200000 }), TODAY);
    expect(r.done).toBe(true);
    expect(r.pct).toBe(1);
    expect(r.badge).toEqual({ status: "ok", label: "Reached" });
  });

  it("names the overshoot rather than hiding it", () => {
    const r = read(goal({ saved: 230000 }), TODAY);
    expect(r.done).toBe(true);
    expect(r.note).toContain("over");
  });

  it("has no progress at all without a target", () => {
    const r = read(goal({ target_rsd: 0, saved: 50000 }), TODAY);
    expect(r.pct).toBeNull();
    expect(r.done).toBe(false);
    expect(r.badge).toBeNull();
  });

  it("reports what is left against the target", () => {
    const r = read(goal({ saved: 50000 }), TODAY);
    expect(r.pct).toBeCloseTo(0.25);
    expect(r.done).toBe(false);
  });

  it("flags a target date that has gone past", () => {
    const r = read(goal({ saved: 50000, target_date: "2026-08-20" }), TODAY);
    expect(r.badge).toEqual({ status: "danger", label: "Date passed" });
    expect(r.pace).toBe("5 days ago");
  });

  it("says today rather than nought days", () => {
    const r = read(goal({ saved: 50000, target_date: TODAY }), TODAY);
    expect(r.badge).toEqual({ status: "active", label: "Due today" });
    expect(r.pace).toBe("today");
  });

  it("picks the unit that fits the time left", () => {
    // Far out: a monthly figure. Close in: a weekly one. Very close: just the days,
    // because "38.000 a week" is not advice anyone can act on with nine days left.
    expect(read(goal({ saved: 0, target_date: "2027-08-25" }), TODAY).pace).toContain("a month");
    expect(read(goal({ saved: 0, target_date: "2026-09-24" }), TODAY).pace).toContain("a week");
    expect(read(goal({ saved: 0, target_date: "2026-09-01" }), TODAY).pace).toBe("7 days left");
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
      );
      expect(r.badge).toBeNull();
    });

    it("stays silent when nothing has been put aside yet", () => {
      const r = read(
        goal({ saved: 0, created_at: "2026-01-01T00:00:00Z", target_date: "2026-12-01" }),
        TODAY,
      );
      expect(r.badge).toBeNull();
    });

    it("says on track when the rate so far covers what is left", () => {
      // 236 days in, 180.000 saved of 200.000, and 98 days to find 20.000.
      const r = read(
        goal({ saved: 180000, created_at: "2026-01-01T00:00:00Z", target_date: "2026-12-01" }),
        TODAY,
      );
      expect(r.badge).toEqual({ status: "ok", label: "On track" });
    });

    it("says behind pace when it does not", () => {
      const r = read(
        goal({ saved: 20000, created_at: "2026-01-01T00:00:00Z", target_date: "2026-10-01" }),
        TODAY,
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
