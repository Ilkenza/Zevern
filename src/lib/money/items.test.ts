import { describe, expect, it } from "vitest";
import { itemsArePriced, itemsTotal, lineTotal, parseItems } from "./items";


describe("how many of a thing", () => {
  /*
    The rule that was wrong, now the rule that is tested. `amount` is the price of one;
    two juices at 119 come to 238, not to 119 with `59,5 each` printed under it.
  */
  const juice = { name: "Aqua viva plavi sok", qty: 2, amount: 119 };

  it("multiplies the price of one by how many", () => {
    expect(lineTotal(juice)).toBe(238);
    expect(itemsTotal([juice])).toBe(238);
  });

  it("leaves a single of anything exactly as typed", () => {
    expect(lineTotal({ name: "Hleb", qty: 1, amount: 89 })).toBe(89);
  });

  it("adds several lines by what each line comes to, not by its unit price", () => {
    expect(
      itemsTotal([juice, { name: "Kafa", qty: 3, amount: 60 }, { name: "Hleb", qty: 1, amount: 89 }]),
    ).toBe(238 + 180 + 89);
  });

  it("keeps the tenths honest on a price that does not divide", () => {
    expect(lineTotal({ name: "Sok", qty: 3, amount: 59.5 })).toBe(178.5);
  });

  it("comes to nothing on a line with no price yet", () => {
    expect(lineTotal({ name: "Piletina", qty: 4, amount: 0 })).toBe(0);
  });
});

describe("what comes back out of the database", () => {
  it("defaults a missing count to one rather than to nothing", () => {
    expect(parseItems('[{"name":"Hleb","amount":89}]')).toEqual([
      { name: "Hleb", qty: 1, amount: 89 },
    ]);
  });

  it("drops a line with no name, and survives anything that is not a list", () => {
    expect(parseItems('[{"name":"  ","amount":5},{"name":"Sok","qty":2,"amount":119}]')).toEqual([
      { name: "Sok", qty: 2, amount: 119 },
    ]);
    expect(parseItems("not json")).toEqual([]);
    expect(parseItems(null)).toEqual([]);
  });

  it("only stands in for the entry's amount when every line carries a price", () => {
    expect(itemsArePriced([{ name: "A", qty: 1, amount: 10 }])).toBe(true);
    expect(
      itemsArePriced([{ name: "A", qty: 1, amount: 10 }, { name: "B", qty: 2, amount: 0 }]),
    ).toBe(false);
  });
});
