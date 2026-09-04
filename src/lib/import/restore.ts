/**
 * The way back in.
 *
 * The export screen promised "everything on this account, on your own disk" and
 * delivered it — and then there was nothing to do with the file. A backup you cannot
 * restore is a file, not a backup: the one moment it exists for is the one moment it
 * could not help.
 *
 * So this reads that file back, and it only ever *adds*. A row whose id is already in
 * the database is left exactly as it is — never overwritten, never deleted. That is not
 * timidity, it is what makes the thing safe to press: an import that can overwrite is
 * one you have to be certain about before running, and nobody restoring a backup is
 * certain about anything. They are looking for something that went missing.
 *
 * The consequence worth knowing: running the same file twice does what running it once
 * did. The second pass finds everything already there and adds nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportData, ExportRow } from "@/lib/export/collect";

/**
 * Every table the restore writes, parents before children.
 *
 * The order is the foreign-key graph read topologically — not the export's order and
 * not alphabetical. `money_transactions` points at accounts, categories, goals, loans,
 * recurring rules and budgets, so all six have to be in the database before the first
 * entry lands or Postgres rejects the lot. Getting this wrong corrupts nothing — the
 * insert simply fails — but it fails halfway down a list, which is the worst place to
 * stop.
 *
 * Two tables are deliberately absent. `profiles` is the account row itself — it already
 * exists, and "add only what is missing" cannot apply to a row that is by definition
 * there. `ext_usage` is a per-day counter keyed by `(user_id, day)`, with no id and
 * nothing of yours in it; restoring last year's read and write counts into an account
 * would be restoring somebody's odometer.
 */
export const RESTORE_ORDER = [
  // Freelance: a client is the root of nearly everything above it.
  "clients",
  "projects",
  "invoices",
  "quotes",
  "leads",
  "tasks",
  "seo_checks",
  "service_items",
  "outreach_templates",
  "tools",
  // Money: the things an entry can point at, then the plans, then the entries.
  "money_accounts",
  "money_categories",
  "money_goals",
  "money_loans",
  "money_budget_plans",
  "money_budgets",
  "money_items",
  "money_recurring",
  "money_transactions",
  "money_planned",
  "money_budget_amounts",
  "money_budget_categories",
  "money_budget_accounts",
  "money_budget_boosts",
] as const;

export type RestoreTable = (typeof RESTORE_ORDER)[number];

const RESTORE_SET = new Set<string>(RESTORE_ORDER);

/** In every export, never restored, and not a fault when the file carries them. */
const NEVER_RESTORED = new Set(["profiles", "ext_usage"]);

/**
 * The two tables carrying neither an id nor a user.
 *
 * They are links — `(budget_id, category_id)` and `(budget_id, account_id)` — so the
 * pair is both the identity of a row and the whole of it. They are also the only rows
 * whose owner lives in somebody else's column: the database grants them through the
 * budget they hang off, and so does this.
 */
const LINK_KEYS: Partial<Record<RestoreTable, [string, string]>> = {
  money_budget_categories: ["budget_id", "category_id"],
  money_budget_accounts: ["budget_id", "account_id"],
};

/** A file this size is not a backup of this account. */
export const MAX_BYTES = 12 * 1024 * 1024;
/** Nor is one this long. Sixteen thousand ledger rows is years; fifty thousand is a mistake. */
export const MAX_ROWS = 50_000;
/** Rows per insert — one round trip a table for a normal account, small enough not to time out. */
const CHUNK = 500;
/** Ids per existence check. A longer `in()` list is a URL some proxy will refuse. */
const LOOKUP = 200;

export type ParsedBackup = {
  data: ExportData;
  /** Tables in the file this app does not restore — reported rather than silently dropped. */
  ignored: string[];
  /** Rows across every table the restore recognises. */
  rows: number;
};

export type ParseResult = { ok: true; backup: ParsedBackup } | { ok: false; error: string };

/**
 * The file, checked before anything about it is believed.
 *
 * Everything here fails loudly and changes nothing, because it runs before a single row
 * is read from the database — the cheapest place to find out a file is not what it
 * claims. What it does *not* do is trust the file's `user_id` columns: those are
 * overwritten later with the signed-in account's. A file carrying somebody else's id
 * cannot write a row that is not yours.
 */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BYTES) {
    return { ok: false, error: "That file is too large to be a backup of this account." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "That file is not readable JSON. Pick the file the Download button made.",
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "That file is not a Zevern backup." };
  }

  const raw = (parsed as { data?: unknown }).data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "That file has no data section, so it is not a Zevern backup." };
  }

  const data: ExportData = {};
  const ignored: string[] = [];
  let rows = 0;

  for (const [table, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!RESTORE_SET.has(table)) {
      // Both of these are in every export and neither is ever restored — see the note on
      // `RESTORE_ORDER`. Naming them as unread would read as a fault rather than the rule.
      if (!NEVER_RESTORED.has(table)) ignored.push(table);
      continue;
    }
    if (!Array.isArray(value)) {
      return { ok: false, error: `The ${table} section of that file is not a list of rows.` };
    }
    for (const row of value) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return { ok: false, error: `${table} in that file holds something that is not a row.` };
      }
    }
    data[table] = value as ExportRow[];
    rows += value.length;
  }

  if (rows === 0) return { ok: false, error: "There is nothing in that file to bring in." };
  if (rows > MAX_ROWS) {
    return { ok: false, error: "That file holds more rows than this import will take at once." };
  }

  return { ok: true, backup: { data, ignored, rows } };
}

