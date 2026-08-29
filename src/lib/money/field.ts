/**
 * Turning what somebody typed into a figure, and back again.
 *
 * Pulled out of `MoneyField` so it can be tested without a browser: this is four pure
 * string functions and one genuinely hard decision, and the hard decision was wrong for
 * months without anything failing loudly enough to notice.
 */

/*
  Money is stored as numeric(14, 2) — twelve digits before the decimal point, a shade
  under a thousand billion. Past that Postgres refuses the row, so a field that accepts
  a thirteenth digit is a field that accepts a value it cannot save: the person types,
  the form looks fine, and the save fails on something they cannot see. Stopping the
  keystroke says the same thing at the only moment it is useful.
*/
const MAX_WHOLE = 12;

/**
 * Digits, and at most one decimal mark.
 *
 * The whole difficulty is that a full stop means two different things here. Serbian
 * groups thousands with it — 123.105 is a hundred and twenty-three thousand — and the
 * field itself writes those dots back into the input on every keystroke, so they arrive
 * here again and have to be thrown away. But a full stop is also what every numeric
 * keypad gives you for a decimal point, and it is what anybody types who has ever used
 * a calculator.
 *
 * This used to resolve it by deleting every dot. That is right for the grouping and
 * catastrophic for the decimal: typing 123105.92 submitted 12.310.592 — a hundred times
 * the figure, entered in silence, on a screen whose entire job is to be trusted with
 * amounts.
 *
 * The two are told apart by how many digits follow the last mark, which works because
 * money has at most two decimals and grouping never has fewer than three:
 *
 *   123105.92    two digits after    decimal     → 123105,92
 *   1.5          one digit after     decimal     → 1,5
 *   123105.      nothing after yet   decimal     → 123105,     (mid-typing)
 *   123.105      three digits after  grouping    → 123105
 *   1.2310       four digits after   grouping    → 12310
 *
 * That last line is not a curiosity, it is the case that has to work: the field writes
 * its own grouping back into the input, so pressing a key on "1.231" hands this
 * function "1.2310" on the very next keystroke. Reading only the digits immediately
 * after the mark — three or more means grouping — is what lets its own output survive
 * a round trip.
 *
 * A comma is never ambiguous — it is only ever the decimal — so when one is present it
 * wins outright and every dot goes back to being grouping.
 *
 * What this cannot do is read grouping dots somebody types by hand: press the point key
 * on "100" and there is nothing after it yet, so it becomes a decimal and "100.000"
 * ends up as 100,00. That is a fair trade, because the field groups for you — type
 * 100000 and it prints 100.000 on its own — and because the result is on screen while
 * you type rather than hidden until it is saved.
 */
export function cleanMoney(input: string): string {
  const only = input.replace(/[^\d.,]/g, "");

  const lastComma = only.lastIndexOf(",");
  const lastDot = only.lastIndexOf(".");

  let cut = -1;
  if (lastComma >= 0) {
    cut = lastComma;
  } else if (lastDot >= 0 && only.length - lastDot - 1 <= 2) {
    cut = lastDot;
  }

  const whole = (cut >= 0 ? only.slice(0, cut) : only).replace(/\D/g, "").slice(0, MAX_WHOLE);
  if (cut < 0) return whole;

  const decimals = only.slice(cut + 1).replace(/\D/g, "").slice(0, 2);
  return `${whole},${decimals}`;
}

/** "1234567,5" → "1.234.567,5". The grouping is Serbian, and so is the comma. */
export function groupMoney(value: string): string {
  if (!value) return "";
  const [whole, decimal] = value.split(",");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimal !== undefined ? `${grouped},${decimal}` : grouped;
}

/** What the form submits: a number the server parses without knowing any of this. */
export function plainMoney(value: string): string {
  return value.replace(",", ".");
}

/** A stored amount ("1234.5") shown the way it is typed here ("1234,5"). */
export function typedMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return cleanMoney(String(value).replace(".", ","));
}
