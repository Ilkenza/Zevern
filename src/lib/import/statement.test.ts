import { describe, expect, it } from "vitest";
import items from "./__fixtures__/statement-items.json";
import {
  bankRef,
  findLayout,
  parseAmount,
  parseDate,
  parseStatement,
  reconcile,
  toLines,
  type TextItem,
} from "./statement";

/**
 * The fixture is a real PDF read by a real PDF reader.
 *
 * `scripts/fake-statement.py` draws a statement in the bank's own layout — its column
 * headings, its number format, its page furniture, four entries a page over three pages
 * — with invented transactions, and `pdfjs-dist` was run over the result. What is stored
 * here is exactly what that reader handed back: text with coordinates, nothing tidied.
 *
 * That matters more than it sounds. Every wrong assumption in the first version of the
 * parser survived hand-written fixtures and died on this one: headings that are not
 * their own word (`Broj kartice` for the card column), a banner above the table
 * containing the word `stanje`, and right-aligned figures whose left edge sits *before*
 * their own heading's. A fixture written from the code's expectations tests the code
 * against itself.
 */
const ITEMS = items as TextItem[];

describe("parseAmount", () => {
  it("reads the statement's own convention: comma for thousands, dot for the decimal", () => {
    // The dangerous one. On a Serbian bank's page the figures are written the English
    // way, and reading `26,000.00` with the local convention gives twenty-six dinars —
    // a plausible-looking number on a screen nobody would think to check.
    expect(parseAmount("157,895.85")).toBe(157895.85);
    expect(parseAmount("26,000.00")).toBe(26000);
    expect(parseAmount("0.00")).toBe(0);
    expect(parseAmount("1,234,567.89")).toBe(1234567.89);
  });

  it("returns null for anything that is not a figure", () => {
    for (const junk of ["", "Isplata", "STANJE", "01.08.2026", "-", "abc", "1.2.3"]) {
      expect(parseAmount(junk), junk).toBeNull();
    }
  });
});

describe("parseDate", () => {
  it("reads dd.mm.yyyy", () => {
    expect(parseDate("01.08.2026")).toBe("2026-08-01");
    expect(parseDate("31.12.2026.")).toBe("2026-12-31");
  });

  it("refuses anything else", () => {
    for (const junk of ["2026-08-01", "1.8.2026", "32.01.2026", "01.13.2026", "Datum"]) {
      expect(parseDate(junk), junk).toBeNull();
    }
  });
});

describe("findLayout", () => {
  it("finds all nine columns on a real page", () => {
    const layout = findLayout(toLines(ITEMS));
    expect(Object.keys(layout).sort()).toEqual([
      "balance",
      "card",
      "description",
      "executed",
      "origAmount",
      "paidIn",
      "paidOut",
      "received",
      "refAmount",
    ]);
  });

  it("does not learn the balance column from the banner above the table", () => {
    /*
      `Prethodno stanje:` is printed above the table and holds the word the balance
      column is found by, at an x of its own. The first version of this took it, and
      every balance on the statement then landed in the wrong column — where it still
      parsed as a number, so nothing complained.
    */
    const layout = findLayout(toLines(ITEMS));
    const banner = ITEMS.find((i) => i.text.includes("Prethodno stanje"))!;
    expect(layout.balance).toBeDefined();
    expect(layout.balance).not.toBe(banner.x);
    // It is the rightmost column, past every other one.
    expect(layout.balance!).toBeGreaterThan(layout.paidIn!);
  });

  it("gives up rather than guessing on a page with no table", () => {
    expect(findLayout(toLines([{ text: "Prethodno stanje:", x: 600, y: 500 }]))).toEqual({});
  });
});

describe("parseStatement", () => {
  it("reads every entry across every page", () => {
    const parsed = parseStatement(ITEMS);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;

    expect(parsed.rows).toHaveLength(12);
    expect(parsed.opening).toBe(157895.85);
    expect(parsed.closing).toBe(216654.16);

    // The first entry, whole — the one row copied from the real statement's shape.
    expect(parsed.rows[0]).toEqual({
      on: "2026-08-01",
      transactedOn: null,
      description: "SMART ATM - 200671, Kralja Petra 12",
      paidOut: 26000,
      paidIn: 0,
      balance: 131895.85,
    });
  });

  it("tells money going out from money coming in by the column it is in", () => {
    // There are no minus signs on this statement. `Isplata` and `Uplata` are separate
    // columns and one of them is always 0.00, so the direction is the column.
    const parsed = parseStatement(ITEMS);
    if ("error" in parsed) throw new Error(parsed.error);
    const receipt = parsed.rows.find((r) => r.description.startsWith("UPLATA PO FAKTURI"))!;
    expect(receipt.paidIn).toBe(84500);
    expect(receipt.paidOut).toBe(0);
  });

  it("keeps the last page's entries", () => {
    // A page break is where a parser silently drops rows, and a dropped row is the one
    // failure the balance chain exists to catch.
    const parsed = parseStatement(ITEMS);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.rows[parsed.rows.length - 1].description).toContain("PROVIZIJA");
  });

  it("says so when the page is not a statement", () => {
    const result = parseStatement([{ text: "Hello", x: 10, y: 10 }]);
    expect("error" in result).toBe(true);
  });
});

