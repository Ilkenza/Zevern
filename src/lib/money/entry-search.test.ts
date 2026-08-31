import { describe, expect, it } from "vitest";
import {
  fold,
  matches,
  siftEntries,
  totalsByMonth,
  type SearchableEntry,
} from "./entry-search";

const entry = (over: Partial<SearchableEntry> & { id: string }): SearchableEntry => ({
  occurred_on: "2026-08-28",
  amount_rsd: 1000,
  ...over,
});

const dinner = entry({
  id: "a",
  occurred_on: "2026-08-28",
  occurred_at: "21:10",
  amount_rsd: 11737,
  title: "Večera, Koštana",
  account: { name: "Bank (RSD)" },
  category: { name: "Eating out" },
});
const coffee = entry({
  id: "b",
  occurred_on: "2026-08-28",
  occurred_at: "16:40",
  amount_rsd: 3000,
  title: "Kafa i kolač",
  account: { name: "Cash" },
});
const pizza = entry({
  id: "c",
  occurred_on: "2026-07-19",
  amount_rsd: 5400,
  title: "Pica",
  account: { name: "Bank (RSD)" },
});
const unpriced = entry({
  id: "d",
  occurred_on: "2026-08-20",
  amount_rsd: null,
  title: "Nešto sa pijace",
  account: { name: "Cash" },
});

const all = [dinner, coffee, pizza, unpriced];

describe("folding what people actually type", () => {
  /*
    A Serbian ledger is full of č, ć, š, ž and đ, and nobody types them into a search box.
    A search that only matches the exact spelling fails on precisely the entries this app
    is full of.
  */
  it("strips the marks off our letters", () => {
    expect(fold("Večera, Koštana")).toBe("vecera, kostana");
    expect(fold("kolač")).toBe("kolac");
    expect(fold("ćuška")).toBe("cuska");
  });

  it("handles đ, which is a letter and not a d with a mark on it", () => {
    // NFD leaves đ alone, so stripping combining marks never reaches it.
    expect(fold("Đurđevak")).toBe("Durdevak".toLowerCase());
  });
});

describe("what a search matches", () => {
  it("finds an entry typed without diacritics", () => {
    expect(matches(dinner, "kostana")).toBe(true);
    expect(matches(dinner, "vecera")).toBe(true);
  });

  it("needs every word, in any order and any field", () => {
    expect(matches(dinner, "kostana bank")).toBe(true);
    expect(matches(dinner, "bank kostana")).toBe(true);
    expect(matches(dinner, "kostana cash")).toBe(false);
  });

  it("searches the amount, both as typed and as printed", () => {
    expect(matches(dinner, "11737")).toBe(true);
    expect(matches(dinner, "11.737")).toBe(true);
  });

  it("searches the date", () => {
    expect(matches(pizza, "2026-07")).toBe(true);
  });

  it("matches everything when the box is empty", () => {
    expect(matches(dinner, "")).toBe(true);
    expect(matches(dinner, "   ")).toBe(true);
  });

  it("does not fall over on an entry with no price and no note", () => {
    expect(matches(entry({ id: "x", amount_rsd: null }), "kafa")).toBe(false);
  });
});

describe("filtering", () => {
  it("keeps only the account asked for", () => {
    const kept = siftEntries(all, { accountName: "Cash" }, "date");
    expect(kept.map((e) => e.id)).toEqual(["b", "d"]);
  });

  it("keeps only what still needs a price", () => {
    const kept = siftEntries(all, { unpricedOnly: true }, "date");
    expect(kept.map((e) => e.id)).toEqual(["d"]);
  });

  it("stacks a search on top of a filter", () => {
    expect(siftEntries(all, { accountName: "Cash", query: "kafa" }, "date").map((e) => e.id))
      .toEqual(["b"]);
    expect(siftEntries(all, { accountName: "Bank (RSD)", query: "kafa" }, "date")).toEqual([]);
  });
});

describe("ordering", () => {
  it("puts the newest first by default, and the time of day decides a shared day", () => {
    expect(siftEntries(all, {}, "date").map((e) => e.id)).toEqual(["a", "b", "d", "c"]);
  });

  it("reverses cleanly for oldest first", () => {
    expect(siftEntries(all, {}, "date", "desc").map((e) => e.id)).toEqual(["c", "d", "b", "a"]);
  });

  it("sorts by size, with an unpriced entry counting as nothing", () => {
    expect(siftEntries(all, {}, "size").map((e) => e.id)).toEqual(["a", "c", "b", "d"]);
    expect(siftEntries(all, {}, "size", "desc").map((e) => e.id)).toEqual(["d", "b", "c", "a"]);
  });

  it("breaks a tie on date so equal amounts do not swap between renders", () => {
    const one = entry({ id: "1", occurred_on: "2026-08-01", amount_rsd: 3000 });
    const two = entry({ id: "2", occurred_on: "2026-08-09", amount_rsd: 3000 });
    expect(siftEntries([one, two], {}, "size").map((e) => e.id)).toEqual(["2", "1"]);
    expect(siftEntries([two, one], {}, "size").map((e) => e.id)).toEqual(["2", "1"]);
  });

  it("leaves the list it was given alone", () => {
    const original = [...all];
    siftEntries(all, {}, "size");
    expect(all).toEqual(original);
  });
});

describe("adding up what survived", () => {
  it("totals by month", () => {
    const totals = totalsByMonth(all);
    expect(totals.get("2026-08")).toBe(14737);
    expect(totals.get("2026-07")).toBe(5400);
  });

  it("counts an unpriced entry as nothing rather than breaking the total", () => {
    expect(totalsByMonth([unpriced]).get("2026-08")).toBe(0);
  });
});

describe("a date range", () => {
  it("keeps both ends, because a person who says to the 19th means the 19th", () => {
    const kept = siftEntries(all, { from: "2026-07-19", to: "2026-08-20" }, "date", "desc");
    expect(kept.map((e) => e.id)).toEqual(["c", "d"]);
  });

  it("takes an open end at either side", () => {
    expect(siftEntries(all, { from: "2026-08-01" }, "date", "desc").map((e) => e.id)).toEqual([
      "d",
      "b",
      "a",
    ]);
    expect(siftEntries(all, { to: "2026-07-31" }, "date", "desc").map((e) => e.id)).toEqual(["c"]);
  });

  it("returns nothing for a range that is the wrong way round, rather than everything", () => {
    expect(siftEntries(all, { from: "2026-08-20", to: "2026-08-01" }, "date")).toEqual([]);
  });

  it("stacks with a search and a chip", () => {
    expect(
      siftEntries(all, { from: "2026-08-01", accountName: "Cash", query: "kafa" }, "date").map(
        (e) => e.id,
      ),
    ).toEqual(["b"]);
  });
});
