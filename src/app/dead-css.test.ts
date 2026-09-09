import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { describe, expect, it } from "vitest";

/*
  A guard against the thing this stylesheet does when nobody is looking.

  `globals.css` was 12.857 lines, and 102 of the class names in it belonged to layouts
  that had been replaced — the agenda bands the task tabs took over from, the chip rail,
  the on-hand panel, eight button studies kept from an afternoon of trying shapes. None
  of it was reachable, all of it shipped to every visitor, and every one of them made the
  file harder to read for the next person looking for a rule that *is* used.

  That is not a mistake anybody made once. It is what happens each time a design is
  replaced: the new rules are written, the screen looks right, and the old ones are
  invisible from every angle except this one. So it is asked here, on every run, instead
  of being noticed a year later.

  What the check cannot see, it is told: `KEPT` below. Adding a name to it should be rare
  and should carry the reason, because the alternative — a growing list of exceptions — is
  the same problem wearing a different hat.
*/

const ROOT = join(__dirname, "..", "..");
const STYLESHEETS = ["src/app/globals.css", "src/app/motion.css"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "_to_delete", "dist", "build"]);
const READABLE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".html", ".mdx", ".json", ".css"]);

/**
 * Names the scan cannot prove are used, that are used anyway.
 *
 * Empty, and worth keeping that way.
 */
const KEPT: readonly string[] = [];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".next")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (READABLE.has(extname(entry))) out.push(path);
  }
  return out;
}

describe("globals.css", () => {
  it("defines no class that nothing can wear", () => {
    const sheets = STYLESHEETS.map((s) => join(ROOT, s));
    const declared = new Set<string>();
    for (const sheet of sheets) {
      // Comments are prose, and prose names classes it is explaining rather than defining.
      const rules = readFileSync(sheet, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const [, name] of rules.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) declared.add(name);
    }

    const files = [
      ...walk(join(ROOT, "src")),
      ...walk(join(ROOT, "public")),
      ...walk(join(ROOT, "extension")),
    ].filter((f) => !sheets.includes(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
    const source = files.map((f) => readFileSync(f, "utf8")).join("\n");

    /*
      Half the names in this app are built rather than written: `task-tab-${band.tone}`,
      `is-${tone}`, `budget-is-${status}`. Searching for `task-tab-late` finds nothing and
      the class is on the screen. So the prefixes are collected first, and anything a
      prefix could produce is left alone — which is the price of not deleting a live rule.
    */
    const built = [
      ...source.matchAll(/`([a-z][a-z0-9-]*-)\$\{/g),
      ...source.matchAll(/"([a-z][a-z0-9-]*-)"\s*\+/g),
    ].map((m) => m[1]);

    const dead = [...declared]
      .filter((name) => !source.includes(name))
      .filter((name) => !built.some((prefix) => name.startsWith(prefix)))
      .filter((name) => !KEPT.includes(name))
      .sort();

    expect(dead, `these classes are styled and never used:\n  ${dead.join("\n  ")}\n`).toEqual([]);
  });
});
