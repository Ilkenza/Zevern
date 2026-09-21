"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  deleteItem,
  saveItem,
  setItemField,
  type MoneyState,
} from "@/app/(app)/private/actions";
import { Button } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";
import { cn } from "@/lib/utils";
import { CURRENCY_OPTIONS } from "@/lib/money";
import type { MoneyCategory, MoneyItem } from "@/lib/types";
import {
  AddCaption,
  RowDelete,
  RowError,
  RowMark,
  SwapLabel,
  field,
  rowMotion,
  useComposer,
} from "./kit";

/**
 * One thing you buy: what it is called, what it cost last time, and whether it is the kind
 * of thing that ends up in the fridge.
 *
 * The price is a suggestion and the row says so by leaving it optional — half of what
 * anybody buys has no fixed price, and a field that insists on one turns "remember this
 * name" into "guess a number". The category is here for the same reason: picking the thing
 * on an entry form should fill in where it gets filed, because that is the rest of the
 * same keystroke.
 *
 * ## Why a saved row has no form in it
 *
 * It had one, and the form is what broke it. React resets a `<form action={...}>` once its
 * action succeeds, and a reset does not put a `<select>` back to the value it is showing —
 * it puts it back to the option carrying the `selected` attribute, and a React-rendered
 * `<option>` carries none. So the reset landed on the *first* option, which here reads
 * `Not food or drink`. React saw no state change, so it did not re-render, so nothing
 * corrected the box: the database had `Food`, the row had `Food` in its head, and the
 * screen said otherwise until the page was reloaded. Measured rather than guessed — the
 * box read `food` at 300ms and `other` at 1,200, the moment the action came back, with the
 * server payload for that same row already saying `food`.
 *
 * Working around that meant controlling every field, keeping every value in two places,
 * and hoping the two agreed. So the form is gone instead. Each field saves itself through
 * `setItemField` — one row, one column, one call — a dropdown the moment it is answered
 * and a typed field when you leave it. There is nothing left to reset, no Save button to
 * hunt for, and no second copy of any answer.
 *
 * The composer below keeps its form: there is no row to patch until it exists.
 */
export function ItemRow({
  item,
  categories,
  arrived,
}: {
  item?: MoneyItem;
  categories: MoneyCategory[];
  arrived?: boolean;
}) {
  return item ? (
    <SavedItem item={item} categories={categories} arrived={arrived} />
  ) : (
    <NewItem categories={categories} />
  );
}

