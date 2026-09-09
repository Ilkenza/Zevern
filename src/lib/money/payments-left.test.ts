import { describe, expect, it } from "vitest";
import { paymentsLeft } from "./index";

/*
  The bug this exists to stop is arithmetic, not logic, and it shipped looking right.

  A credit of 123.105,92 written down as four payments of 30.776,48 divides exactly —
  which is the ordinary way a credit is written, and was therefore the case that broke.
  Rounding each side to whole dinars first turns 4 into 4,00006 and `Math.ceil` reports
  five payments left on a debt nobody has paid anything against.
*/
describe("paymentsLeft", () => {
  const RATE = 30776.48;
  const CREDIT = 123105.92;

  it("says four when four divide exactly", () => {
    expect(paymentsLeft(CREDIT, RATE)).toBe(4);
  });

  it("does not round its way into an extra payment", () => {
    // Every exact multiple, since one of them passing by luck proves nothing.
    for (let n = 1; n <= 60; n += 1) {
      expect(paymentsLeft(RATE * n, RATE), `${n} payments`).toBe(n);
    }
  });

  it("counts a remainder as a payment", () => {
    expect(paymentsLeft(CREDIT - 35000, RATE)).toBe(3); // 88.105,92 — two full and a short one
    expect(paymentsLeft(CREDIT - 90000, RATE)).toBe(2); // 33.105,92 — one full and a short one
    expect(paymentsLeft(RATE + 0.01, RATE)).toBe(2); // one cent over is another payment
  });

  it("counts nothing left on a debt that is paid", () => {
    expect(paymentsLeft(0, RATE)).toBe(0);
    // An overpayment is a settled debt, never one that owes money back.
    expect(paymentsLeft(-5000, RATE)).toBe(0);
  });

  it("has no answer without a rate", () => {
    expect(paymentsLeft(CREDIT, 0)).toBeNull();
    expect(paymentsLeft(CREDIT, -100)).toBeNull();
  });

  it("holds at the sizes a debt actually comes in", () => {
    // 5.000 from a friend paid back in one go, 100, and a six-figure credit — his own
    // three examples, because a helper that only works at one order of magnitude is a
    // helper that works by accident.
    expect(paymentsLeft(5000, 5000)).toBe(1);
    expect(paymentsLeft(100, 25)).toBe(4);
    expect(paymentsLeft(100000, 10000)).toBe(10);
    expect(paymentsLeft(0.03, 0.01)).toBe(3);
  });
});
