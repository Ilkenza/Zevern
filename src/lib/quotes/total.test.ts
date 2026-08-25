import { describe, expect, it } from "vitest";
import type { QuoteItem } from "@/lib/types";
import { quoteTotal } from "./total";

const item = (overrides: Partial<QuoteItem> = {}): QuoteItem => ({
  label: "Landing page",
  price: 10000,
  qty: 1,
  ...overrides,
});

describe("quoteTotal", () => {
  it("multiplies each line and adds them up", () => {
    expect(quoteTotal([item({ price: 10000, qty: 2 }), item({ price: 2500, qty: 3 })])).toBe(27500);
  });

  it("is zero for an empty quote", () => {
    expect(quoteTotal([])).toBe(0);
  });

  it("treats a blank or unparseable field as zero rather than NaN", () => {
    // The items come out of a JSON column that a form wrote, so a half-filled row is
    // a real state. One NaN in the reduce turns the whole quote total into NaN, and
    // the screen then prints "NaN RSD" beside a real client's name.
    const rows = [
      item({ price: Number.NaN, qty: 2 }),
      item({ price: 5000, qty: Number.NaN }),
      item({ price: 5000, qty: 2 }),
    ];
    expect(quoteTotal(rows)).toBe(10000);
  });

  it("reads numbers that arrived as strings", () => {
    const rows = [{ label: "Hosting", price: "1200", qty: "2" } as unknown as QuoteItem];
    expect(quoteTotal(rows)).toBe(2400);
  });

  it("counts a zero-quantity line as nothing", () => {
    expect(quoteTotal([item({ qty: 0 }), item({ price: 3000, qty: 1 })])).toBe(3000);
  });
});
