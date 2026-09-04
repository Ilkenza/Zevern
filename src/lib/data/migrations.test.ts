import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every table this repository creates must also turn row level security on.
 *
 * This test exists because of a real leak, not a hypothetical one. Five backup tables
 * were made by hand against the live project and nobody enabled RLS on them, so the
 * anonymous key — the one shipped in the browser bundle — could read 1.800 rows of a
 * real ledger: dates, names and amounts. Nothing in the codebase noticed, because
 * nothing in the codebase was looking.
 *
 * It cannot see a table somebody creates by hand, and that is worth being honest about:
 * what it enforces is that the repository never *describes* an unprotected table, which
 * is the half of the problem a test can hold. The other half is a rule rather than a
 * check — a table that is not in a migration does not exist as far as this app is
 * concerned, and the migration is where the check bites.
 *
 * RLS is turned on two ways in these files: named outright, or looped over an array of
 * names inside a `do $$` block. Both count; a scanner that only understood the first
 * would report eight false alarms and be switched off within a week.
 */

const DIR = join(process.cwd(), "supabase/migrations");

function migrations(): { name: string; sql: string }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(DIR, name), "utf8") }));
}

/** `create table [if not exists] [public.]name` */
function tablesCreated(sql: string): string[] {
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;
  return [...sql.matchAll(re)].map((m) => m[1].toLowerCase());
}

/** Named outright, or listed in an array inside a block that enables RLS. */
function tablesSecured(sql: string): string[] {
  const out = new Set<string>();

  const direct = /alter\s+table\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi;
  for (const m of sql.matchAll(direct)) out.add(m[1].toLowerCase());

  for (const block of sql.split(/do\s+\$\$/i).slice(1)) {
    if (!/enable\s+row\s+level\s+security/i.test(block)) continue;
    for (const arr of block.matchAll(/array\s*\[([^\]]*)\]/gi)) {
      for (const name of arr[1].matchAll(/'([a-z_][a-z0-9_]*)'/gi)) out.add(name[1].toLowerCase());
    }
  }
  return [...out];
}

describe("migrations never describe an unprotected table", () => {
  const files = migrations();

  /* Without this the walk could pass by finding nothing at all — which is how a guard
     quietly stops guarding after a directory is renamed. */
  it("has migrations to read", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => tablesCreated(f.sql).length > 0)).toBe(true);
  });

  it("enables row level security on every table it creates", () => {
    const created = new Map<string, string>();
    const secured = new Set<string>();
    for (const f of files) {
      for (const t of tablesCreated(f.sql)) if (!created.has(t)) created.set(t, f.name);
      for (const t of tablesSecured(f.sql)) secured.add(t);
    }

    const unprotected = [...created]
      .filter(([t]) => !secured.has(t))
      .map(([t, file]) => `${t} (created in ${file})`);

    expect(created.size).toBeGreaterThan(15);
    expect(unprotected).toEqual([]);
  });
});
