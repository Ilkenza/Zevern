import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The rule, enforced on the source rather than remembered.
 *
 * Every figure in this app arrives as `{ data, error }` from PostgREST, and the whole
 * class of bug this file exists for is written the same way every time: take `data`, leave
 * `error`, let `?? []` finish the job. An empty list sums to zero. Zero is printed in the
 * same font, the same weight and the same place as a real total, so a broken read and a
 * quiet month are indistinguishable on the screen.
 *
 * Seventy of these were fixed by hand. A test that asserted the fixed ones stay fixed
 * would say nothing about the seventy-first, written next month in a hurry — so this
 * reads the tree instead and fails on the shape, wherever it appears.
 */

const ROOTS = ["src/lib/data", "src/lib/money", "src/app"];

/** Reading `user` off `auth.getUser()` is not a table read; it has its own null path. */
const ALLOWED = [
  /data:\s*\{\s*user\s*\}/,
  /data:\s*\{\s*session\s*\}/,
  // `{ data: … }` as an argument, not a destructure: the payload of an auth write.
  /options:\s*\{\s*data:/,
  /updateUser\(\{\s*data:/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

describe("no read drops its error", () => {
  const files = ROOTS.flatMap(walk);

  it("has a tree to look at", () => {
    // Guards the guard: a walk that finds nothing passes every assertion below.
    expect(files.length).toBeGreaterThan(100);
  });

  it("never destructures data without error", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        // The two shapes a Supabase read is unpacked in: `const { data } = …` and
        // `const { data: rows } = …`, including inside a `Promise.all` array.
        if (!/\{\s*data(\s*[:}])/.test(line)) return;
        if (/\berror\b/.test(line)) return;
        if (ALLOWED.some((re) => re.test(line))) return;
        if (line.trim().startsWith("*") || line.trim().startsWith("//")) return;
        offenders.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
