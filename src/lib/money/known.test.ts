import { describe, expect, it } from "vitest";
import { fillFromPick, fillFromTyping, type KnownThing } from "./known";

const maxi: KnownThing = { price: 1250, currency: "RSD", category_id: "groceries" };
const blank = { categoryId: "", amount: "" };

describe("choosing a thing off the list", () => {
  it("fills its price, its currency and where it is filed", () => {
    expect(fillFromPick(maxi)).toEqual({
      amount: "1250",
      currency: "RSD",
      categoryId: "groceries",
    });
  });

  it("says nothing about a price on something logged without one", () => {
    expect(fillFromPick({ ...maxi, price: null })).toEqual({ categoryId: "groceries" });
    expect(fillFromPick({ ...maxi, price: 0 })).toEqual({ categoryId: "groceries" });
  });
});

describe("typing a name that is already known", () => {
  it("files it where it was filed last time", () => {
    expect(fillFromTyping(maxi, blank).categoryId).toBe("groceries");
  });

  /*
    The one that has to hold. Everything else here is a convenience; this is the promise
    that makes the convenience safe to leave switched on.
  */
  it("never overwrites a category already chosen", () => {
    expect(fillFromTyping(maxi, { categoryId: "eating-out", amount: "" }).categoryId).toBeUndefined();
  });

  it("never overwrites an amount already typed", () => {
    const fill = fillFromTyping(maxi, { categoryId: "", amount: "40" });
    expect(fill.amount).toBeUndefined();
    expect(fill.currency).toBeUndefined();
    expect(fill.categoryId).toBe("groceries");
  });

  it("treats an amount of spaces as unanswered", () => {
    expect(fillFromTyping(maxi, { categoryId: "", amount: "   " }).amount).toBe("1250");
  });

  it("has nothing to offer from a thing with no price and no category", () => {
    expect(fillFromTyping({ price: null, currency: "RSD", category_id: null }, blank)).toEqual({});
  });
});
