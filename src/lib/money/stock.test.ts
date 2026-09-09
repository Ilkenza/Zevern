import { describe, expect, it } from "vitest";
import { byUrgency, expiryFor, leftOf, standingOf, takeOf } from "./stock";

/*
  His case, end to end: ten bananas, bought, one eaten, the rest forgotten.

  The bug this file is here to stop is not arithmetic — it is a list that fails to put the
  thing about to go off at the top, which is the only way this feature can be useless
  while appearing to work.
*/

describe("leftOf", () => {
  it("takes what has gone off what was bought", () => {
    expect(leftOf(10, [{ kind: "eaten", qty: 1 }])).toBe(9);
    expect(leftOf(10, [{ kind: "eaten", qty: 1 }, { kind: "binned", qty: 3 }])).toBe(6);
  });

  it("counts eaten and binned the same, because both are gone", () => {
    expect(leftOf(10, [{ kind: "binned", qty: 10 }])).toBe(0);
    expect(leftOf(10, [{ kind: "eaten", qty: 10 }])).toBe(0);
  });

  it("ignores anything that is not one of the two", () => {
    // A row written by hand, or by a version of this app that had a third kind.
    expect(leftOf(10, [{ kind: "lost", qty: 4 }])).toBe(10);
  });

  it("never reports less than nothing", () => {
    expect(leftOf(10, [{ kind: "eaten", qty: 12 }])).toBe(0);
  });

  it("gives a clean figure when the pieces are fractions", () => {
    /*
      A tenth and a fifth of a loaf is three tenths of a loaf, and seven tenths are left.
      Float arithmetic says 0.7000000000000001, which then prints as `0,7' and compares as
      not-0.7 — the kind of difference that is invisible until something asks whether the
      lot is finished.
    */
    expect(leftOf(1, [{ kind: "eaten", qty: 0.7 }])).toBe(0.3);
    expect(leftOf(5, [{ kind: "eaten", qty: 1.1 }, { kind: "binned", qty: 2.2 }])).toBe(1.7);
  });

  it("lands on nought when a lot is finished in fractions", () => {
    // The column carries three decimals, and floats do not reach nought unaided.
    const moves = [
      { kind: "eaten", qty: 0.3 },
      { kind: "eaten", qty: 0.3 },
      { kind: "eaten", qty: 0.4 },
    ];
    expect(leftOf(1, moves)).toBe(0);
  });

  it("is the whole lot when nothing has happened to it", () => {
    expect(leftOf(10, [])).toBe(10);
  });
});

describe("expiryFor", () => {
  it("counts the days on from the day it was bought", () => {
    expect(expiryFor("2026-09-06", 5)).toBe("2026-09-11");
    expect(expiryFor("2026-09-06", 1)).toBe("2026-09-07");
  });

  it("crosses a month and a year without help", () => {
    expect(expiryFor("2026-09-28", 5)).toBe("2026-10-03");
    expect(expiryFor("2026-12-30", 5)).toBe("2027-01-04");
    // A leap year, since February is where date arithmetic goes wrong.
    expect(expiryFor("2028-02-26", 4)).toBe("2028-03-01");
  });

  it("has no date for a thing that does not go off", () => {
    // A tin of fish keeps two years and nobody wants to be asked about it.
    expect(expiryFor("2026-09-06", null)).toBeNull();
    expect(expiryFor("2026-09-06", undefined)).toBeNull();
    expect(expiryFor("2026-09-06", 0)).toBeNull();
    expect(expiryFor("2026-09-06", -3)).toBeNull();
  });
});

describe("standingOf", () => {
  const today = "2026-09-06";

  it("knows what is already past", () => {
    expect(standingOf("2026-09-05", today)).toBe("gone");
    expect(standingOf("2026-08-01", today)).toBe("gone");
  });

  it("calls today today, not soon", () => {
    expect(standingOf(today, today)).toBe("today");
  });

  it("calls the next three days soon, and the fourth not", () => {
    expect(standingOf("2026-09-07", today)).toBe("soon");
    expect(standingOf("2026-09-09", today)).toBe("soon");
    expect(standingOf("2026-09-10", today)).toBe("later");
  });

  it("says nothing at all about a thing with no date", () => {
    // Never "fine": that would claim somebody checked.
    expect(standingOf(null, today)).toBe("none");
    expect(standingOf(undefined, today)).toBe("none");
  });
});

