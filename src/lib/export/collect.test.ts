import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPORT_TABLES, exportStem, scopeFor, toCsv } from "./collect";

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

/*
  The check that would have caught it.

  The list above is written by hand, and the test that guarded it was written by hand
  too — so both said the same thing and both were missing the same seven tables. A list
  cannot check itself. This reads the migrations, which is where a table actually comes
  into existence, and asks whether each one ever reached the export.

  It is one direction of the check only: a table created straight against the database,
  with no migration written for it, is invisible here as well. Two of them exist —
  `money_budget_boosts` and `money_budget_amounts` — which is worth knowing on its own.
*/
describe("every table that exists is exported", () => {
  /** Created once and dropped since. Listed rather than guessed, so the reason survives. */
  const GONE = new Set(["seo_usage"]);

  it("misses no table any migration creates", () => {
    const dir = fileURLToPath(new URL("../../../supabase/migrations", import.meta.url));
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");

    const made = new Set<string>();
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)/gi)) {
      if (!GONE.has(m[1])) made.add(m[1]);
    }

    expect(made.size).toBeGreaterThan(15);
    expect([...made].filter((t) => !(EXPORT_TABLES as readonly string[]).includes(t))).toEqual([]);
  });

  it("names no table twice", () => {
    expect(new Set(EXPORT_TABLES).size).toBe(EXPORT_TABLES.length);
  });
});

describe("exportStem", () => {
  it("names the file after the day it was taken", () => {
    expect(exportStem("2026-08-25")).toBe("zevern-export-2026-08-25");
  });
});

describe("every exported table can actually be read", () => {
  /**
   * The four tables in this database that are not `(id, user_id)`, and how the export
   * has to reach each one.
   *
   * This exists because `Download everything` was broken and nobody knew. `ext_usage`
   * is keyed by `(user_id, day)` and has no `id` column, so the default scope ordered
   * it by a column that does not exist; PostgREST said so, and the export's own rule —
   * one unreadable table fails the whole file — did the rest. The button produced no
   * file at all, and had not since that table joined the list.
   *
   * A list of table names is easy to add to and a list of exceptions is easy to forget,
   * so this pins the exceptions rather than the list. Adding a table with an unusual
   * key now fails here instead of at the download.
   */
  const ODD: Record<string, { owner: string; order: string[] }> = {
    profiles: { owner: "id", order: ["id"] },
    ext_usage: { owner: "user_id", order: ["day"] },
    money_budget_categories: { owner: "budget_id", order: ["budget_id", "category_id"] },
    money_budget_accounts: { owner: "budget_id", order: ["budget_id", "account_id"] },
  };

  it("gives a scope to every table that is not keyed by id", () => {
    for (const [table, want] of Object.entries(ODD)) {
      expect(EXPORT_TABLES, `${table} is no longer exported`).toContain(table);
      expect(scopeFor(table), `${table} needs its own scope`).toEqual(want);
    }
  });

  it("orders every other table by the id it has", () => {
    for (const table of EXPORT_TABLES) {
      if (ODD[table]) continue;
      expect(scopeFor(table), table).toEqual({ owner: "user_id", order: ["id"] });
    }
  });
});
