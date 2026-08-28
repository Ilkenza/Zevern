/**
 * The one hue a category is ever drawn in.
 *
 * Categories used to carry a colour each, chosen from a sixteen-swatch palette. Two
 * things were wrong with that and both were visible on screen. The ten defaults spent
 * only eight colours — Transport and Learning were the same blue, Subscriptions and Fun
 * the same purple — so past about six categories the colour had stopped being an
 * identifier and become a coincidence. And four of those defaults were the app's own
 * state colours: Bills & utilities was `--color-danger`, Groceries and Salary were
 * `--color-ok`, Shopping and Freelance were `--color-gold`. A category permanently
 * painted in the colour that elsewhere means "you have overspent" is a screen that
 * cannot say the thing it most needs to say.
 *
 * So colour stops being identity. Wherever the name is written beside it — every row,
 * every chip, every ledger line — the colour was decoration, and it goes. Where the
 * name cannot be written, which is the stacked band and its legend, one hue varies by
 * rank instead: the same gold, weaker toward the smaller slices.
 *
 * What this buys, beyond looking calmer: red now means exactly one thing on a money
 * screen, and green exactly one. Those are also the two hues hardest to tell apart for
 * the roughly eight percent of men with a red-green deficiency — and nothing here
 * depends on separating them any more.
 */

/**
 * Gold at five strengths, biggest first.
 *
 * Alpha rather than five mixed hex values, so the ramp keeps working if the surface
 * behind it ever changes — and so the steps stay visibly the same colour, which is the
 * whole point of a monochrome ramp.
 */
const RAMP = [
  "#e6b457",
  "rgba(217, 164, 65, 0.78)",
  "rgba(217, 164, 65, 0.56)",
  "rgba(217, 164, 65, 0.40)",
  "rgba(217, 164, 65, 0.28)",
];

/** Everything past the ramp, and the "Other" bucket: not a quantity worth a hue. */
export const CAT_REST = "var(--color-faint)";

/** The flat tone, for a bar in a list whose rows are already named. */
export const CAT_TONE = "var(--color-gold)";

/**
 * The tone for the nth-largest slice.
 *
 * Rank, not identity — the same category is a different strength in a month where it
 * was not the biggest. That is correct here: the band is a picture of one month's
 * proportions, and the legend beside it is read against that month, not across months.
 */
export function catTone(rank: number): string {
  return RAMP[rank] ?? CAT_REST;
}
