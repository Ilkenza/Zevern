import { describe, expect, it } from "vitest";
import { EXPORT_TABLES, exportStem, toCsv } from "./collect";

describe("toCsv", () => {
  it("writes a header from the union of every key, not just the first row", () => {
    // A row carrying a column the others lack must still export it. Taking the header
    // off row one silently drops data, which is the one thing an export cannot do.
    const csv = toCsv([{ a: 1 }, { a: 2, b: 3 }]);
    const [header, first, second] = csv.replace("﻿", "").trim().split("\r\n");
    expect(header).toBe("a;b");
    expect(first).toBe("1;");
    expect(second).toBe("2;3");
  });

  it("separates with semicolons and opens with a BOM", () => {
    // Excel on a Serbian locale treats the comma as a decimal separator, so a
    // comma-separated file lands entirely in column A.
    const csv = toCsv([{ name: "Maxi", amount: 2980 }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("name;amount");
  });

  it("defuses a cell that a spreadsheet would run as a formula", () => {
    // A client named "=1+1" is executed on open by Excel and Sheets. The apostrophe
    // is stripped on display, so the value still reads correctly.
    const csv = toCsv([{ name: "=1+1" }, { name: "+44 60 123" }, { name: "@x" }]);
    const rows = csv.replace("﻿", "").trim().split("\r\n").slice(1);
    expect(rows[0]).toBe("'=1+1");
    expect(rows[1]).toBe("'+44 60 123");
    expect(rows[2]).toBe("'@x");
  });

  it("quotes a value containing the separator, a quote or a newline", () => {
    const csv = toCsv([{ note: 'a;b "c"\nd' }]);
    expect(csv).toContain('"a;b ""c""\nd"');
  });

  it("writes nothing at all for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("serialises an object cell rather than printing [object Object]", () => {
    const csv = toCsv([{ items: [{ label: "Design", price: 300 }] }]);
    expect(csv).toContain('[{""label"":""Design"",""price"":300}]');
  });
});

describe("EXPORT_TABLES", () => {
  it("names every table once", () => {
    expect(new Set(EXPORT_TABLES).size).toBe(EXPORT_TABLES.length);
  });

  it("includes the tables a person would notice were missing", () => {
    for (const table of [
      "clients",
      "invoices",
      "leads",
      "projects",
      "tasks",
      "quotes",
      "money_transactions",
      "money_goals",
      "money_recurring",
    ]) {
      expect(EXPORT_TABLES).toContain(table);
    }
  });
});

describe("exportStem", () => {
  it("names the file after the day it was taken", () => {
    expect(exportStem("2026-08-25")).toBe("zevern-export-2026-08-25");
  });
});
