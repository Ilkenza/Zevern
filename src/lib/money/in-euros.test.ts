import { describe, expect, it } from "vitest";
import { inEuros } from "@/lib/money";

/*
  The Freelance overview is in euros, and invoices are not. These are the owner's own
  rates at the time this was written — 117,3531 dinars to the euro, 101,2363 to the dollar.
*/
const rates = { EUR: 117.3531, USD: 101.2363 };

describe("inEuros", () => {
  it("leaves euros alone", () => {
    expect(inEuros(1440, "EUR", rates)).toBe(1440);
  });

  it("turns dinars into euros instead of printing them with a € sign", () => {
    // The bug: 159.400 RSD went into "Outstanding" as €159.400.
    expect(inEuros(159400, "RSD", rates)).toBeCloseTo(1358.29, 2);
  });

  it("turns dollars into euros through the dinar", () => {
    expect(inEuros(1908, "USD", rates)).toBeCloseTo(1645.96, 2);
  });

  it("adds mixed invoices into one honest total", () => {
    const total = [
      inEuros(390, "EUR", rates),
      inEuros(159400, "RSD", rates),
      inEuros(1431, "USD", rates),
    ].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(390 + 1358.29 + 1234.47, 1);
    expect(total).toBeLessThan(5000);
  });

  it("falls back to the built-in rates rather than dividing by zero", () => {
    const value = inEuros(117200, "RSD", { EUR: 0, USD: 0 });
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeCloseTo(1000, 0);
  });
});