export type TablePlan = {
  table: RestoreTable;
  /** Rows that would be inserted. */
  add: number;
  /** Rows already here, which will be left alone. */
  already: number;
  /**
   * Rows dropped because nothing owns them.
   *
   * Only the two link tables can produce these: a link to a budget that is neither in
   * the file nor in the database belongs to no budget of yours, and the database would
   * refuse it anyway. Counted rather than hidden — a total that does not add up is the
   * question this answers before it is asked.
   */
  orphaned: number;
};

export type RestorePlan = { tables: TablePlan[]; add: number; already: number; orphaned: number };

export type PlanResult = { ok: true; plan: RestorePlan } | { ok: false; error: string };

/** Which of `ids` this account already has in `table`, asked in bearable chunks. */
async function existingIds(
  supabase: SupabaseClient,
  table: string,
  ids: string[],
): Promise<{ have: Set<string> } | { error: string }> {
  const have = new Set<string>();
  for (let i = 0; i < ids.length; i += LOOKUP) {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .in("id", ids.slice(i, i + LOOKUP));
    if (error) {
      console.error(`restore read ${table}:`, error.message);
      return { error: `Could not read your existing ${table}. Nothing was brought in.` };
    }
    for (const row of data ?? []) have.add(String((row as { id: unknown }).id));
  }
  return { have };
}

/** The budgets this account owns — the gate the two link tables pass through. */
async function ownedBudgets(
  supabase: SupabaseClient,
  uid: string,
): Promise<{ ids: Set<string> } | { error: string }> {
  const { data, error } = await supabase.from("money_budget_plans").select("id").eq("user_id", uid);
  if (error) {
    console.error("restore read budgets:", error.message);
    return { error: "Could not read your budgets. Nothing was brought in." };
  }
  return { ids: new Set((data ?? []).map((row) => String((row as { id: unknown }).id))) };
}

/**
 * One row, made this account's.
 *
 * `user_id` is not read from the file, it is written over. The file is something a
 * person picked off their own disk and it may have come from anywhere — a second
 * account of theirs, or something somebody sent them — and a row arriving with another
 * owner on it must never be stored as that owner's. The database refuses it too; doing
 * it here is what makes the outcome a restored row rather than a policy error.
 *
 * The link tables have no `user_id` column at all, so carrying one would fail the
 * insert outright. Theirs is checked through the budget instead.
 */
function own(table: RestoreTable, row: ExportRow, uid: string): ExportRow {
  const out: ExportRow = { ...row };
  if (LINK_KEYS[table]) {
    delete out.user_id;
    return out;
  }
  out.user_id = uid;
  return out;
}

/** Rows of one table that are not already here, with the ones nothing owns set aside. */
async function pendingFor(
  supabase: SupabaseClient,
  uid: string,
  table: RestoreTable,
  rows: ExportRow[],
  budgets: Set<string>,
): Promise<{ add: ExportRow[]; already: number; orphaned: number } | { error: string }> {
  const link = LINK_KEYS[table];

  if (link) {
    const [parent, child] = link;
    const mine: ExportRow[] = [];
    let orphaned = 0;
    for (const row of rows) {
      // A link whose budget is not one of yours is not yours to add, whatever the file
      // says. Same rule the database enforces, asked first so the answer is a count
      // rather than an error.
      if (budgets.has(String(row[parent] ?? ""))) mine.push(row);
      else orphaned++;
    }

    const budgetIds = [...new Set(mine.map((row) => String(row[parent])))];
    const here = new Set<string>();
    for (let i = 0; i < budgetIds.length; i += LOOKUP) {
      /*
        `*` rather than the two columns by name. A link table holds exactly those two
        columns, so this asks for nothing extra — and a column list built from variables
        is a string the client's own type parser cannot read, which turns a correct query
        into a compile error for no gain at runtime.
      */
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .in(parent, budgetIds.slice(i, i + LOOKUP));
      if (error) {
        console.error(`restore read ${table}:`, error.message);
        return { error: `Could not read your existing ${table}. Nothing was brought in.` };
      }
      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        here.add(`${String(r[parent])} ${String(r[child])}`);
      }
    }

    const add: ExportRow[] = [];
    const seen = new Set<string>(here);
    let already = 0;
    for (const row of mine) {
      const key = `${String(row[parent])} ${String(row[child])}`;
      // `seen` grows as it goes, so a file listing the same link twice adds it once —
      // otherwise the insert fails on the table's own primary key.
      if (seen.has(key)) {
        already++;
        continue;
      }
      seen.add(key);
      add.push(own(table, row, uid));
    }
    return { add, already, orphaned };
  }

  const ids: string[] = [];
  for (const row of rows) {
    const id = row.id;
    if (typeof id !== "string" || id === "") {
      return { error: `A row in ${table} has no id, so it cannot be checked against yours.` };
    }
    ids.push(id);
  }

  const found = await existingIds(supabase, table, [...new Set(ids)]);
  if ("error" in found) return { error: found.error };

  const add: ExportRow[] = [];
  const seen = new Set<string>(found.have);
  let already = 0;
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id)) {
      already++;
      continue;
    }
    seen.add(id);
    add.push(own(table, row, uid));
  }
  return { add, already, orphaned: 0 };
}

