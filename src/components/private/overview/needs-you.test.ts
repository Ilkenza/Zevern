import { describe, expect, it } from "vitest";
import { daysUntil, readNeeds, whenPhrase, type NeedsInput } from "./needs-you";
import type { PlanReading } from "@/components/private/budgets/plan-reading";
import type {
  BudgetPlanLine,
  MoneyBudgetPlan,
  RecurringRow,
  TransactionRow,
} from "@/lib/types";

const TODAY = "2026-08-28";

/** Dinars the way the app prints them, so the sentences under test are the real ones. */
const fmt = (value: number) => new Intl.NumberFormat("sr-RS").format(Math.round(value));

const rule = (over: Partial<RecurringRow> & { id: string; name: string }): RecurringRow =>
  ({ amount: 0, variable: false, next_on: TODAY, currency: "RSD", ...over }) as RecurringRow;

const entry = (over: Partial<TransactionRow> & { id: string }): TransactionRow =>
  ({ occurred_on: TODAY, currency: "RSD", amount_rsd: null, ...over }) as TransactionRow;

const budget = (
  over: Partial<MoneyBudgetPlan> & { used?: number; from?: string; to?: string; limit?: number },
  reading: Partial<PlanReading> = {},
): { line: BudgetPlanLine; reading: PlanReading } => {
  const { used = 0, from = "2026-08-01", to = "2026-08-31", limit = 20000, ...plan } = over;
  return {
    line: {
      plan: {
        id: "p1",
        name: "Groceries",
        amount_rsd: limit,
        membership: "all",
        kind: "expense",
        ...plan,
      } as unknown as MoneyBudgetPlan,
      window: { from, to, index: 0, ended: false },
      categoryIds: [],
      accountIds: [],
      used,
      entries: 1,
      filed: 0,
      filedIn: [],
      baseRsd: limit,
      extra: 0,
      boostedBy: [],
      limitRsd: limit,
    },
    reading: {
      status: "ontrack",
      pct: 0,
      raw: 0,
      pace: 0.9,
      daysLeft: 3,
      note: "",
      ...reading,
    },
  };
};

const input = (over: Partial<NeedsInput> = {}): NeedsInput => ({
  today: TODAY,
  dueNow: [],
  coming: [],
  unpriced: [],
  budgets: [],
  fmt,
  ...over,
});

