/*
  Is the CSS the browser is serving the CSS that is on disk?

  Turbopack's dev cache has handed back a stale stylesheet more than once, and the
  symptom is indistinguishable from a change that did not work: the selector is right,
  the file is saved, and the screen is wrong. That ambiguity is expensive — it has cost
  this project several rounds of chasing a layout bug that was already fixed.

  So: answer it mechanically instead of guessing. Run it whenever the screen disagrees
  with the file:  npm run css:check

  What it compares, and why so narrowly. The built stylesheet is not a copy of the
  source — colours become hex, `200ms` becomes `.2s`, `0.5rem` becomes `.5rem`,
  `align-self` and `justify-self` are folded into one `place-self`. Comparing those
  produces a hundred differences in a file that is perfectly up to date, which is worse
  than no check at all. So only declarations that survive the trip untouched are
  compared: plain lengths and keywords, on properties nothing folds together.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* Overridable so the check itself can be tested against a doctored copy. */
const SRC = process.argv[2] ?? "src/app/globals.css";
const DIR = ".next/dev/static/chunks";

/* Properties no minifier folds into a shorthand. */
const SAFE = new Set([
  "min-height", "max-height", "min-width", "max-width", "width", "height",
  "border-radius", "font-size", "font-weight", "z-index", "flex-shrink", "flex-grow",
  "line-height", "border-bottom-width", "border-top-width", "column-gap", "row-gap",
  "text-transform", "text-align", "text-overflow", "white-space", "overflow",
  "overflow-x", "overflow-y", "position", "display", "cursor", "visibility",
  "field-sizing", "border-bottom-style", "pointer-events", "flex-direction",
]);

/* `0.5rem` and `.5rem` are the same declaration written two ways. */
const norm = (s) => s.replace(/\b0+(\.\d)/g, "$1").replace(/\s+/g, " ").trim();

let chunk;
try {
  const newest = readdirSync(DIR)
    .filter((f) => f.startsWith("src_app_globals_css_") && f.endsWith(".single.css"))
    .map((f) => ({ f, t: statSync(join(DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0];
  if (!newest) throw new Error("nothing built");
  chunk = { name: newest.f, text: readFileSync(join(DIR, newest.f), "utf8"), t: newest.t };
} catch {
  console.log("Dev server is not running — there is no built stylesheet to compare against.");
  process.exit(0);
}

const src = readFileSync(SRC, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const hay = norm(chunk.text);

const wanted = new Set(
  [...src.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)]
    .filter(([, prop, val]) => SAFE.has(prop) && !/[(),!]/.test(val))
    .map(([, prop, val]) => norm(`${prop}: ${val}`)),
);

const missing = [...wanted].filter((d) => !hay.includes(d));

/*
  Selectors survive intact, apart from `::before` written `:before` — but combinators
  and `:nth-child(n + 5)` get their spacing rewritten, so only plain class chains are
  compared. A stale stylesheet is stale as a whole; catching it does not need every
  selector, only some that are certain.
*/
const sel = new Set(
  [...src.matchAll(/(?:^|\})\s*(\.[a-z][^{}@]*?)\s*\{/gi)]
    .map(([, s]) => norm(s.replace(/::(before|after)\b/g, ":$1")))
    .filter((s) => s.length < 70 && !/[()+~>*\n]/.test(s)),
);
const noSel = [...sel].filter((s) => !hay.includes(s));

const skew = Math.round((statSync(SRC).mtimeMs - chunk.t) / 1000);
console.log(`source: ${SRC}`);
console.log(`built:  ${chunk.name}`);
console.log(`        ${skew > 0 ? `${skew}s older than the source` : `${-skew}s newer than the source`}`);
console.log(`checked: ${wanted.size} declarations, ${sel.size} selectors`);

if (missing.length === 0 && noSel.length === 0) {
  console.log("\n✓ FRESH — what the browser is showing is what is in the file.");
} else {
  console.log(`\n✗ STALE — these never reached the browser:`);
  noSel.slice(0, 6).forEach((s) => console.log("   selector  " + s));
  missing.slice(0, 6).forEach((d) => console.log("   rule      " + d));
  const more = missing.length + noSel.length - Math.min(6, noSel.length) - Math.min(6, missing.length);
  if (more > 0) console.log(`   … and ${more} more`);
  console.log("\nStop the dev server, then: npm run dev:clean");
  process.exitCode = 1;
}
