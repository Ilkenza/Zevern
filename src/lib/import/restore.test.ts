import { describe, expect, it } from "vitest";
import { EXPORT_TABLES } from "@/lib/export/collect";
import {
  MAX_ROWS,
  RESTORE_ORDER,
  commitRestore,
  parseBackup,
  planRestore,
} from "./restore";

const UID = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

/** A backup file, as JSON text. */
function backup(data: Record<string, unknown>): string {
  return JSON.stringify({ app: "Zevern", exported_at: "2026-09-04T00:00:00Z", data });
}

/* -------------------------------------------------------------------- parsing */

describe("parseBackup", () => {
  it("reads a file the export wrote", () => {
    const result = parseBackup(backup({ clients: [{ id: "c1", user_id: UID, name: "Acme" }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.rows).toBe(1);
    expect(result.backup.data.clients).toHaveLength(1);
  });

  it("refuses anything that is not a Zevern backup", () => {
    for (const text of ["", "not json", "[]", "null", '"a"', "{}", '{"data":[]}']) {
      expect(parseBackup(text).ok, text).toBe(false);
    }
  });

  it("refuses a table section that is not a list of rows", () => {
    const result = parseBackup(backup({ clients: { id: "c1" } }));
    expect(result.ok).toBe(false);
  });

  it("refuses a list holding something that is not a row", () => {
    for (const junk of [["c1"], [null], [[1, 2]], [42]]) {
      expect(parseBackup(backup({ clients: junk })).ok).toBe(false);
    }
  });

  it("never restores profiles, and does not call it ignored either", () => {
    // It is the account row. It already exists, so "add what is missing" cannot apply —
    // and reporting it as unread would read as a fault rather than as the rule.
    const result = parseBackup(
      backup({ profiles: [{ id: UID, rate_usd: 1 }], clients: [{ id: "c1" }] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.data.profiles).toBeUndefined();
    expect(result.backup.ignored).toEqual([]);
    expect(result.backup.rows).toBe(1);
  });

  it("names a table it does not restore rather than dropping it silently", () => {
    const result = parseBackup(backup({ clients: [{ id: "c1" }], something_else: [{ id: "x" }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.ignored).toEqual(["something_else"]);
    expect(result.backup.data.something_else).toBeUndefined();
  });

  it("refuses a file with more rows than it will take at once", () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ id: `c${i}` }));
    expect(parseBackup(backup({ clients: rows })).ok).toBe(false);
  });
});

/* --------------------------------------------------------------------- shape */

describe("RESTORE_ORDER", () => {
  it("covers every exported table except the two that are not yours", () => {
    /*
      The export's promise is a complete copy; this is the other half of it. A table
      added to one list and forgotten in the other is a backup that silently cannot
      restore part of itself.

      Two are excluded on purpose. `profiles` is the account row and always exists.
      `ext_usage` is a per-day counter with no id in it — restoring last year's read and
      write counts would be restoring somebody's odometer.
    */
    const restorable = EXPORT_TABLES.filter((t) => t !== "profiles" && t !== "ext_usage");
    expect([...RESTORE_ORDER].sort()).toEqual([...restorable].sort());
  });

  it("puts every parent before its children", () => {
    /*
      The foreign keys as the database reports them. `money_transactions` points at six
      tables, so all six have to land first or Postgres rejects the entries — and the
      failure would come halfway down a list of tables, which is the worst place to stop.
    */
    const EDGES: [string, string][] = [
      ["invoices", "clients"],
      ["leads", "clients"],
      ["projects", "clients"],
      ["quotes", "clients"],
      ["quotes", "invoices"],
      ["seo_checks", "projects"],
      ["tasks", "projects"],
      ["money_budgets", "money_categories"],
      ["money_items", "money_categories"],
      ["money_planned", "money_accounts"],
      ["money_planned", "money_categories"],
      ["money_planned", "money_transactions"],
      ["money_recurring", "money_accounts"],
      ["money_recurring", "money_categories"],
      ["money_recurring", "money_goals"],
      ["money_recurring", "money_loans"],
      ["money_transactions", "money_accounts"],
      ["money_transactions", "money_budget_plans"],
      ["money_transactions", "money_categories"],
      ["money_transactions", "money_goals"],
      ["money_transactions", "money_loans"],
      ["money_transactions", "money_recurring"],
      ["money_budget_accounts", "money_accounts"],
      ["money_budget_accounts", "money_budget_plans"],
      ["money_budget_amounts", "money_budget_plans"],
      ["money_budget_boosts", "money_budget_plans"],
      ["money_budget_categories", "money_budget_plans"],
      ["money_budget_categories", "money_categories"],
    ];
    const at = new Map(RESTORE_ORDER.map((t, i) => [t as string, i]));
    for (const [child, parent] of EDGES) {
      expect(at.has(child) && at.has(parent), `${child} → ${parent}`).toBe(true);
      expect(at.get(parent)!, `${parent} must come before ${child}`).toBeLessThan(at.get(child)!);
    }
  });
});

/* ------------------------------------------------------------------ the fake db */

type Row = Record<string, unknown>;

/**
 * Just enough of the client for these rules to be exercised without a database.
 *
 * It records every insert exactly as it was handed over, which is the point: the claim
 * under test is what lands in the table, and a mock that tidies the rows on the way in
 * would be testing itself.
 */
function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { ...seed };
  const inserted: { table: string; rows: Row[] }[] = [];
  let failOn: string | null = null;

  const client = {
    from(table: string) {
      const rows = () => tables[table] ?? [];
      const q = {
        _col: "",
        _values: [] as string[],
        select() {
          return q;
        },
        in(col: string, values: string[]) {
          q._col = col;
          q._values = values;
          return Promise.resolve({
            data: rows().filter((r) => values.includes(String(r[col]))),
            error: null,
          }).then((v) => v) as unknown as Promise<{ data: Row[] | null; error: null }>;
        },
        eq(col: string, value: string) {
          return Promise.resolve({
            data: rows().filter((r) => String(r[col]) === value),
            error: null,
          }) as unknown as Promise<{ data: Row[] | null; error: null }>;
        },
        insert(payload: Row[]) {
          if (failOn === table) {
            return Promise.resolve({ error: { message: "boom" } });
          }
          inserted.push({ table, rows: payload });
          tables[table] = [...rows(), ...payload];
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  };

  return {
    client: client as never,
    inserted,
    tables,
    failAt(table: string) {
      failOn = table;
    },
  };
}

const rowsFor = (db: ReturnType<typeof fakeDb>, table: string) =>
  db.inserted.filter((i) => i.table === table).flatMap((i) => i.rows);

/* ------------------------------------------------------------------- planning */

describe("planRestore", () => {
  it("counts what is missing and leaves what is here", async () => {
    const db = fakeDb({ clients: [{ id: "c1", user_id: UID }] });
    const result = await planRestore(db.client, UID, {
      clients: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.add).toBe(2);
    expect(result.plan.already).toBe(1);
  });

  it("counts a row the file lists twice only once", async () => {
    // Two rows with one id would fail the insert on the primary key, and a preview that
    // promised three is a preview that lied about the thing it exists to promise.
    const db = fakeDb();
    const result = await planRestore(db.client, UID, {
      clients: [{ id: "c1" }, { id: "c1" }, { id: "c2" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.add).toBe(2);
    expect(result.plan.already).toBe(1);
  });

  it("counts a link to a budget arriving in the same file as addable", async () => {
    /*
      The empty-account case, and the one most likely to be got wrong: the budget the
      link hangs off is in the file, not yet in the database. Reading only the database
      would report the whole restore as orphaned.
    */
    const db = fakeDb();
    const result = await planRestore(db.client, UID, {
      money_budget_plans: [{ id: "b1", user_id: UID }],
      money_budget_categories: [{ budget_id: "b1", category_id: "cat1" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.orphaned).toBe(0);
    expect(result.plan.tables.find((t) => t.table === "money_budget_categories")?.add).toBe(1);
  });

  it("sets aside a link whose budget is nobody's", async () => {
    const db = fakeDb();
    const result = await planRestore(db.client, UID, {
      money_budget_categories: [{ budget_id: "someone-elses", category_id: "cat1" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.orphaned).toBe(1);
    expect(result.plan.add).toBe(0);
  });

  it("refuses a row with no id rather than guessing", async () => {
    const db = fakeDb();
    const result = await planRestore(db.client, UID, { clients: [{ name: "no id" }] });
    expect(result.ok).toBe(false);
  });
});

/* -------------------------------------------------------------------- commit */

describe("commitRestore", () => {
  it("writes every row as this account's, whatever the file says", async () => {
    // The security claim of the whole feature. A file is something somebody picked off
    // a disk; a row arriving with another owner on it must never be stored as theirs.
    const db = fakeDb();
    await commitRestore(db.client, UID, {
      clients: [{ id: "c1", user_id: OTHER, name: "Acme" }],
    });
    expect(rowsFor(db, "clients")).toEqual([{ id: "c1", user_id: UID, name: "Acme" }]);
  });

  it("strips user_id from the link tables, which have no such column", async () => {
    const db = fakeDb();
    await commitRestore(db.client, UID, {
      money_budget_plans: [{ id: "b1", user_id: OTHER }],
      money_budget_categories: [{ budget_id: "b1", category_id: "cat1", user_id: OTHER }],
    });
    expect(rowsFor(db, "money_budget_categories")).toEqual([
      { budget_id: "b1", category_id: "cat1" },
    ]);
    expect(rowsFor(db, "money_budget_plans")).toEqual([{ id: "b1", user_id: UID }]);
  });

  it("never inserts a row that is already here", async () => {
    const db = fakeDb({ clients: [{ id: "c1", user_id: UID, name: "Mine" }] });
    const outcome = await commitRestore(db.client, UID, {
      clients: [{ id: "c1", name: "From the file" }, { id: "c2" }],
    });
    expect(outcome.added).toBe(1);
    expect(rowsFor(db, "clients")).toEqual([{ id: "c2", user_id: UID }]);
    // And the row that was here is untouched — no update, no overwrite.
    expect(db.tables.clients[0]).toEqual({ id: "c1", user_id: UID, name: "Mine" });
  });

  it("does nothing the second time the same file is run", async () => {
    const db = fakeDb();
    const data = { clients: [{ id: "c1" }, { id: "c2" }] };
    const first = await commitRestore(db.client, UID, data);
    const second = await commitRestore(db.client, UID, data);
    expect(first.added).toBe(2);
    expect(second.added).toBe(0);
    expect(db.tables.clients).toHaveLength(2);
  });

  it("inserts parents before children", async () => {
    const db = fakeDb();
    await commitRestore(db.client, UID, {
      money_transactions: [{ id: "t1", account_id: "a1" }],
      money_accounts: [{ id: "a1" }],
      clients: [{ id: "c1" }],
      projects: [{ id: "p1", client_id: "c1" }],
    });
    const order = db.inserted.map((i) => i.table);
    expect(order.indexOf("clients")).toBeLessThan(order.indexOf("projects"));
    expect(order.indexOf("money_accounts")).toBeLessThan(order.indexOf("money_transactions"));
  });

  it("says what it managed before it stopped, and keeps it", async () => {
    /*
      There is no transaction across tables here, so a failure partway leaves rows in.
      Reporting a clean failure would be a lie about the state of the database — and
      since nothing is ever overwritten, running the file again simply carries on.
    */
    const db = fakeDb();
    db.failAt("projects");
    const outcome = await commitRestore(db.client, UID, {
      clients: [{ id: "c1" }],
      projects: [{ id: "p1", client_id: "c1" }],
    });
    expect(outcome.error).toContain("projects");
    expect(outcome.added).toBe(1);
    expect(rowsFor(db, "clients")).toHaveLength(1);
  });
});
