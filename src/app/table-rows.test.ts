import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  A table row may not carry a generated box.

  `.zv-row::before` drew the gold hover rail, and `.zv-row` sits on the `<tr>` of five
  lists — invoices, quotes, projects, clients and SEO checks. Chromium lays a `::before`
  on a table row out as a table cell of its own, in front of the first real one, so every
  row in those lists sat one column to the right of its header: an empty column down the
  left, the title under "Client", the date hanging past the header's edge. It shipped
  and stayed because nothing on screen looked broken until the lists had enough rows to
  be read as a table.

  The rail now lives in the first cell for table rows and on the row itself only for rows
  that are not `<tr>` (the leads and catalog lists are flex rows). This reads the
  stylesheets and refuses any selector that would put a `::before` or `::after` back on a
  table row.
*/

const APP = join(__dirname);
const SHEETS = ["globals.css", "motion.css"].map((f) => ({ name: f, css: readFileSync(join(APP, f), "utf8") }));

/** Every selector in the sheet, comments stripped, one per entry. */
function selectors(css: string): string[] {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  for (const m of plain.matchAll(/([^{}]+)\{/g)) {
    const head = m[1].trim();
    if (head.startsWith("@")) continue;
    out.push(...head.split(",").map((s) => s.trim()).filter(Boolean));
  }
  return out;
}

describe("table rows", () => {
  it("never get a ::before or ::after of their own", () => {
    const offenders: string[] = [];
    for (const { name, css } of SHEETS) {
      for (const sel of selectors(css)) {
        if (!/::?(before|after)\s*$/.test(sel)) continue;
        // The box is generated on whatever the last compound selector matches.
        const target = sel.replace(/::?(before|after)\s*$/, "").split(/\s|>|\+|~/).filter(Boolean).pop() ?? "";
        const namesTr = /^tr\b/.test(target);
        const zvRowAnywhere = /\.zv-row(?![-\w])/.test(target) && !/:not\(tr\)/.test(target);
        if (namesTr || zvRowAnywhere) offenders.push(`${name}: ${sel}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("still draws the rail — on the first cell of a table row, on the row itself otherwise", () => {
    const all = SHEETS.flatMap(({ css }) => selectors(css));
    expect(all).toContain("tr.zv-row > td:first-child::before");
    expect(all).toContain(".zv-row:not(tr)::before");
  });
});
