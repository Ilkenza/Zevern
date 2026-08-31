/**
 * What a name already known is allowed to fill in.
 *
 * Two ways in, and they carry different weight. Choosing a row off the list is a
 * decision about this entry, so it fills the fields whatever was in them. Typing a name
 * that happens to match one is only a name — what comes with it is a suggestion, and a
 * suggestion does not overwrite an answer somebody already gave.
 *
 * That second rule is the whole of the trust here: a form that quietly changes a
 * category you chose, because of a word typed after it, is a form you have to re-read
 * every time — which costs more than the typing it saved. Pulled out of the component so
 * "never overwrite what is answered" is a thing that can be proved rather than a thing
 * that is meant.
 */

export type KnownThing = {
  price: number | string | null;
  currency: string;
  category_id: string | null;
};

/** What the form holds right now. Empty string means the field is unanswered. */
export type Answered = { categoryId: string; amount: string };

/** Only the fields to change. An absent key is a field to leave exactly as it is. */
export type Fill = { categoryId?: string; amount?: string; currency?: string };

function priced(item: KnownThing): boolean {
  return item.price !== null && Number(item.price) > 0;
}

/** Picking a row off the list: this is the thing, so this is its price and its shelf. */
export function fillFromPick(item: KnownThing): Fill {
  const fill: Fill = {};
  if (priced(item)) {
    fill.amount = String(item.price);
    fill.currency = item.currency;
  }
  if (item.category_id) fill.categoryId = item.category_id;
  return fill;
}

/** Typing a name that is already known: fill the blanks, touch nothing else. */
export function fillFromTyping(item: KnownThing, now: Answered): Fill {
  const fill: Fill = {};
  if (item.category_id && now.categoryId === "") fill.categoryId = item.category_id;
  if (priced(item) && now.amount.trim() === "") {
    fill.amount = String(item.price);
    fill.currency = item.currency;
  }
  return fill;
}
