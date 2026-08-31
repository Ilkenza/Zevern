import { describe, expect, it } from "vitest";
import { GOAL_MOVE_KINDS, goalKinds, movesToward, walkGoal } from "./goal-progress";

describe("which entries belong to a goal", () => {
  it("feeds a saving goal from money set aside, and from income kept rather than spent", () => {
    expect(goalKinds(false)).toEqual(["saving", "withdraw", "income"]);
    expect(movesToward("saving", false)).toBe(true);
    expect(movesToward("income", false)).toBe(true);
    expect(movesToward("withdraw", false)).toBe(false);
  });

  it("feeds a paying-off goal from what it cost, and reads income as that coming back", () => {
    expect(goalKinds(true)).toEqual(["expense", "income"]);
    expect(movesToward("expense", true)).toBe(true);
    expect(movesToward("income", true)).toBe(false);
  });

  /*
    The one that has to hold. `income` is in both lists and it means opposite things in
    them — the same row read against the wrong direction moves a goal the wrong way by
    twice its own size.
  */
  it("reads income opposite ways depending on which way the goal runs", () => {
    expect(movesToward("income", false)).toBe(true);
    expect(movesToward("income", true)).toBe(false);
  });

  it("fetches every kind either list can name", () => {
    for (const paying of [true, false]) {
      for (const kind of goalKinds(paying)) {
        expect(GOAL_MOVE_KINDS).toContain(kind);
      }
    }
  });

  it("ignores a kind that belongs to the other direction", () => {
    // An expense filed against a saving goal is not one of its movements, whatever the
    // column says — this is what stops a mis-filed row from moving a figure.
    const kept = [
      { kind: "saving", amount: 100 },
      { kind: "expense", amount: 500 },
    ].filter((m) => goalKinds(false).includes(m.kind));
    expect(kept).toEqual([{ kind: "saving", amount: 100 }]);
  });
});

describe("where a goal stands", () => {
  it("adds what went in and takes off what came back", () => {
    expect(
      walkGoal([{ kind: "saving", amount: 300 }, { kind: "withdraw", amount: 100 }], false),
    ).toEqual({ progress: 200, peak: 300, deposited: 300, withdrawn: 100 });
  });

  it("counts income into a saving goal as money put aside", () => {
    expect(walkGoal([{ kind: "income", amount: 5000 }], false)).toEqual({
      progress: 5000,
      peak: 5000,
      deposited: 5000,
      withdrawn: 0,
    });
  });

  it("counts income against a paying-off goal as the payment coming back", () => {
    expect(
      walkGoal([{ kind: "expense", amount: 800 }, { kind: "income", amount: 300 }], true),
    ).toEqual({ progress: 500, peak: 800, deposited: 800, withdrawn: 300 });
  });

  it("peaks at the most it ever held, not at everything that ever went in", () => {
    const filledTwice = [
      { kind: "saving", amount: 100 },
      { kind: "withdraw", amount: 100 },
      { kind: "saving", amount: 100 },
    ];
    expect(walkGoal(filledTwice, false)).toMatchObject({
      progress: 100,
      peak: 100,
      deposited: 200,
    });
  });

  it("has nothing to say about a goal nothing has happened to", () => {
    expect(walkGoal([], false)).toEqual({ progress: 0, peak: 0, deposited: 0, withdrawn: 0 });
  });

  it("does not let a peak go negative on a goal taken below zero", () => {
    expect(walkGoal([{ kind: "withdraw", amount: 50 }], false)).toMatchObject({
      progress: -50,
      peak: 0,
    });
  });
});