describe("counting the days", () => {
  it("reads whole days between two wall-clock dates", () => {
    expect(daysUntil(TODAY, "2026-08-31")).toBe(3);
    expect(daysUntil(TODAY, TODAY)).toBe(0);
    expect(daysUntil(TODAY, "2026-08-26")).toBe(-2);
  });

  it("crosses a month and a year without drifting", () => {
    expect(daysUntil("2026-08-28", "2026-09-01")).toBe(4);
    expect(daysUntil("2026-12-30", "2027-01-02")).toBe(3);
  });

  /*
    Belgrade is two hours ahead in summer and one in winter, and the app's dates are
    wall-clock strings with no zone at all. Parsing them as local time makes 31 October
    28 days from 3 October in some zones and 27 in others.
  */
  it("counts across the daylight-saving change like every other day", () => {
    expect(daysUntil("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysUntil("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("says when in the words a person would use", () => {
    expect(whenPhrase(0)).toBe("due today");
    expect(whenPhrase(1)).toBe("due tomorrow");
    expect(whenPhrase(3)).toBe("due in 3 days");
    expect(whenPhrase(-1)).toBe("1 day overdue");
    expect(whenPhrase(-4)).toBe("4 days overdue");
  });
});

describe("what gets to be the headline", () => {
  /*
    The case this whole module exists for. On 28 August the screen showed nine panels and
    none of them said that 30.776,48 leaves the account in three days.
  */
  it("names the big instalment three days out ahead of a small overspend", () => {
    const { headline, count } = readNeeds(
      input({
        coming: [{ id: "r1", name: "Kredit za laptop", amount: 30776.48, on: "2026-08-31" }],
        budgets: [budget({ used: 20867 }, { status: "over", daysLeft: 3 })],
      }),
    );
    expect(headline?.title).toBe("Kredit za laptop");
    expect(headline?.detail).toBe("due in 3 days");
    expect(headline?.amount).toBe(30776.48);
    expect(count).toBe(2);
  });

  it("puts a bill nobody booked above one that is merely coming", () => {
    const { headline } = readNeeds(
      input({
        dueNow: [rule({ id: "d1", name: "Struja", amount: 4200 })],
        coming: [{ id: "r1", name: "Kredit za laptop", amount: 30776.48, on: "2026-08-31" }],
      }),
    );
    // Six times smaller and still first: its date has already gone by.
    expect(headline?.title).toBe("Struja");
    expect(headline?.tone).toBe("late");
  });

  it("breaks a tie on size, because the big one decides whether the small one fits", () => {
    const { all } = readNeeds(
      input({
        coming: [
          { id: "a", name: "Small", amount: 1250, on: "2026-08-30" },
          { id: "b", name: "Large", amount: 30776, on: "2026-08-30" },
        ],
      }),
    );
    expect(all.map((n) => n.title)).toEqual(["Large", "Small"]);
  });

  it("has nothing to say on a quiet day", () => {
    const reading = readNeeds(input());
    expect(reading.headline).toBeNull();
    expect(reading.count).toBe(0);
    expect(reading.shown).toEqual([]);
  });
});

describe("rows that can be finished on the spot", () => {
  it("hands a due bill its own rule, so the row can book it", () => {
    const struja = rule({ id: "d1", name: "Struja", amount: 4200 });
    const { all } = readNeeds(input({ dueNow: [struja] }));
    expect(all[0].action).toEqual({ kind: "book", rule: struja });
    expect(all[0].detail).toBe("Due 2026-08-28 · usually 4.200");
  });

  it("says the amount changes rather than printing a zero", () => {
    const { all } = readNeeds(
      input({ dueNow: [rule({ id: "d1", name: "Struja", variable: true })] }),
    );
    expect(all[0].amount).toBeNull();
    expect(all[0].detail).toBe("Due 2026-08-28 · the amount changes");
  });

  /*
    One row each rather than one saying "3 entries have no price". A count is not
    something you can act on, and these are two taps from finished.
  */
  it("gives every unpriced entry its own row", () => {
    const { all, count } = readNeeds(
      input({
        unpriced: [
          entry({ id: "t1", title: "Nešto sa pijace", account: { name: "Cash", currency: "RSD" } }),
          entry({ id: "t2", title: "Kafa" }),
        ],
      }),
    );
    expect(count).toBe(2);
    expect(all.map((n) => n.action.kind)).toEqual(["price", "price"]);
    expect(all[0].detail).toBe("2026-08-28 · Cash · needs a price");
  });
});

describe("what budgets add", () => {
  it("gives an overspend a row, with what it is over by", () => {
    const { all } = readNeeds(
      input({ budgets: [budget({ used: 20867 }, { status: "over", daysLeft: 3 })] }),
    );
    expect(all[0].title).toBe("Groceries is over its budget");
    expect(all[0].detail).toBe("20.867 of 20.000 · 3 days left");
    expect(all[0].amount).toBe(867);
  });

  it("judges against the raised limit, not the plan's own amount", () => {
    // August has a trip in it, so 21.237 of 25.000 is inside — and must not be a row.
    const raised = budget({ used: 21237 }, { status: "ontrack" });
    raised.line.extra = 5000;
    raised.line.limitRsd = 25000;
    expect(readNeeds(input({ budgets: [raised] })).count).toBe(0);
  });

  it("says one day rather than 1 days on the last day of a window", () => {
    const { all } = readNeeds(
      input({ budgets: [budget({ used: 20867 }, { status: "over", daysLeft: 1 })] }),
    );
    expect(all[0].detail).toBe("20.867 of 20.000 · 1 day left");
  });

  /*
    A window that has closed cannot be acted on, and a "needs you" list naming things you
    can do nothing about is a heading that stops meaning anything.
  */
  it("leaves alone a budget whose window has already closed", () => {
    const { count } = readNeeds(
      input({
        budgets: [
          budget({ used: 20867, from: "2026-07-01", to: "2026-07-31" }, { status: "over" }),
        ],
      }),
    );
    expect(count).toBe(0);
  });

  /*
    A trip with money already filed against it is a trip that is working. It is reported
    twice on the overview as it is — the hero's "planned for trips running" clause and its
    own row in the Budgets strip — and a third copy under a heading that says "needs you"
    is what made that heading's count never reach zero.
  */
  it("says nothing about a trip you are already filing into", () => {
    const { count } = readNeeds(
      input({
        budgets: [
          budget(
            {
              id: "more",
              name: "na moru",
              membership: "added",
              limit: 35211,
              used: 14737,
              from: "2026-08-20",
              to: "2026-09-06",
            },
            { status: "ontrack" },
          ),
        ],
      }),
    );
    expect(count).toBe(0);
  });

  /*
    Empty and half gone is the one version of this you can act on: such a budget counts
    nothing it is not given, so an empty ledger past the midpoint is either a holiday
    nobody is recording or one that is not happening.
  */
  it("asks about a hand-filed budget that is half over with nothing in it", () => {
    const { all } = readNeeds(
      input({
        budgets: [
          budget(
            {
              id: "more",
              name: "na moru",
              membership: "added",
              limit: 35211,
              used: 0,
              from: "2026-08-20",
              to: "2026-09-06",
            },
            { status: "ontrack", daysLeft: 9 },
          ),
        ],
      }),
    );
    expect(all[0].title).toBe("Nothing filed into na moru yet");
    expect(all[0].detail).toBe("Aug 20 – Sep 6 · 35.211 set aside · 9 days left");
    expect(all[0].amount).toBe(35211);
    // A prompt, not an alarm — it sorts under everything that is actually wrong.
    expect(all[0].tone).toBe("quiet");
  });

  it("stays quiet about an empty budget that has barely started", () => {
    const { count } = readNeeds(
      input({
        budgets: [
          budget({
            name: "na moru",
            membership: "added",
            limit: 35211,
            used: 0,
            from: "2026-08-27",
            to: "2026-09-06",
          }),
        ],
      }),
    );
    expect(count).toBe(0);
  });

  it("does not remind you about a trip that has not started", () => {
    const { count } = readNeeds(
      input({
        budgets: [
          budget({
            name: "Berlin",
            membership: "added",
            limit: 60000,
            from: "2026-10-02",
            to: "2026-10-09",
          }),
        ],
      }),
    );
    expect(count).toBe(0);
  });
});

describe("how much of it the band draws", () => {
  it("shows seven and counts the rest, so a bad day is still a glance", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      name: `Bill ${i}`,
      amount: 1000 + i,
      on: "2026-08-30",
    }));
    const reading = readNeeds(input({ coming: many }));
    expect(reading.count).toBe(10);
    expect(reading.shown).toHaveLength(7);
    expect(reading.hidden).toBe(3);
    // The cut takes the least pressing, never the most.
    expect(reading.shown[0].title).toBe("Bill 9");
  });
});
