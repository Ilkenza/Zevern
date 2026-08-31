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

/*
  Dots are grouping, a comma is the decimal, and nothing is guessed.

  `cleanMoney` has to guess because all it gets is a string. This one is used where the
  guess is unnecessary — where we already know from the edit itself that no decimal mark
  was typed — and there the field's own dots can simply be thrown away.
*/
function strictMoney(input: string): string {
  const only = input.replace(/[^\d,]/g, "");
  const cut = only.indexOf(",");
  const whole = (cut >= 0 ? only.slice(0, cut) : only).replace(/\D/g, "").slice(0, MAX_WHOLE);
  if (cut < 0) return whole;
  return `${whole},${only.slice(cut + 1).replace(/\D/g, "").slice(0, 2)}`;
}

type Edit = { kind: "insert" | "remove"; index: number; char: string };

/**
 * The single character that turned one string into the other, or nothing if more than one
 * did — a paste, a replaced selection, a value filled in by the browser.
 */
function oneEdit(shown: string, next: string): Edit | null {
  if (next.length === shown.length + 1) {
    let i = 0;
    while (i < shown.length && shown[i] === next[i]) i += 1;
    return next.slice(0, i) + next.slice(i + 1) === shown
      ? { kind: "insert", index: i, char: next[i] }
      : null;
  }

  if (next.length === shown.length - 1) {
    let i = 0;
    while (i < next.length && shown[i] === next[i]) i += 1;
    return shown.slice(0, i) + shown.slice(i + 1) === next
      ? { kind: "remove", index: i, char: shown[i] }
      : null;
  }

  return null;
}

/**
 * One keystroke, read against what was on the screen before it.
 *
 * This exists because a dot cannot be read from the finished string. Type 150000 and the
 * field prints 150.000; press Backspace and the input hands back "150.00", where the dot
 * now has two digits after it and every rule for reading a string on its own says
 * decimal. A hundred and fifty thousand became a hundred and fifty, in one keystroke,
 * with nothing on screen admitting it.
 *
 * The keystroke settles it. A dot that is still there after a *deletion* was never typed
 * by anybody — the field wrote it — so it is grouping, whatever it looks like now. A dot
 * that arrives as an *insertion* is the decimal key being pressed, and where it landed
 * among the digits is what it means. Nothing has to be inferred from the shape of the
 * number, which is the part that could never be made right.
 *
 * `shown` is the grouped string the input was displaying; `next` is what it holds now.
 */
export function editMoney(shown: string, next: string): string {
  if (next === shown) return strictMoney(next);

  const edit = oneEdit(shown, next);
  // No single keystroke to read — a paste, or a selection typed over. Back to guessing.
  if (!edit) return cleanMoney(next);

  if (edit.kind === "insert") {
    if (edit.char !== "." && edit.char !== ",") {
      // A digit, or a character that is not part of a figure and drops out either way.
      return strictMoney(next);
    }
    // The decimal key. One mark is all a figure gets, so a second press changes nothing.
    if (shown.includes(",")) return strictMoney(shown);
    const digits = shown.replace(/\D/g, "");
    const before = shown.slice(0, edit.index).replace(/\D/g, "").length;
    const whole = digits.slice(0, before).slice(0, MAX_WHOLE);
    return `${whole},${digits.slice(before).slice(0, 2)}`;
  }

  /*
    A deletion. Backspacing a grouping dot is aimed at the digit in front of it — the dot
    is not a character anyone put there — so that digit goes instead, which is also the
    only reading under which the figure changes by one digit rather than by a thousand.
  */
  if (edit.char === ".") {
    return strictMoney(next.slice(0, edit.index - 1) + next.slice(edit.index));
  }

  return strictMoney(next);
}
