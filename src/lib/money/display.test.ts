import { describe, expect, it } from "vitest";
import { formatDisplayShort, type Display } from "./display";

/*
  The compact form is the one that goes over a bar, and a bar chart is read by comparing
  labels rather than heights alone. `2827k` beside `1939k` beside `464k` is three numbers
  in two units that have to be divided before they can be compared — which is the work the
  chart exists to save.
*/
// A hundred dinars to the dollar, a hundred and seventeen to the euro — round numbers so
// the arithmetic in each case below can be read off the figure.
const usd: Display = { currency: "USD", rates: { USD: 100, EUR: 117 } };
const eur: Display = { currency: "EUR", rates: { USD: 100, EUR: 117 } };
const rsd: Display = { currency: "RSD", rates: { USD: 100, EUR: 117 } };

describe("formatDisplayShort", () => {
  it("gives millions their own step rather than counting them in thousands", () => {
    expect(formatDisplayShort(282_700_000, usd)).toBe("$2.8M");
    expect(formatDisplayShort(193_900_000, usd)).toBe("$1.9M");
    expect(formatDisplayShort(48_500_000, usd)).toBe("$485k");
    expect(formatDisplayShort(46_400_000, usd)).toBe("$464k");
  });

  it("steps up again at a billion", () => {
    expect(formatDisplayShort(400_000_000_000, usd)).toBe("$4B");
  });

  it("drops a decimal that carries nothing", () => {
    // `1.0M` is a decimal point with no information under it.
    expect(formatDisplayShort(100_000_000, usd)).toBe("$1M");
    expect(formatDisplayShort(100_000, usd)).toBe("$1k");
  });

  it("keeps one decimal while it still says something", () => {
    expect(formatDisplayShort(123_000, usd)).toBe("$1.2k");
    // Past a hundred of any unit the decimal is noise on a chart label.
    expect(formatDisplayShort(12_345_600, usd)).toBe("$123k");
  });

  it("prints under a thousand whole, with the symbol", () => {
    expect(formatDisplayShort(34_000, usd)).toBe("$340");
    expect(formatDisplayShort(0, usd)).toBe("$0");
  });

  it("carries the sign through the shortening", () => {
    expect(formatDisplayShort(-282_700_000, usd)).toBe("-$2.8M");
  });

  it("uses each currency's own mark", () => {
    expect(formatDisplayShort(117_000_000, eur)).toBe("€1M");
    // Dinars have no symbol and a four-character mark, so this form leaves it off — and
    // keeps the decimal comma the notation is written with.
    expect(formatDisplayShort(1_234_000, rsd)).toBe("1,2M");
    expect(formatDisplayShort(340, rsd)).toBe("340");
  });
});
