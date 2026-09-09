import { describe, expect, it } from "vitest";
import { amountToBook, planEnd, PENNY } from "./posting";

/*
  The arithmetic behind the `Post' button, which until now was tested by pressing it.

  Two of these cases are his: a credit of 123.105,92 written in the contract as four
  payments of 30.776,48, and the month somebody pays 35.000 instead of the 30.776,48 the
  plan asked for. Both are here as walks rather than single calls, because the bug either
  one produces only shows up on the *last* booking — one payment early or one payment
  over — and a test that calls the function once would pass while the fourth month quietly
  paid money nobody owed.
*/

const RATE = 30776.48;
const CREDIT = 123105.92;

describe("amountToBook", () => {
  it("books what was asked when nothing is owed against it", () => {
    // Rent, a salary, money into a goal: no debt attached, so no trimming.
    for (const asked of [5000, 100, 100000, 0.01, 30776.48]) {
      expect(amountToBook(asked, null)).toEqual({ book: asked });
    }
  });

  it("books what was asked while the debt has room for it", () => {
    expect(amountToBook(RATE, CREDIT)).toEqual({ book: RATE });
    expect(amountToBook(RATE, RATE + 0.02)).toEqual({ book: RATE });
  });

  it("books the whole of what is left when that is less than the rate", () => {
    // The case the trim exists for: 4.223,52 left, the rule still says 30.776,48.
    expect(amountToBook(RATE, 4223.52)).toEqual({ book: 4223.52 });
    expect(amountToBook(50000, 100)).toEqual({ book: 100 });
  });

  it("books it all when the rate is exactly what is left", () => {
    expect(amountToBook(RATE, RATE)).toEqual({ book: RATE });
  });

  it("refuses a debt that is already paid off", () => {
    expect(amountToBook(RATE, 0)).toEqual({ book: null, refusal: "settled" });
    // Rounding leftovers are paid off, not a payment worth writing down.
    expect(amountToBook(RATE, PENNY)).toEqual({ book: null, refusal: "settled" });
    expect(amountToBook(RATE, 0.005)).toEqual({ book: null, refusal: "settled" });
    // A hair over the tolerance is still a debt.
    expect(amountToBook(RATE, 0.02)).toEqual({ book: 0.02 });
  });

  it("refuses a booking with no figure behind it", () => {
    // A variable rule with nothing typed in, and a rule saved at zero.
    expect(amountToBook(0, null)).toEqual({ book: null, refusal: "no-amount" });
    expect(amountToBook(-100, null)).toEqual({ book: null, refusal: "no-amount" });
    expect(amountToBook(Number.NaN, null)).toEqual({ book: null, refusal: "no-amount" });
    expect(amountToBook(Number.NaN, CREDIT)).toEqual({ book: null, refusal: "no-amount" });
  });

  it("never books more than is owed, at any size a debt comes in", () => {
    // 5.000 from a friend, 100, a six-figure credit — his own three examples.
    for (const owed of [5000, 100, 100000, 123105.92, 0.02]) {
      for (const asked of [1, 100, 30776.48, 999999]) {
        const plan = amountToBook(asked, owed);
        expect(plan.book == null || plan.book <= owed, `${asked} against ${owed}`).toBe(true);
      }
    }
  });
});

describe("planEnd", () => {
  /** Everything switched off, so each test turns on exactly the one thing it is about. */
  const quiet = {
    owed: null,
    booked: 1000,
    done: 1,
    installmentsTotal: null,
    endsOn: null,
    next: "2026-10-01",
    goalFull: false,
  };

  it("keeps a plan with no end condition running", () => {
    expect(planEnd(quiet)).toEqual({ loanCleared: false, finished: false });
  });

  it("stops on the count, when there is no debt to read instead", () => {
    expect(planEnd({ ...quiet, installmentsTotal: 12, done: 11 }).finished).toBe(false);
    expect(planEnd({ ...quiet, installmentsTotal: 12, done: 12 }).finished).toBe(true);
    // Past the count — a rule that somehow booked one more still stops.
    expect(planEnd({ ...quiet, installmentsTotal: 12, done: 13 }).finished).toBe(true);
  });

  it("stops when the next date would fall past the end date", () => {
    expect(planEnd({ ...quiet, endsOn: "2026-10-01", next: "2026-10-01" }).finished).toBe(false);
    expect(planEnd({ ...quiet, endsOn: "2026-09-30", next: "2026-10-01" }).finished).toBe(true);
  });

  it("stops when the goal it feeds is full", () => {
    expect(planEnd({ ...quiet, goalFull: true }).finished).toBe(true);
  });

  it("stops when the debt it pays is clear, and says so", () => {
    expect(planEnd({ ...quiet, owed: RATE, booked: RATE })).toEqual({
      loanCleared: true,
      finished: true,
    });
    // Ragged tenths of a dinar are cleared; two whole cents are not.
    expect(planEnd({ ...quiet, owed: RATE + 0.005, booked: RATE }).loanCleared).toBe(true);
    expect(planEnd({ ...quiet, owed: RATE + 0.02, booked: RATE }).loanCleared).toBe(false);
  });

  it("lets the ledger outrank the count on a debt", () => {
    /*
      The count says this was the last payment. The debt says 30.776,48 is still owed,
      because a month back somebody paid short. Switching off here is the failure: the
      rule stops, the debt sits open, and nothing is pointing at it any more.
    */
    const short = planEnd({
      ...quiet,
      owed: RATE * 2,
      booked: RATE,
      installmentsTotal: 4,
      done: 4,
    });
    expect(short).toEqual({ loanCleared: false, finished: false });

    // And the other way: paid off early, with two payments still on the plan.
    const early = planEnd({
      ...quiet,
      owed: RATE,
      booked: RATE,
      installmentsTotal: 4,
      done: 2,
    });
    expect(early).toEqual({ loanCleared: true, finished: true });
  });

  it("still honours the end date on a debt", () => {
    // The count is ignored while a debt is attached; the date is not, because a date is
    // a thing the person set rather than a number the plan inferred.
    const out = planEnd({
      ...quiet,
      owed: RATE * 3,
      booked: RATE,
      endsOn: "2026-09-30",
      next: "2026-10-01",
    });
    expect(out).toEqual({ loanCleared: false, finished: true });
  });
});

