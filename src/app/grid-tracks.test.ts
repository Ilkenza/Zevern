import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { describe, expect, it } from "vitest";

/*
  The bug that broke the whole app's layout, asked about mechanically.

  `AppShell` had `lg:grid-cols-[260px_1fr]`, and it put every control on every screen off
  the right-hand edge of the window. A `1fr` track is `minmax(auto, 1fr)`: its *floor* is
  its content's min-content width, so instead of letting what is inside it shrink or
  scroll, it grows past the window and takes the page with it. `minmax(0, 1fr)` is the
  same track with no floor, and is what is wanted essentially every time.

  What made it expensive was that it is invisible from inside. The *document* does not
  scroll, so every check for page overflow reports nothing wrong while a button sits off
  the screen; it cost two rounds of looking in the wrong place, and both times he was the
  one who said it was still broken. The measurement that finds it asks whether an
  element's right edge is inside `window.innerWidth` — which needs a browser and a signed
  in session.

  This does not need either. It reads the source and asks a smaller question that catches
  the same class: is there a grid track written as a bare `1fr`? The stylesheet has none —
  every one of its tracks was already `minmax(0, 1fr)` — and the nine that were left in
  Tailwind's arbitrary values are now gone too.

  If a track genuinely wants the content floor, `KEPT` below is where it says so, with the
  reason. A rule with no exception is a rule people delete.
*/

const ROOT = join(__dirname, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "_to_delete", "dist", "build"]);

/** Tracks that mean to keep the min-content floor, and why. */
const KEPT: readonly string[] = [];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".next")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if ([".tsx", ".ts", ".css"].includes(extname(entry))) out.push(path);
  }
  return out;
}

/** Every track this declaration lays out, `minmax(...)` kept whole. */
function tracks(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (depth === 0 && (ch === " " || ch === "_" || ch === ",")) {
      if (current) out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

describe("grid tracks", () => {
  it("never floors a fraction on its own content", () => {
    const offenders: string[] = [];

    for (const file of walk(join(ROOT, "src"))) {
      if (file.endsWith("grid-tracks.test.ts")) continue;
      /*
        Comments are prose, and this file's prose is full of the very thing it is looking
        for — the note above is three paragraphs about `1fr`. Block comments go, and so do
        line comments that start their own line; a `//` in the middle of a line is left
        alone, because that is usually the middle of a URL.
      */
      const text = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");
      const found: string[] = [];

      // Tailwind's arbitrary values: grid-cols-[260px_1fr]
      for (const [, list] of text.matchAll(/grid-(?:cols|rows)-\[([^\]]+)\]/g)) found.push(list);
      // Plain CSS: grid-template-columns: 260px 1fr;
      for (const [, list] of text.matchAll(/grid-template-(?:columns|rows):([^;}]+)/g))
        found.push(list);

      for (const list of found) {
        // `repeat(6, 1fr)` is the same mistake wearing a function.
        const flat = list.replace(/repeat\([^,]+,([^)]*)\)/g, "$1");
        for (const track of tracks(flat)) {
          if (!/^-?[\d.]+fr$/.test(track)) continue;
          if (KEPT.includes(`${file.slice(ROOT.length + 1)}: ${list.trim()}`)) continue;
          offenders.push(`${file.slice(ROOT.length + 1)} — ${list.trim()}`);
        }
      }
    }

    expect(
      [...new Set(offenders)].sort(),
      `a bare fraction floors itself on its content — use minmax(0, 1fr):\n  ${[
        ...new Set(offenders),
      ].join("\n  ")}\n`,
    ).toEqual([]);
  });
});
