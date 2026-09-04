import { createClient } from "@/lib/supabase/server";
import { userId } from "@/lib/supabase/current-user";

/**
 * Everything on the account, in one place.
 *
 * The point of an export is that leaving is possible. That makes two things
 * non-negotiable: it has to be complete — every table, not the interesting ones —
 * and it has to fail loudly. An export that silently omits a table because one read
 * errored is worse than no export at all, because the person who took it believes
 * they have their data.
 *
 * Every table is listed here by hand rather than discovered, so adding a table to the
 * schema and forgetting it here shows up as a missing key in a file somebody can
 * actually inspect, rather than as silence.
 */

/** Every table an account owns, in the order a person would want to read them. */
export const EXPORT_TABLES = [
  "profiles",
  "clients",
  "leads",
  "outreach_templates",
  "projects",
  "tasks",
  "quotes",
  "service_items",
  "invoices",
  "seo_checks",
  "tools",
  "money_accounts",
  "money_categories",
  "money_transactions",
  /*
    Seven tables were missing from this list, and every one of them was written after it.

    `money_loans` is what is owed in both directions. `money_budget_plans` and the four
    tables under it are the whole budgets system — its plans, what each allowed and from
    when, the categories and accounts each one watches, and the extra room a one-off
    grants a recurring one. `money_items` is the shopping list.

    Nothing complained, which is the point: the file above promises a complete copy and
    a loud failure, and it delivered a quiet partial one. A table that does not appear
    here is not read, and a person taking their data out has no way to know the
    difference — the export they hold looks exactly like the whole of it.
  */
  "money_items",
  "money_loans",
  "money_budgets",
  "money_budget_plans",
  "money_budget_amounts",
  "money_budget_categories",
  "money_budget_accounts",
  "money_budget_boosts",
  "money_goals",
  "money_recurring",
  "money_planned",
  "ext_usage",
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number];

export type ExportRow = Record<string, unknown>;
export type ExportData = Record<string, ExportRow[]>;

export type ExportResult =
  | { ok: true; data: ExportData; counts: Record<string, number> }
  | { ok: false; error: string };

/**
 * How a table's rows are tied to the account, and what makes a page of them stable.
 *
 * Nearly every table carries `user_id` and a unique `id`, so the default covers it and
 * only the exceptions are written down. `profiles` is the account, keyed by `id`. The
 * two join tables under a budget carry neither: they are `(budget_id, category_id)` and
 * `(budget_id, account_id)`, reached through the budgets the account owns, and ordered
 * by both of their columns because that pair is the only unique thing about a row.
 *
 * The order is not decoration. `range()` is an offset into a result set and Postgres
 * promises nothing about the order of one without `order by` — so page two of an
 * unordered read can repeat or skip rows from page one, which in an export means
 * duplicated or missing records in a file nobody will check.
 */
type Scope = { owner: "id" | "user_id" | "budget_id"; order: string[] };

const DEFAULT_SCOPE: Scope = { owner: "user_id", order: ["id"] };

const SCOPES: Partial<Record<ExportTable, Scope>> = {
  profiles: { owner: "id", order: ["id"] },
  money_budget_categories: { owner: "budget_id", order: ["budget_id", "category_id"] },
  money_budget_accounts: { owner: "budget_id", order: ["budget_id", "account_id"] },
  /*
    A day's counters, keyed by `(user_id, day)` — no `id` column at all.

    Without this line the default scope ordered it by `id`, PostgREST answered that no
    such column exists, and the rule two hundred lines down did exactly what it promises:
    one table that cannot be read fails the whole export. So `Download everything`
    returned `Could not read ext_usage. Nothing was exported.` and had done since the day
    this table joined the list — the button on the screen produced no file at all, ever,
    and the failure was a 500 nobody was looking at.

    The lesson is in the shape of the bug rather than the typo: three tables needed a
    scope, three were written down, and the fourth was added to `EXPORT_TABLES` months
    later by someone reading a list of table names. The test beside this one now checks
    the pair rather than the list.
  */
  ext_usage: { owner: "user_id", order: ["day"] },
};