/**
 * Every budget the links may hang off: the ones already here, plus the ones this same
 * file is about to add.
 *
 * Without the second half, a restore into a wiped account reports every category and
 * account link as orphaned — the budgets they point at are in the file and not yet in
 * the database, so the preview would say "0 to add, 14 orphaned" about a file that
 * restores perfectly. The commit inserts budgets first, so by the time the links are
 * written the gate is true.
 */
function budgetGateFor(owned: Set<string>, data: ExportData): Set<string> {
  const gate = new Set(owned);
  for (const row of data["money_budget_plans"] ?? []) {
    if (typeof row.id === "string") gate.add(row.id);
  }
  return gate;
}

/** What the file would change, without changing it. */
export async function planRestore(
  supabase: SupabaseClient,
  uid: string,
  data: ExportData,
): Promise<PlanResult> {
  const owned = await ownedBudgets(supabase, uid);
  if ("error" in owned) return { ok: false, error: owned.error };
  const budgets = budgetGateFor(owned.ids, data);

  const tables: TablePlan[] = [];
  let add = 0;
  let already = 0;
  let orphaned = 0;

  for (const table of RESTORE_ORDER) {
    const rows = data[table];
    if (!rows || rows.length === 0) continue;
    const pending = await pendingFor(supabase, uid, table, rows, budgets);
    if ("error" in pending) return { ok: false, error: pending.error };
    tables.push({
      table,
      add: pending.add.length,
      already: pending.already,
      orphaned: pending.orphaned,
    });
    add += pending.add.length;
    already += pending.already;
    orphaned += pending.orphaned;
  }

  return { ok: true, plan: { tables, add, already, orphaned } };
}

export type RestoreOutcome = {
  added: number;
  /** Per table, so the screen can say where it went rather than only how much. */
  tables: { table: RestoreTable; added: number }[];
  /**
   * Set when a table failed partway.
   *
   * Everything before it is in and stays in — this cannot roll back across tables, and
   * pretending otherwise would be worse than saying so. Running the same file again is
   * safe and picks up where this stopped, because a row already here is skipped.
   */
  error?: string;
};

/** Insert what is missing, parents first. */
export async function commitRestore(
  supabase: SupabaseClient,
  uid: string,
  data: ExportData,
): Promise<RestoreOutcome> {
  const owned = await ownedBudgets(supabase, uid);
  if ("error" in owned) return { added: 0, tables: [], error: owned.error };
  const budgets = budgetGateFor(owned.ids, data);

  const tables: { table: RestoreTable; added: number }[] = [];
  let added = 0;

  for (const table of RESTORE_ORDER) {
    const rows = data[table];
    if (!rows || rows.length === 0) continue;

    const pending = await pendingFor(supabase, uid, table, rows, budgets);
    if ("error" in pending) return { added, tables, error: pending.error };
    if (pending.add.length === 0) continue;

    for (let i = 0; i < pending.add.length; i += CHUNK) {
      const slice = pending.add.slice(i, i + CHUNK);
      const { error } = await supabase.from(table).insert(slice);
      if (error) {
        console.error(`restore insert ${table}:`, error.message);
        return {
          added,
          tables,
          error:
            `Stopped at ${table}: ${error.message} — everything before it is in and stays. ` +
            `Nothing was overwritten, so running the same file again carries on from here.`,
        };
      }
      added += slice.length;
    }

    tables.push({ table, added: pending.add.length });
  }

  return { added, tables };
}