function SavedItem({
  item,
  categories,
  arrived,
}: {
  item: MoneyItem;
  categories: MoneyCategory[];
  arrived?: boolean;
}) {
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  /*
    What is on screen, which is the row until somebody changes something.
  */
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price == null ? "" : String(item.price));
  /*
    What the typed fields hold right now, for the handler that saves them.

    A blur handler closes over the state of the render that made it, and a re-render can
    be a beat behind — a transition already in flight defers it. Typing `30` into the rok
    and tabbing away then saved the empty string it had a moment ago: the box read 30, the
    column stayed null, and nothing said so. A ref is read at the moment of the blur, not
    at the moment the handler was written.
  */
  const latest = useRef({ name: item.name, price: item.price == null ? "" : String(item.price), days: item.keeps_days == null ? "" : String(item.keeps_days) });
  const [currency, setCurrency] = useState(item.currency ?? "RSD");
  const [category, setCategory] = useState(item.category_id ?? "");
  const [kind, setKind] = useState(item.kind ?? "other");
  const [days, setDays] = useState(item.keeps_days == null ? "" : String(item.keeps_days));
  const perishable = kind !== "other";

  const put = (
    column: "name" | "price" | "kind" | "keeps_days" | "currency" | "category_id",
    value: string,
  ) => {
    setError(null);
    startSaving(async () => {
      const result = await setItemField(item.id, column, value);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div
      className={cn(
        "setup-row-premium setup-item is-quiet",
        rowMotion,
        arrived && "zv-row-in",
        leaving && "translate-x-1 opacity-0",
      )}
    >
      <div className="setup-item-in">
        <RowMark used={(item.uses ?? 0) > 0} />

        {/* Typed fields save when you leave them — typing is not an answer until it stops. */}
        <input
          value={name}
          onChange={(e) => {
            latest.current.name = e.target.value;
            setName(e.target.value);
          }}
          onBlur={() => {
            const next = latest.current.name;
            if (next.trim() && next.trim() !== item.name) put("name", next);
          }}
          placeholder="Orange juice"
          aria-label="What it is called"
          className={cn(field, "w-full min-w-0 font-medium setup-cat-name setup-item-name")}
        />

        <MoneyField
          name="price"
          value={price}
          onValueChange={(plain) => {
            latest.current.price = plain;
            setPrice(plain);
          }}
          onBlur={() => {
            const next = latest.current.price;
            if (next !== (item.price == null ? "" : String(item.price))) put("price", next);
          }}
          placeholder="Price"
          aria-label="What it cost last time"
          className="mb-0 setup-item-price"
          inputClassName={cn(field, "w-full min-w-0 text-right")}
        />

        <select
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            put("currency", e.target.value);
          }}
          aria-label="Currency"
          className={cn(field, "scheme-dark setup-item-cur")}
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value} className="bg-surface">
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            put("category_id", e.target.value);
          }}
          aria-label="Where it gets filed"
          className={cn(field, "scheme-dark min-w-0 setup-item-cat")}
        >
          <option value="" className="bg-surface">
            No category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id} className="bg-surface">
              {c.name}
            </option>
          ))}
        </select>

        {/*
          Food, drink or neither — and, when it goes off, how long it keeps.

          On the row rather than under it. It began as a second line and thirty-two of
          those turned a list into a column of paragraphs, every thing carrying the same
          eight words about not being followed into the house. That is said once now, in
          the section's own line at the top.

          It is also the switch: only food and drink are followed into `In the house` when
          they are bought, which is what keeps that list from filling up with socks and
          phone bills.
        */}
        <div className="setup-item-keeping">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              put("kind", e.target.value);
            }}
            aria-label="What kind of thing it is"
            className={cn(field, "scheme-dark min-w-0 flex-1")}
          >
            <option value="other" className="bg-surface">
              Not food or drink
            </option>
            <option value="food" className="bg-surface">
              Food
            </option>
            <option value="drink" className="bg-surface">
              Drink
            </option>
          </select>

          {/*
            Only where it means something. "How long does it keep" next to a phone bill is
            a question with no sensible answer. The placeholder carries the unit, so an
            empty box says what it wants without a label taking a third of the cell.
          */}
          {perishable && (
            <input
              type="number"
              min={1}
              max={3650}
              inputMode="numeric"
              value={days}
              onChange={(e) => {
                latest.current.days = e.target.value;
                setDays(e.target.value);
              }}
              onBlur={() => {
                const next = latest.current.days;
                if (next !== (item.keeps_days == null ? "" : String(item.keeps_days)))
                  put("keeps_days", next);
              }}
              placeholder="days"
              title="How many days it keeps. Leave empty if it does not go off."
              aria-label="How many days it keeps"
              className={cn(field, "setup-item-keeps")}
            />
          )}
        </div>

        <div className="setup-item-ctrl flex min-w-0 items-center justify-end gap-2">
          {/* A word rather than a button: nothing here waits to be pressed. */}
          {saving && <span className="setup-item-saving">Saving…</span>}
          <RowDelete
            onDelete={async () => {
              await deleteItem(item.id);
            }}
            label={`Remove ${item.name} from the list`}
            onLeaving={setLeaving}
          />
        </div>
      </div>

      <RowError message={error ?? undefined} />
    </div>
  );
}

/** The composer. It keeps a form, because there is no row to patch until it exists. */
function NewItem({ categories }: { categories: MoneyCategory[] }) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(saveItem, undefined);
  /* Held for the same reason the category composer holds its name — see `useComposer`. */
  const [draft, setDraft] = useComposer(state, {
    name: "",
    price: "",
    currency: "RSD",
    category: "",
  });

  return (
    <form
      action={formAction}
      className={cn(
        "setup-row-premium setup-cat-add rounded-b-card border-t border-line bg-white/[0.02] px-4 py-3.5",
        rowMotion,
        /* Fields shut while it saves — see `.is-saving` in the stylesheet for why. */
        pending && "is-saving",
      )}
    >
      <AddCaption>Add something you buy</AddCaption>

      <div className="setup-item-add-in">
        <input
          name="name"
          value={draft.name}
          onChange={(e) => setDraft({ name: e.target.value })}
          placeholder="Orange juice"
          aria-label="What it is called"
          required
          readOnly={pending}
          className={cn(field, "w-full min-w-0 font-medium")}
        />

        <MoneyField
          name="price"
          value={draft.price}
          onValueChange={(plain) => setDraft({ price: plain })}
          placeholder="Price"
          aria-label="What it cost last time"
          readOnly={pending}
          className="mb-0"
          inputClassName={cn(field, "w-full min-w-0 text-right")}
        />

        <select
          name="currency"
          value={draft.currency}
          onChange={(e) => setDraft({ currency: e.target.value })}
          disabled={pending}
          aria-label="Currency"
          className={cn(field, "scheme-dark")}
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value} className="bg-surface">
              {c.label}
            </option>
          ))}
        </select>

        <select
          name="category_id"
          value={draft.category}
          onChange={(e) => setDraft({ category: e.target.value })}
          disabled={pending}
          aria-label="Where it gets filed"
          className={cn(field, "scheme-dark min-w-0")}
        >
          <option value="" className="bg-surface">
            No category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id} className="bg-surface">
              {c.name}
            </option>
          ))}
        </select>

        <Button
          type="submit"
          variant="primary"
          className="money-premium-button w-full px-3 py-1.5 text-[12.5px]"
          disabled={pending}
        >
          <SwapLabel pending={pending} idle="Add" busy="Adding…" />
        </Button>
      </div>

      <RowError message={state?.error} />
    </form>
  );
}
