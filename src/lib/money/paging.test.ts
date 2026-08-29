import { describe, expect, it, vi } from "vitest";
import { MAX_PAGES, PAGE, readAll } from "./paging";

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

  it("gives back what it has when a page fails, and says so", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = table(PAGE * 3);
    let seen = 0;
    const flaky = async (from: number, to: number) =>
      seen++ === 1 ? { data: null, error: { message: "boom" } } : t.page(from, to);
    expect(await readAll(flaky, "getAccountBalances")).toHaveLength(PAGE);
    expect(err).toHaveBeenCalledWith("getAccountBalances:", "boom");
    err.mockRestore();
  });

  it("refuses to walk forever", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const endless = async () => ({
      data: Array.from({ length: PAGE }, (_, i) => ({ id: i })),
      error: null,
    });
    const got = await readAll(endless, "test");
    expect(got).toHaveLength(PAGE * MAX_PAGES);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
