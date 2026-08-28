import { describe, expect, it } from "vitest";
import { greetingFor } from "./format";

/**
 * The greeting is a pure function of an hour so that one clock decides it — the
 * server's. These pin the two boundaries the old `new Date()` version crossed twice a
 * day, which is what made it a hydration mismatch rather than a cosmetic detail.
 */
describe("greetingFor", () => {
  it("greets the morning up to noon", () => {
    expect(greetingFor(0)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
  });

  it("turns over at noon, not after it", () => {
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good afternoon");
  });

  it("turns over at six", () => {
    expect(greetingFor(18)).toBe("Good evening");
    expect(greetingFor(23)).toBe("Good evening");
  });
});
