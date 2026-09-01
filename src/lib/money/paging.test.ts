import { describe, expect, it } from "vitest";
import { ReadFailed } from "@/lib/data/must";
import { PAGE, readAll } from "./paging";

/**
 * The test that would have caught it.
 *
 * There was none, because the read was "one query and a `?? []`" and the suite covers
 * pure logic. That reasoning is sound and it is also exactly how a silent 1.000-row
 * truncation survived in the function every balance on every screen is built on. The
 * cases below are the ones that were never asserted: more rows than a page, a ledger
 * that lands exactly on the boundary, and a caller that never gets told it was cut off.
 */

/** A fake table of `n` rows that answers `range` the way PostgREST does. */
const table = (n: number) => {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  };
  return { page, calls, rows };
};

describe("readAll", () => {
  it("returns every row when the ledger is larger than one page", async () => {
    const t = table(PAGE + 384); // the size that exposed this on the real database
    const got = await readAll(t.page, "test");
    expect(got).toHaveLength(PAGE + 384);
    expect(got.at(-1)).toEqual({ id: PAGE + 383 });
    expect(t.calls).toEqual([
      [0, PAGE - 1],
      [PAGE, PAGE * 2 - 1],
    ]);
  });

  it("keeps the tail when the ledger is an exact multiple of a page", async () => {
    // The boundary case: a full page is indistinguishable from "there is more", so the
    // walk has to spend one empty request to find out. Losing this costs the last 1.000
    // rows and looks like nothing at all.
    const t = table(PAGE * 2);
    const got = await readAll(t.page, "test");
    expect(got).toHaveLength(PAGE * 2);
    expect(t.calls).toHaveLength(3);
  });

  it("stops after a single request when everything fits", async () => {
    const t = table(12);
    expect(await readAll(t.page, "test")).toHaveLength(12);
    expect(t.calls).toHaveLength(1);
  });

  it("handles an empty table without asking twice", async () => {
    const t = table(0);
    expect(await readAll(t.page, "test")).toEqual([]);
    expect(t.calls).toHaveLength(1);
  });

  /*
    The case this file was written for, inverted.

    It used to assert that a failed page returns the rows collected so far — one page of a
    three-page ledger, handed back as if it were the ledger. Every caller then sums it and
    prints the sum. The screen cannot tell a third of the money from all of it, so the only
    correct behaviour is to refuse, and the label has to be a thing the person recognises
    because it is what the error screen says out loud.
  */
  it("refuses to answer with part of the ledger when a page fails", async () => {
    // One walk, one counter: the second page is the one that breaks, and the assertion is
    // that nothing at all comes back — not the thousand rows page one had already read.
    const t = table(PAGE * 3);
    let seen = 0;
    const flaky = async (from: number, to: number) =>
      seen++ === 1 ? { data: null, error: { message: "boom" } } : t.page(from, to);

    const thrown = await readAll(flaky, "what is on your accounts").then(
      (rows) => ({ rows }),
      (err: unknown) => ({ err }),
    );
    expect(thrown).not.toHaveProperty("rows");
    expect((thrown as { err: unknown }).err).toBeInstanceOf(ReadFailed);
    expect((thrown as { err: ReadFailed }).err).toMatchObject({
      label: "what is on your accounts",
      reason: "boom",
    });
  });

  it("refuses to walk forever", async () => {
    const endless = async () => ({
      data: Array.from({ length: PAGE }, (_, i) => ({ id: i })),
      error: null,
    });
    await expect(readAll(endless, "test")).rejects.toThrow(ReadFailed);
  });
});