describe("the two of them, over a whole credit", () => {
  type Step =
    | { ok: false; refusal: "settled" | "no-amount" }
    | { ok: true; paid: number; owed: number | null; loanCleared: boolean; finished: boolean };

  /** One booking: what leaves, and what the rule does next. */
  function book(owed: number | null, asked: number, done: number, total: number | null): Step {
    const plan = amountToBook(asked, owed);
    if (plan.book == null) return { ok: false, refusal: plan.refusal };
    const end = planEnd({
      owed,
      booked: plan.book,
      done: done + 1,
      installmentsTotal: total,
      endsOn: null,
      next: "2027-01-01",
      goalFull: false,
    });
    return { ok: true, paid: plan.book, owed: owed == null ? null : owed - plan.book, ...end };
  }

  /** The same, for a booking the walk expects to go through. */
  function paid(owed: number | null, asked: number, done: number, total: number | null) {
    const step = book(owed, asked, done, total);
    if (!step.ok) throw new Error(`refused (${step.refusal}) — the walk expected it to book`);
    return step;
  }

  it("clears 123.105,92 in exactly the four the contract says", () => {
    let owed: number | null = CREDIT;
    let done = 0;
    const each: number[] = [];

    for (let n = 0; n < 4; n += 1) {
      const step = paid(owed, RATE, done, 4);
      each.push(step.paid);
      owed = step.owed;
      done += 1;
      expect(step.finished, `booking ${n + 1}`).toBe(n === 3);
    }

    expect(each).toEqual([RATE, RATE, RATE, RATE]);
    // Not `toBe(0)`: four floats do not land on nought, which is why `PENNY` exists.
    expect(Math.abs(owed as number)).toBeLessThanOrEqual(PENNY);
    // And the fifth press has nothing to do.
    const fifth = book(owed, RATE, done, 4);
    expect(fifth.ok).toBe(false);
    expect(fifth.ok === false && fifth.refusal).toBe("settled");
  });

  it("finishes a month early when one payment is 35.000 instead", () => {
    // His question: 30k je rata, ja vratim 35k.
    let owed: number | null = CREDIT;
    let done = 0;
    const each: number[] = [];

    const big = paid(owed, 35000, done, 4);
    each.push(big.paid);
    owed = big.owed;
    done += 1;
    expect(big.finished).toBe(false);

    for (let n = 0; n < 3; n += 1) {
      const step = paid(owed, RATE, done, 4);
      each.push(step.paid);
      owed = step.owed;
      done += 1;
      expect(step.finished, `booking ${n + 2}`).toBe(n === 2);
    }

    // Four payments still, but the last one is trimmed to what was actually left —
    // 26.552,96 rather than another full rate.
    expect(each.slice(0, 3)).toEqual([35000, RATE, RATE]);
    expect(each[3]).toBeCloseTo(CREDIT - 35000 - RATE * 2, 2);
    expect(each.reduce((a, b) => a + b, 0)).toBeCloseTo(CREDIT, 2);
    // Never a dinar more than the contract.
    expect(each.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(CREDIT + PENNY);
  });

  it("carries on past the count when a month came up short", () => {
    let owed: number | null = CREDIT;
    let done = 0;

    // Four bookings, one of them 10.000 short of the rate.
    for (const asked of [RATE - 10000, RATE, RATE, RATE]) {
      const step = paid(owed, asked, done, 4);
      owed = step.owed;
      done += 1;
      expect(step.finished).toBe(false);
    }

    // The count is spent and the debt is not: the plan keeps going.
    expect(owed as number).toBeCloseTo(10000, 2);
    const fifth = paid(owed, RATE, done, 4);
    expect(fifth.paid).toBeCloseTo(10000, 2);
    expect(fifth.finished).toBe(true);
    expect(fifth.loanCleared).toBe(true);
  });

  it("pays 5.000 back to a friend in one go, with no plan at all", () => {
    const step = paid(5000, 5000, 0, null);
    expect(step.paid).toBe(5000);
    expect(step.loanCleared).toBe(true);
    expect(step.finished).toBe(true);
  });
});