describe("reconcile", () => {
  it("agrees with the balance the bank printed", () => {
    const parsed = parseStatement(ITEMS);
    if ("error" in parsed) throw new Error(parsed.error);
    const result = reconcile(parsed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.closing).toBeCloseTo(216654.16, 2);
    expect(result.out).toBeCloseTo(67741.69, 2);
    expect(result.in).toBeCloseTo(126500, 2);
  });

  /*
    The four ways a PDF is read wrongly, and the one check that catches all of them.

    This is the whole safety argument of the import, so it is asserted rather than
    described. A parser reading a page is guessing; what makes the guess safe is not
    care, it is that a wrong guess cannot produce a statement that adds up.
  */
  it("refuses a statement whose figures were read with the wrong convention", () => {
    const parsed = parseStatement(ITEMS);
    if ("error" in parsed) throw new Error(parsed.error);
    // 26,000.00 read the Serbian way is 26.00000 — twenty-six dinars.
    const wrong = { ...parsed, rows: parsed.rows.map((r) => ({ ...r, paidOut: r.paidOut / 1000 })) };
    expect(reconcile(wrong).ok).toBe(false);
  });

  it("refuses a statement with a row dropped at a page break", () => {
    const parsed = parseStatement(ITEMS);
    if ("error" in parsed) throw new Error(parsed.error);
    const wrong = { ...parsed, rows: parsed.rows.filter((_, i) => i !== 4) };
    const result = reconcile(wrong);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Nothing was brought in");
  });

  it("refuses a statement where a payment was read as a receipt", () => {
    const parsed = parseStatement(ITEMS);
    if ("error" in parsed) throw new Error(parsed.error);
    const wrong = {
      ...parsed,
      rows: parsed.rows.map((r, i) =>
        i === 1 ? { ...r, paidOut: r.paidIn, paidIn: r.paidOut } : r,
      ),
    };
    expect(reconcile(wrong).ok).toBe(false);
  });

  it("refuses a statement that does not reach its own closing balance", () => {
    const parsed = parseStatement(ITEMS);
    if ("error" in parsed) throw new Error(parsed.error);
    const wrong = { ...parsed, closing: parsed.closing! + 100 };
    const result = reconcile(wrong);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Some entries are missing");
  });

  it("names the entry where the chain broke", () => {
    const parsed = parseStatement(ITEMS);
    if ("error" in parsed) throw new Error(parsed.error);
    const wrong = {
      ...parsed,
      rows: parsed.rows.map((r, i) => (i === 2 ? { ...r, paidIn: r.paidIn + 1 } : r)),
    };
    const result = reconcile(wrong);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("entry 3");
    expect(result.error).toContain("2026-08-05");
  });

  it("tolerates a cent of binary rounding and nothing more", () => {
    const parsed = parseStatement(ITEMS);
    if ("error" in parsed) throw new Error(parsed.error);
    const nudge = (by: number) => ({
      ...parsed,
      rows: parsed.rows.map((r, i) => (i === 0 ? { ...r, balance: r.balance + by } : r)),
      closing: parsed.closing,
    });
    expect(reconcile(nudge(0.001)).ok).toBe(true);
    expect(reconcile(nudge(0.01)).ok).toBe(false);
  });
});

describe("bankRef", () => {
  it("tells two identical payments on one day apart by the balance after each", () => {
    /*
      Two coffees at the same place on the same day for the same money are one row
      printed twice, and a key made of date, amount and description would treat the
      second as a duplicate and lose a real payment. The running balance is different by
      construction, so it is what separates them.
    */
    const twin = {
      on: "2026-08-03",
      transactedOn: null,
      description: "MAXI 0231 BEOGRAD",
      paidOut: 500,
      paidIn: 0,
      balance: 1000,
    };
    expect(bankRef(twin)).not.toBe(bankRef({ ...twin, balance: 500 }));
    expect(bankRef(twin)).toBe(bankRef({ ...twin }));
  });

  it("signs money going out", () => {
    const parsed = parseStatement(ITEMS);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(bankRef(parsed.rows[0])).toBe("rba:2026-08-01:-26000.00:131895.85");
  });
});