/**
 * How one table is read — the single place that answers it, so a test can hold the
 * answer up against the schema instead of against a copy of itself.
 */
export function scopeFor(table: string): Scope {
  return SCOPES[table as ExportTable] ?? DEFAULT_SCOPE;
}

/**
 * How many rows PostgREST hands back before it stops, without saying that it did.
 *
 * The export read every table in one `select` with no range, so any table past this
 * came out cut off at exactly a thousand rows — no error, no flag, an ordinary-looking
 * array. A ledger of 1.942 entries exported as 1.000 of them, in a file whose whole
 * promise is that it is everything.
 */
const PAGE = 1000;

/** Sixteen thousand rows of one table is years of a real ledger; past that, something is wrong. */
const MAX_PAGES = 64;

export async function collectExport(): Promise<ExportResult> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return { ok: false, error: "Not signed in." };

  const data: ExportData = {};
  const counts: Record<string, number> = {};

  for (const table of EXPORT_TABLES) {
    const scope = scopeFor(table);

    /*
      The budgets have to be in hand before the two tables that hang off them can be
      read. They are earlier in the list for that reason, so this is a lookup and not a
      second round trip.
    */
    let budgetIds: string[] = [];
    if (scope.owner === "budget_id") {
      budgetIds = (data["money_budget_plans"] ?? []).map((row) => String(row.id));
      if (budgetIds.length === 0) {
        data[table] = [];
        counts[table] = 0;
        continue;
      }
    }

    const rows: ExportRow[] = [];
    for (let i = 0; ; i++) {
      if (i >= MAX_PAGES) {
        return {
          ok: false,
          error: `${table} is larger than this export can read. Nothing was exported.`,
        };
      }

      let query = supabase.from(table).select("*");
      query =
        scope.owner === "budget_id"
          ? query.in("budget_id", budgetIds)
          : query.eq(scope.owner, uid);
      for (const column of scope.order) query = query.order(column);

      const { data: page, error } = await query.range(i * PAGE, i * PAGE + PAGE - 1);

      // One failed table fails the whole export. Half a copy of your data, handed over
      // as though it were all of it, is the outcome this is written to prevent — and a
      // page that fails halfway through is the same thing wearing a longer file.
      if (error) {
        console.error(`export ${table}:`, error.message);
        return { ok: false, error: `Could not read ${table}. Nothing was exported.` };
      }

      const got = (page ?? []) as ExportRow[];
      rows.push(...got);
      // The short page is the last one — which is also why a table whose size is an
      // exact multiple of PAGE costs one empty round trip rather than losing its tail.
      if (got.length < PAGE) break;
    }

    data[table] = rows;
    counts[table] = rows.length;
  }

  return { ok: true, data, counts };
}

/* ------------------------------------------------------------------------ csv */

/**
 * One cell, quoted the way a spreadsheet expects.
 *
 * The leading-character guard is not cosmetic: a cell that opens with `=`, `+`, `-`
 * or `@` is executed as a formula by Excel and Sheets on open. A client called
 * "=cmd|…" in your own export is a real way to be attacked by your own data, so those
 * cells are prefixed with an apostrophe, which spreadsheets strip on display.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text: string;
  if (typeof value === "object") text = JSON.stringify(value);
  else text = String(value);

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (/["\n\r,;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Rows to CSV. The header is the union of every key present, so a row that carries a
 * column the others do not still exports it rather than being quietly trimmed.
 *
 * The separator is a semicolon and the file opens with a BOM, because these files are
 * opened in Excel on a Serbian locale: there, a comma is the decimal separator, and a
 * comma-separated file lands entirely in column A.
 */
export function toCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return "";

  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }

  const lines = [columns.join(";")];
  for (const row of rows) {
    lines.push(columns.map((c) => cell(row[c])).join(";"));
  }

  return `﻿${lines.join("\r\n")}\r\n`;
}

/** `zevern-export-2026-08-25` — the stem both downloads share. */
export function exportStem(today: string): string {
  return `zevern-export-${today}`;
}
