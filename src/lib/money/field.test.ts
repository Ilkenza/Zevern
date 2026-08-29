import { describe, expect, it } from "vitest";
import { cleanMoney, groupMoney, plainMoney, typedMoney } from "./field";

/** What the field actually submits after a string is typed into it character by character. */
function type(text: string): string {
  let shown = "";
  let cleaned = "";
  for (const ch of text) {
    cleaned = cleanMoney(shown + ch);
    shown = groupMoney(cleaned);
  }
  return plainMoney(cleaned);
}

describe("typing an amount", () => {
  /*
    The bug this file exists for. Every dot was deleted, so a decimal point typed on a
    numeric keypad became grouping and 123105.92 was submitted as 12.310.592 — a hundred
    times the figure, silently, on a form whose whole job is to be trusted with amounts.
  */
  it("takes a full stop as a decimal point", () => {
    expect(type("123105.92")).toBe("123105.92");
    expect(type("30776.48")).toBe("30776.48");
    expect(type("1.5")).toBe("1.5");
    expect(type("5.00")).toBe("5.00");
  });

  it("still takes a comma, which is what the field shows back", () => {
    expect(type("123105,92")).toBe("123105.92");
    expect(type("30776,48")).toBe("30776.48");
  });

  it("keeps grouping the whole part while you type", () => {
    expect(groupMoney(cleanMoney("123105"))).toBe("123.105");
    expect(groupMoney(cleanMoney("1234567"))).toBe("1.234.567");
    expect(groupMoney(cleanMoney("123105,92"))).toBe("123.105,92");
  });

  it("reads its own grouping back as grouping, not as decimals", () => {
    // This is what arrives on the next keystroke, and it must round-trip unchanged.
    expect(cleanMoney("123.105")).toBe("123105");
    expect(cleanMoney("1.234.567")).toBe("1234567");
    expect(cleanMoney("12.310.592")).toBe("12310592");
    expect(cleanMoney("123.105,92")).toBe("123105,92");
  });

  it("treats a dot typed after grouping as the decimal it is", () => {
    // The input already reads "123.105" when the person hits the point key.
    expect(cleanMoney("123.105.9")).toBe("123105,9");
    expect(cleanMoney("123.105.92")).toBe("123105,92");
  });

  it("lets a decimal mark stand alone mid-typing", () => {
    expect(cleanMoney("123105.")).toBe("123105,");
    expect(cleanMoney("123105,")).toBe("123105,");
    expect(cleanMoney(".5")).toBe(",5");
    expect(plainMoney(cleanMoney(".5"))).toBe(".5");
  });

  it("groups a round thousand for you, so you never type the dots", () => {
    expect(type("100000")).toBe("100000");
    expect(groupMoney(cleanMoney("100000"))).toBe("100.000");
    expect(type("1000000")).toBe("1000000");
    expect(groupMoney(cleanMoney("1000000"))).toBe("1.000.000");
  });

  /*
    The one case that cannot be read: a grouping dot typed by hand. Pressing the point
    key on "100" leaves nothing after it, so it can only be a decimal, and "100.000"
    lands on 100,00. Documented rather than fixed — the field groups for you, and the
    reading it took is on screen while you type rather than hidden until it saves.
  */
  it("cannot read grouping dots typed by hand, and shows what it did read", () => {
    expect(type("100.000")).toBe("100.00");
  });

  it("throws away a third decimal rather than storing what the column cannot", () => {
    expect(cleanMoney("12,345")).toBe("12,34");
    expect(cleanMoney("1.234,567")).toBe("1234,56");
  });

  it("stops at twelve whole digits, which is what numeric(14,2) holds", () => {
    expect(cleanMoney("12345678901234")).toBe("123456789012");
    expect(cleanMoney("1234567890123,45")).toBe("123456789012,45");
  });

  it("ignores anything that is not a figure", () => {
    expect(type("1 2 3")).toBe("123");
    expect(cleanMoney("RSD 400")).toBe("400");
    expect(cleanMoney("-40")).toBe("40");
  });
});

describe("showing a stored amount", () => {
  it("turns the database's dot into the comma the field types in", () => {
    expect(typedMoney("123105.92")).toBe("123105,92");
    expect(typedMoney(30776.48)).toBe("30776,48");
    expect(typedMoney(1000)).toBe("1000");
  });

  it("has nothing to show for nothing", () => {
    expect(typedMoney(null)).toBe("");
    expect(typedMoney(undefined)).toBe("");
    expect(typedMoney("")).toBe("");
  });

  it("round-trips: stored → typed → submitted is the same figure", () => {
    for (const stored of ["123105.92", "0.5", "1000", "999999.99"]) {
      expect(plainMoney(typedMoney(stored))).toBe(stored);
    }
  });
});
