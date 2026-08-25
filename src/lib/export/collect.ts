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
  "money_budgets",
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
 * `profiles` is keyed by `id`, every other table by `user_id`. RLS would scope these
 * anyway; the explicit filter is here so the export cannot depend on a policy being
 * right, and so a read that returns nothing is unambiguous.
 */
function ownerColumn(table: string): "id" | "user_id" {
  return table === "profiles" ? "id" : "user_id";
}

export async function collectExport(): Promise<ExportResult> {
  const supabase = await createClient();
  const uid = await userId(supabase);
  if (!uid) return { ok: false, error: "Not signed in." };

  const data: ExportData = {};
  const counts: Record<string, number> = {};

  for (const table of EXPORT_TABLES) {
    const { data: rows, error } = await supabase
      .from(table)
      .select("*")
      .eq(ownerColumn(table), uid);

    // One failed table fails the whole export. Half a copy of your data, handed over
    // as though it were all of it, is the outcome this is written to prevent.
    if (error) {
      console.error(`export ${table}:`, error.message);
      return { ok: false, error: `Could not read ${table}. Nothing was exported.` };
    }

    data[table] = (rows ?? []) as ExportRow[];
    counts[table] = data[table].length;
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