describe("byUrgency", () => {
  const today = "2026-09-06";
  const lot = (name: string, expiresOn: string | null, boughtOn = "2026-09-01") => ({
    name,
    expiresOn,
    boughtOn,
  });

  it("puts what is about to go at the top and what keeps at the bottom", () => {
    const list = [
      lot("Tinned fish", null),
      lot("Milk", "2026-09-20"),
      lot("Bananas", "2026-09-07"),
      lot("Yoghurt", "2026-09-04"),
      lot("Bread", "2026-09-06"),
    ];
    expect(byUrgency(list, today).map((l) => l.name)).toEqual([
      "Yoghurt", // past its date
      "Bread", // today
      "Bananas", // soon
      "Milk", // keeps
      "Tinned fish", // no date
    ]);
  });

  it("orders two of the same standing by their date", () => {
    const list = [lot("B", "2026-09-09"), lot("A", "2026-09-07")];
    expect(byUrgency(list, today).map((l) => l.name)).toEqual(["A", "B"]);
  });

  it("falls back to what was bought first, then to the name", () => {
    const list = [
      lot("Rice", null, "2026-09-05"),
      lot("Flour", null, "2026-08-20"),
      lot("Salt", null, "2026-08-20"),
    ];
    expect(byUrgency(list, today).map((l) => l.name)).toEqual(["Flour", "Salt", "Rice"]);
  });

  it("leaves the list it was given alone", () => {
    const list = [lot("B", "2026-09-20"), lot("A", "2026-09-07")];
    const before = list.map((l) => l.name);
    byUrgency(list, today);
    expect(list.map((l) => l.name)).toEqual(before);
  });
});

describe("takeOf", () => {
  it("takes what was asked while there is enough", () => {
    expect(takeOf(1, 10)).toEqual({ take: 1 });
    expect(takeOf(10, 10)).toEqual({ take: 10 });
  });

  it("takes only what is there when more was asked", () => {
    // Typed by somebody looking at the bowl, not at the app: "three" when two are left
    // means the two.
    expect(takeOf(3, 2)).toEqual({ take: 2 });
    expect(takeOf(999, 0.5)).toEqual({ take: 0.5 });
  });

  it("refuses a lot with nothing left", () => {
    expect(takeOf(1, 0)).toEqual({ take: null, refusal: "empty" });
    expect(takeOf(1, -1)).toEqual({ take: null, refusal: "empty" });
  });

  it("refuses a count that is not a count", () => {
    expect(takeOf(0, 10)).toEqual({ take: null, refusal: "none" });
    expect(takeOf(-2, 10)).toEqual({ take: null, refusal: "none" });
    expect(takeOf(Number.NaN, 10)).toEqual({ take: null, refusal: "none" });
  });

  it("never takes more than is there, at any size", () => {
    for (const left of [0.001, 1, 10, 1000]) {
      for (const asked of [0.5, 1, 7, 99999]) {
        const t = takeOf(asked, left);
        expect(t.take == null || t.take <= left, `${asked} of ${left}`).toBe(true);
      }
    }
  });

  it("walks a lot of ten down to nothing and then stops", () => {
    let left = 10;
    const moves: { kind: string; qty: number }[] = [];
    for (const [asked, kind] of [[1, "eaten"], [3, "binned"], [4, "eaten"], [5, "eaten"]] as const) {
      const t = takeOf(asked, left);
      expect(t.take).not.toBeNull();
      moves.push({ kind, qty: t.take as number });
      left = leftOf(10, moves);
    }
    // 1 + 3 + 4 = 8, and the last one asked for five with two left.
    expect(moves.map((m) => m.qty)).toEqual([1, 3, 4, 2]);
    expect(left).toBe(0);
    expect(takeOf(1, left)).toEqual({ take: null, refusal: "empty" });
  });
});
