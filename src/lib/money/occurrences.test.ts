import { describe, expect, it } from "vitest";
import type { RecurringRow } from "@/lib/types";
import {
  PER_MONTH,
  capFor,
  feedsGoal,
  loanCapFor,
  median,
  nextDay,
  occurrencesFor,
} from "./occurrences";

/**
 * A rule with everything filled in, so each test can say only what it is about.
 * The defaults are the ordinary case: an active monthly bill with no end and no
 * instalment plan.
 */
function rule(overrides: Partial<RecurringRow> = {}): RecurringRow {
  return {
    id: "rule-1",
    user_id: "user-1",
    name: "Hosting",
    kind: "expense",
    account_id: null,
    category_id: null,
    amount: 1200,
    currency: "RSD",
    variable: false,
    every: "month",
    next_on: "2026-01-15",
    active: true,
    ends_on: null,
    installments_total: null,
    installments_done: 0,
    goal_id: null,
    loan_id: null,
    created_at: "2025-01-01T00:00:00Z",
    category: null,
    account: null,
    goal: null,
    loan: null,
    ...overrides,
  } as RecurringRow;
}

const dates = (rows: { on: string }[]) => rows.map((r) => r.on);

describe("occurrencesFor", () => {
  it("walks every date inside the horizon and stops at it", () => {
    const out = occurrencesFor(rule(), 1200, false, "2026-04-30");
    expect(dates(out)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
  });

  it("includes an occurrence landing exactly on the horizon", () => {
    // The horizon is inclusive. Off by one here and the last bill of a window
    // silently disappears from every total that uses it.
    const out = occurrencesFor(rule(), 1200, false, "2026-03-15");
    expect(dates(out)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("returns nothing for a rule that is switched off", () => {
    expect(occurrencesFor(rule({ active: false }), 1200, false, "2026-12-31")).toEqual([]);
  });

  it("returns nothing when the first date is already past the horizon", () => {
    expect(occurrencesFor(rule({ next_on: "2027-01-01" }), 1200, false, "2026-12-31")).toEqual([]);
  });

  /**
   * The reason this function exists rather than a multiplier: a four-instalment
   * credit must count four times in a yearly total, not twelve.
   */
  describe("instalments", () => {
    it("stops after the instalments that are left", () => {
      const out = occurrencesFor(
        rule({ installments_total: 4, installments_done: 0 }),
        5000,
        false,
        "2026-12-31",
      );
      expect(dates(out)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
    });

    it("counts only what has not been paid yet", () => {
      const out = occurrencesFor(
        rule({ installments_total: 4, installments_done: 3 }),
        5000,
        false,
        "2026-12-31",
      );
      expect(dates(out)).toEqual(["2026-01-15"]);
    });

    it("returns nothing once the plan is finished", () => {
      const out = occurrencesFor(
        rule({ installments_total: 4, installments_done: 4 }),
        5000,
        false,
        "2026-12-31",
      );
      expect(out).toEqual([]);
    });

    it("treats an overpaid plan as finished rather than going backwards", () => {
      const out = occurrencesFor(
        rule({ installments_total: 4, installments_done: 9 }),
        5000,
        false,
        "2026-12-31",
      );
      expect(out).toEqual([]);
    });
  });

  describe("end date", () => {
    it("stops at the end date even when the horizon is further out", () => {
      const out = occurrencesFor(rule({ ends_on: "2026-03-20" }), 1200, false, "2026-12-31");
      expect(dates(out)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
    });

    it("includes an occurrence falling exactly on the end date", () => {
      const out = occurrencesFor(rule({ ends_on: "2026-03-15" }), 1200, false, "2026-12-31");
      expect(dates(out)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
    });

    it("returns nothing when the end date is already behind the first occurrence", () => {
      const out = occurrencesFor(rule({ ends_on: "2025-12-31" }), 1200, false, "2026-12-31");
      expect(out).toEqual([]);
    });
  });

  it("carries the month-end rule through the whole walk", () => {
    // The same trap as `nextDate`, but seen from where it actually bites: a bill on
    // the 31st must produce twelve occurrences, not six.
    const out = occurrencesFor(rule({ next_on: "2026-01-31" }), 1200, false, "2026-06-30");
    expect(dates(out)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
    ]);
  });

  it("walks weekly and yearly rules by their own interval", () => {
    expect(dates(occurrencesFor(rule({ every: "week" }), 300, false, "2026-02-05"))).toEqual([
      "2026-01-15",
      "2026-01-22",
      "2026-01-29",
      "2026-02-05",
    ]);
    expect(dates(occurrencesFor(rule({ every: "year" }), 9000, false, "2028-12-31"))).toEqual([
      "2026-01-15",
      "2027-01-15",
      "2028-01-15",
    ]);
  });

  it("takes a goal's colour over a category's, and reports the goal by name", () => {
    const [first] = occurrencesFor(
      rule({
        goal_id: "goal-1",
        goal: { name: "New laptop", color: "#5fb88a" },
        category: { name: "Savings", color: "#de6b5e" },
      }),
      4000,
      false,
      "2026-01-31",
    );
    expect(first.color).toBe("#5fb88a");
    expect(first.goal).toBe("New laptop");
    expect(first.category).toBe("Savings");
  });

  it("marks every line with the amount, the estimate flag and its samples", () => {
    const samples = [{ on: "2025-12-15", amount: 3100 }];
    const out = occurrencesFor(rule({ variable: true }), 2950, true, "2026-02-28", samples);
    expect(out).toHaveLength(2);
    for (const line of out) {
      expect(line.source).toBe("recurring");
      expect(line.amount).toBe(2950);
      expect(line.estimated).toBe(true);
      expect(line.samples).toEqual(samples);
      expect(line.days).toBe(0);
    }
  });

  it("cannot run away on a horizon far beyond any sane window", () => {
    // No end date, no instalments, a weekly rule and a century of horizon: the
    // internal step guard is the only thing between this and an unbounded loop.
    const out = occurrencesFor(rule({ every: "week" }), 100, false, "2126-01-01");
    expect(out.length).toBe(400);
  });
});

describe("median", () => {
  it("takes the middle of an odd list", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("takes the mean of the two middles of an even list", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("is zero for an empty list", () => {
    expect(median([])).toBe(0);
  });

  it("does not reorder what it was given", () => {
    const input = [5, 1, 3];
    median(input);
    expect(input).toEqual([5, 1, 3]);
  });

  it("resists the outlier a mean would not", () => {
    // Six ordinary months and one with a laptop in it. The mean says 55.000; the
    // median says what a month actually costs.
    expect(median([40000, 42000, 38000, 41000, 39000, 250000])).toBe(40500);
  });
});

describe("nextDay", () => {
  it("steps one day, across months and years", () => {
    expect(nextDay("2026-01-15")).toBe("2026-01-16");
    expect(nextDay("2026-01-31")).toBe("2026-02-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
  });
});

describe("feedsGoal", () => {
  it("is true only when the rule names a goal", () => {
    expect(feedsGoal({ goal_id: "goal-1" })).toBe(true);
    expect(feedsGoal({ goal_id: null })).toBe(false);
  });
});

describe("PER_MONTH", () => {
  it("normalises a week and a year onto a month", () => {
    expect(PER_MONTH.month).toBe(1);
    expect(PER_MONTH.year).toBeCloseTo(1 / 12);
    // 52 weeks a year, not 4 a month — the difference is a whole extra payment.
    expect(PER_MONTH.week).toBeCloseTo(4.333, 3);
  });
});

describe("cadence and the goal cap", () => {
  const rule = (over: Record<string, unknown> = {}) =>
    ({
      id: "r1",
      name: "Rule",
      kind: "expense",
      active: true,
      every: "month",
      every_count: 1,
      next_on: "2026-09-01",
      ends_on: null,
      installments_total: null,
      installments_done: 0,
      anchor_day: null,
      goal_id: null,
      category: null,
      goal: null,
      ...over,
    }) as never;

  it("walks the count, so a quarterly rule lands four times a year", () => {
    const out = occurrencesFor(rule({ every: "month", every_count: 3 }), 1000, false, "2027-08-31");
    expect(out.map((o) => o.on)).toEqual([
      "2026-09-01",
      "2026-12-01",
      "2027-03-01",
      "2027-06-01",
    ]);
  });

  /*
    The point of the cap: a standing order into a goal stops when the goal is full, and
    the last payment is what is left rather than a full one. Without the trim the app
    would promise to put 5.000 into a goal with 2.000 of room, and the forecast would be
    3.000 out on the one date people actually plan around.
  */
  it("stops when the goal is full, and trims the last payment", () => {
    const out = occurrencesFor(rule(), 5000, false, "2027-12-31", [], 12000);
    expect(out.map((o) => o.amount)).toEqual([5000, 5000, 2000]);
    expect(out).toHaveLength(3);
  });

  it("books nothing at all into a goal that is already full", () => {
    expect(occurrencesFor(rule(), 5000, false, "2027-12-31", [], 0)).toEqual([]);
  });

  it("leaves every other rule uncapped", () => {
    const out = occurrencesFor(rule(), 5000, false, "2026-12-31");
    expect(out.every((o) => o.amount === 5000)).toBe(true);
  });
});

/*
  A debt is finished when it is paid, not when a counter runs out.

  These are the real figures: a credit of 123.105,92 written down as four payments of
  30.776,48, which divides exactly — until a month when more than the rate goes out. From
  that moment the counter and the ledger disagree, and every one of these says the ledger
  wins. They are asserted rather than described because "you cannot overpay a debt" is a
  promise, and a promise nothing checks is a comment.
*/
describe("a debt caps the plan that pays it", () => {
  const CREDIT = 123105.92;
  const RATE = 30776.48;
  const loan = "loan-1";

  it("caps any rule that names a debt, whatever its end condition says", () => {
    const room = new Map([[loan, 50000]]);
    expect(loanCapFor(rule({ loan_id: loan }), room)).toBe(50000);
    expect(loanCapFor(rule({ loan_id: loan, ends_when: "never" }), room)).toBe(50000);
    expect(loanCapFor(rule({ loan_id: loan, ends_when: "installments" }), room)).toBe(50000);
  });

  it("leaves a rule that pays no debt alone", () => {
    expect(loanCapFor(rule(), new Map([[loan, 50000]]))).toBeUndefined();
  });

  it("caps at nothing when the debt has gone", () => {
    // Safer of the two wrong answers: a rule pointing at a debt that is not there books
    // nothing, rather than booking forever against something nobody can check.
    expect(loanCapFor(rule({ loan_id: "gone" }), new Map())).toBe(0);
  });

  it("takes whichever cap the rule actually has", () => {
    const goals = new Map([["goal-1", 9000]]);
    const loans = new Map([[loan, 50000]]);
    expect(capFor(rule({ ends_when: "goal", goal_id: "goal-1" }), goals, loans)).toBe(9000);
    expect(capFor(rule({ loan_id: loan }), goals, loans)).toBe(50000);
    expect(capFor(rule(), goals, loans)).toBeUndefined();
  });

  it("projects four payments while the plan is being kept", () => {
    const out = occurrencesFor(
      rule({ loan_id: loan, installments_total: 4, installments_done: 0 }),
      RATE,
      false,
      "2027-12-31",
      [],
      CREDIT,
    );
    expect(out).toHaveLength(4);
    expect(out.reduce((sum, o) => sum + o.amount, 0)).toBeCloseTo(CREDIT, 2);
  });

  it("shortens the plan the month more than the rate goes out", () => {
    /*
      90.000 paid against a 30.776,48 rate leaves 33.105,92. The counter still says three
      payments — 92.329,44, which is 59.223,52 more than is owed. The ledger says two: a
      full one and a short one.
    */
    const out = occurrencesFor(
      rule({ loan_id: loan, installments_total: 4, installments_done: 1 }),
      RATE,
      false,
      "2027-12-31",
      [],
      CREDIT - 90000,
    );
    expect(out).toHaveLength(2);
    expect(out.map((o) => Math.round(o.amount * 100) / 100)).toEqual([RATE, 2329.44]);
    expect(out.reduce((sum, o) => sum + o.amount, 0)).toBeCloseTo(33105.92, 2);
  });

  it("never promises more than is owed, at any payment size", () => {
    // The property behind every case above, checked across the range rather than at the
    // one figure that happened to come up.
    for (const paid of [0, 1, 5000, 30776.48, 35000, 90000, 123105.91]) {
      const out = occurrencesFor(
        rule({ loan_id: loan, installments_total: 4 }),
        RATE,
        false,
        "2030-12-31",
        [],
        CREDIT - paid,
      );
      const promised = out.reduce((sum, o) => sum + o.amount, 0);
      expect(promised, `after paying ${paid}`).toBeCloseTo(CREDIT - paid, 2);
    }
  });

  it("still honours the counter on a rule with no debt behind it", () => {
    /*
      The other half of the rule above, and the reason it is written as `cap != null'
      rather than as `always'. A four-month credit written down as a plain rule with no
      debt attached still counts four times — nothing here loosens that.
    */
    const out = occurrencesFor(
      rule({ installments_total: 4, installments_done: 1 }),
      RATE,
      false,
      "2030-12-31",
    );
    expect(out).toHaveLength(3);
  });

  it("promises nothing once the debt is paid", () => {
    expect(
      occurrencesFor(rule({ loan_id: loan, installments_total: 4 }), RATE, false, "2030-12-31", [], 0),
    ).toEqual([]);
  });

  it("lengthens the plan when less than the rate went out", () => {
    /*
      The same rule read the other way, and nothing about it is special-cased: the walk
      is over what is owed, so a short month simply takes another step to cover.

      Pay 10.000 by hand instead of the 30.776,48 rate and 113.105,92 is left — three
      full payments and a fourth of 20.776,48. The counter, one booking in, says three.
      This is the case where believing the counter leaves a debt open with the plan that
      was paying it already switched off.
    */
    const out = occurrencesFor(
      rule({ loan_id: loan, installments_total: 4, installments_done: 1 }),
      RATE,
      false,
      "2030-12-31",
      [],
      CREDIT - 10000,
    );
    expect(out).toHaveLength(4);
    expect(out.reduce((sum, o) => sum + o.amount, 0)).toBeCloseTo(113105.92, 2);
  });
});
