import { describe, expect, it } from "vitest";
import { booksItself, type SelfBooking } from "./books-itself";

const rule = (over: Partial<SelfBooking> = {}): SelfBooking => ({
  books_itself: true,
  variable: false,
  amount: 4200,
  created_at: "2026-08-01T09:00:00Z",
  next_on: "2026-09-01",
  ...over,
});

describe("booksItself", () => {
  it("books a fixed rule that was set up before its date", () => {
    expect(booksItself(rule())).toBe(true);
  });

  /*
    The whole point of the switch: a rule nobody asked to be automatic is not automatic,
    however ordinary it looks. Every rule that existed before the column did starts here.
  */
  it("does nothing at all while the switch is off", () => {
    expect(booksItself(rule({ books_itself: false }))).toBe(false);
  });

  it("will not invent a figure for a bill that changes", () => {
    expect(booksItself(rule({ variable: true }))).toBe(false);
    expect(booksItself(rule({ amount: 0 }))).toBe(false);
  });

  /*
    Saving a rule dated today would otherwise post an entry in the same breath — money
    recorded as paid before the person had seen a single screen saying so.
  */
  it("waits when the rule was entered on or after the day it falls due", () => {
    expect(booksItself(rule({ created_at: "2026-09-01T09:00:00Z" }))).toBe(false);
    expect(booksItself(rule({ created_at: "2026-09-04T09:00:00Z" }))).toBe(false);
  });
});
