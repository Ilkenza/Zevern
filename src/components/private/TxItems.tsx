"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import {
  MAX_ITEMS,
  itemsArePriced,
  itemsTotal,
  lineTotal,
  type TxItem,
} from "@/lib/money/items";
import { editMoney, groupMoney, plainMoney, typedMoney } from "@/components/ui/MoneyField";
import { formatAmount } from "@/lib/money";
import { ItemPicker } from "@/components/ui/ItemPicker";
import type { MoneyItem } from "@/lib/types";

/**
 * What was in the bag, as a list rather than a sentence.
 *
 * The entry has always had one name field, so a shop trip with six things in it had to
 * be typed as one comma-separated line — which nothing could read back, count, or add
 * up. This is the same information with the commas turned into rows: a name, how many,
 * and what that line cost.
 *
 * The whole list travels as one hidden JSON field rather than as `items[0][name]` and
 * friends. Server actions receive a flat `FormData`, so indexed names would have to be
 * unpacked by hand on the other side, and the unpacking would have to agree with the
 * markup about the order rows were rendered in — an agreement that breaks the first
 * time somebody deletes the second row.
 *
 * A row with no name is not sent. That is not validation so much as arithmetic: the
 * empty row at the bottom is the invitation to add one, and an invitation is not an
 * item.
 */

const MAX_QTY = 9999;
const clampQty = (n: number) => Math.min(MAX_QTY, Math.max(1, Math.round(n) || 1));

/**
 * Rows carry a key so React can tell two identically-named lines apart while typing,
 * and the price as typed as well as parsed — "12," is a real state on the way to
 * "12,50", and a number cannot hold it.
 */
type Row = TxItem & { key: number; typed: string };

let nextKey = 0;
const blank = (): Row => ({ key: ++nextKey, name: "", qty: 1, amount: 0, typed: "" });

/**
 * Hold the button down and it keeps going, faster after the first second.
 *
 * A tap is one step, which is the common case. Twenty of something is the case that
 * makes a stepper worse than a text field unless it repeats — twenty taps, and you
 * would rather have typed it. There is a beat before the repeat starts so an ordinary
 * click never runs away.
 */
function useRepeat(step: (n: number) => void) {
  const start = useRef<number | null>(null);
  const tick = useRef<number | null>(null);
  const ticks = useRef(0);

  const stop = () => {
    if (start.current !== null) window.clearTimeout(start.current);
    if (tick.current !== null) window.clearInterval(tick.current);
    start.current = null;
    tick.current = null;
    ticks.current = 0;
  };

  useEffect(() => stop, []);

  const begin = (delta: number) => {
    step(delta);
    stop();
    start.current = window.setTimeout(() => {
      tick.current = window.setInterval(() => {
        ticks.current += 1;
        // Past two seconds of holding it moves in tens: nobody holds a stepper down
        // that long to arrive at 23.
        step(ticks.current > 22 ? delta * 10 : delta);
      }, 55);
    }, 420);
  };

  return { begin, stop };
}

export function TxItems({
  initial,
  currency,
  known = [],
  onTotalChange,
}: {
  initial: TxItem[];
  currency: string;
  /**
   * Things bought before, offered on every line.
   *
   * This is where the shopping list earns its keep. One coffee is quick to type either
   * way; a receipt with eight lines on it is the case the list was made for, and it was
   * the one place the list was not offered.
   *
   * The same `ItemPicker` the single-name field uses, in its row size — see the note at
   * the field itself for why the native `datalist` this started as had to go.
   */
  known?: MoneyItem[];
  /**
   * The parent locks its Amount field to this while `priced` holds.
   *
   * `priced` is reported rather than inferred from the total, because a total is not
   * enough to tell "three lines, all priced" from "three lines, one of them priced" —
   * and the second of those sums to something that looks like a receipt total and is
   * not one.
   */
  onTotalChange: (total: number, count: number, priced: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((i) => ({ ...i, key: ++nextKey, typed: typedMoney(i.amount) }))
      : [],
  );

  /*
    Which row is showing its stepper, if any — see `ItemRow` for why only one does.
    Held here rather than in the row so that opening one closes the last.
  */
  const [openKey, setOpenKey] = useState<number | null>(null);

  /*
    The line to put the cursor in once it exists. Only ever a key that is about to be
    mounted, so the name field can take it with `autoFocus` and nothing has to chase
    a ref across a render.
  */
  const [focusKey, setFocusKey] = useState<number | null>(null);

  /*
    The repeat timer fires long after its handler was made, so it cannot close over the
    rows it was created with — it would step 1 → 2 forever. The ref is updated after
    each commit rather than during render, which is both correct and what the hooks
    rule asks for.
  */
  const latest = useRef(rows);
  useEffect(() => {
    latest.current = rows;
  }, [rows]);

  const filled = rows.filter((r) => r.name.trim() !== "");
  const total = itemsTotal(filled);
  /* The empty line at the bottom is already the invitation; a second one is a bug. */
  const lastBlank = rows.length > 0 && rows[rows.length - 1].name.trim() === "";

  const addRow = () => {
    if (lastBlank || rows.length >= MAX_ITEMS) return;
    const row = blank();
    setFocusKey(row.key);
    commit([...rows, row]);
  };

  const commit = (next: Row[]) => {
    setRows(next);
    const kept = next.filter((r) => r.name.trim() !== "");
    onTotalChange(itemsTotal(kept), kept.length, itemsArePriced(kept));
  };

  const patch = (key: number, part: Partial<Row>) =>
    commit(rows.map((r) => (r.key === key ? { ...r, ...part } : r)));

  const bump = (key: number, delta: number) => {
    const row = latest.current.find((r) => r.key === key);
    if (!row) return;
    const qty = clampQty(row.qty + delta);
    if (qty === row.qty) return;
    commit(latest.current.map((r) => (r.key === key ? { ...r, qty } : r)));
  };

  const hidden = (
    <input
      type="hidden"
      name="items"
      value={JSON.stringify(
        filled.map((r) => ({ name: r.name.trim(), qty: r.qty, amount: r.amount })),
      )}
    />
  );

  /*
    Nothing listed yet is not an empty list — it is a question that has not been asked.
    A caption, a rule and a running total over no rows is three pieces of furniture
    around an absence; the invitation on its own is the whole state.
  */
  if (rows.length === 0) {
    return (
      <div className="tx-items">
        <button
          type="button"
          onClick={() => {
            const row = blank();
            setFocusKey(row.key);
            commit([row]);
          }}
          className="tx-items-add"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          List what you bought
        </button>
        {hidden}
      </div>
    );
  }

  return (
    <div className="tx-items">
      {/*
        No caption over the list. It is named by how it ends — `Total` under the names,
        the sum under the figures — which is one label instead of two.
      */}
      <div className="tx-items-rows">
        {rows.map((row) => (
          <ItemRow
            key={row.key}
            row={row}
            currency={currency}
            known={known}
            open={openKey === row.key}
            onOpen={() => setOpenKey(row.key)}
            onClose={() => setOpenKey((k) => (k === row.key ? null : k))}
            autoFocus={row.key === focusKey}
            onEnter={addRow}
            onPatch={(part) => patch(row.key, part)}
            onBump={(delta) => bump(row.key, delta)}
            onRemove={() => {
              setOpenKey((k) => (k === row.key ? null : k));
              commit(rows.filter((r) => r.key !== row.key));
            }}
          />
        ))}
      </div>

      <div>
        {rows.length < MAX_ITEMS ? (
          <button
            type="button"
            onClick={addRow}
            disabled={lastBlank}
            className="tx-items-add"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add another
          </button>
        ) : (
          <span />
        )}
      </div>

      {/*
        Only once there is something to total. A "0 RSD" under an empty list is the app
        reporting a measurement it has not taken.
      */}
      {filled.length > 0 && total > 0 && (
        <div className="tx-items-foot">
          <span className="tx-items-foot-label">Total</span>
          <span className="mono tx-items-total" aria-live="polite">
            {formatAmount(total, currency)}
          </span>
        </div>
      )}

      {/*
        What actually reaches the server. Only named rows, so the empty invitation at
        the bottom never becomes a blank line in somebody's receipt.
      */}
      {hidden}
    </div>
  );
}

function ItemRow({
  row,
  currency,
  known,
  autoFocus,
  open,
  onOpen,
  onClose,
  onEnter,
  onPatch,
  onBump,
  onRemove,
}: {
  row: Row;
  currency: string;
  known: MoneyItem[];
  /** This line was just added by the person, so the cursor belongs in it. */
  autoFocus: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEnter: () => void;
  onPatch: (part: Partial<Row>) => void;
  onBump: (delta: number) => void;
  onRemove: () => void;
}) {
  const repeat = useRepeat(onBump);

  /*
    What a known thing brings with it.

    `over` is true only when the row was chosen off the list — then the price replaces
    whatever was in the box. A name that merely matches fills a price that is not there
    yet and touches nothing else. And in both cases only when the price is in the
    currency this entry is written in: a dinar price dropped into a euro receipt is a
    number that looks right and is off by a hundred.
  */
  const fillRow = (item: MoneyItem, over: boolean) => {
    if (item.price === null || Number(item.price) <= 0) return;
    if (item.currency !== currency) return;
    if (!over && row.amount !== 0) return;
    const typed = typedMoney(Number(item.price));
    onPatch({ typed, amount: Number(plainMoney(typed)) || 0 });
  };
  const qtyRef = useRef<HTMLInputElement>(null);
  /*
    True from the moment the stepper opens until the first thing you do in it.

    Opening used to select the figure, so pressing 5 replaced the 1 rather than making
    it 15. That is the right arithmetic and the wrong picture: you press a small button
    and a block of solid colour appears over a number you did not ask to highlight. A
    caret is what a field that is ready for typing looks like — so the field shows one,
    and the first digit still replaces, because that is what opening it meant.
  */
  const fresh = useRef(false);
  /* Typing replaces what is there. Clicking into "1" and typing "0" gave 10 or 01. */
  const selectAll = (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select();

  /*
    Enter inside a list is not Enter inside a form.

    These fields sit in the middle of the entry, so the browser's default — submit —
    meant that finishing a line by pressing Enter saved a half-written transaction.
    Here it does what it does in every list: closes this line and opens the next.
  */
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    /*
      On the last line it opens a new one; anywhere above it steps down to the next,
      which is what Enter does in every list of fields. Reading the next line out of
      the DOM beats threading a ref through every row to answer "who comes after me".
    */
    const next = e.currentTarget
      .closest(".tx-items-row")
      ?.nextElementSibling?.querySelector<HTMLInputElement>(".tx-cell");
    if (next) next.focus();
    else onEnter();
  };

  useEffect(() => {
    if (!open) return;
    fresh.current = true;
    /*
      Caret at the end, not a selection: pressing a small control and having a block of
      colour land on a number you did not ask to highlight is startling. The first
      digit still replaces — see the keydown below — so the arithmetic survives without
      the picture.
    */
    const n = qtyRef.current?.value.length ?? 0;
    qtyRef.current?.setSelectionRange(n, n);
  }, [open]);

  /*
    A press must not move focus off the figure. Safari does not focus a button on
    click, so without this the group would blur the moment you pressed a segment and
    the stepper would fold up under your finger.
  */
  const press = (delta: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    /* You have used the control; the next digit you type extends rather than replaces. */
    fresh.current = false;
    qtyRef.current?.focus();
    repeat.begin(delta);
  };

  return (
    <div className={open ? "tx-items-row is-open" : "tx-items-row"}>
      {/*
        The line anybody reads: what it was, and what it cost. Two things, both with
        room, which is the whole reason this stopped being a table.
      */}
      <div className="tx-it-top">
        {/*
          The same picker the single-name field uses, in its row size.

          It was a native `datalist` first, on the argument that eight portalled menus in
          a scrolling list would fight for the same few hundred pixels. That argument was
          wrong: the menu is only rendered while it is open, and only one row can hold
          the caret — so there is never more than one. What the browser's own list cost
          instead was everything the list is for. It shows names and nothing else: no
          price, no "bought 6× · last on the 28th", no highlight on the letters you
          typed, and it is drawn in the browser's chrome rather than the app's. A control
          that looks borrowed is a control people stop trusting.
        */}
        <ItemPicker
          compact
          name={`item-${row.key}`}
          label="Item"
          items={known}
          defaultValue={row.name}
          placeholder="Kafa 3 u 1"
          autoFocus={autoFocus}
          inputClassName="tx-cell w-full min-w-0"
          className="min-w-0"
          onKeyDown={onKey}
          onValueChange={(name) => onPatch({ name })}
          /* Choosing off the list is a decision about this line: it brings its price. */
          onPick={(item) => fillRow(item, true)}
          /* Typing a known name only fills a line that has no price of its own yet. */
          onExact={(item) => fillRow(item, false)}
        />

        {/*
          Grouped as you type, like every other amount in the app.

          A bare number box is the one thing the rule about money fields exists to
          prevent: 100000 and 1000000 are the same shape at a glance and the only way
          to be sure is to count zeros. The typed string is kept beside the parsed
          number because "12," is a real state on the way to "12,50" and a number
          cannot hold it.
        */}
        <input
          value={groupMoney(row.typed)}
          onChange={(e) => {
            const typed = editMoney(groupMoney(row.typed), e.target.value);
            onPatch({ typed, amount: Number(plainMoney(typed)) || 0 });
          }}
          onFocus={selectAll}
          onKeyDown={onKey}
          inputMode="decimal"
          placeholder="0"
          aria-label={`Price of one, in ${currency}`}
          className="tx-price mono"
        />
        <span className="tx-it-cur mono" aria-hidden>
          {currency}
        </span>
      </div>

      {/*
        The quiet line. How many, what one of them came to, and the way out — said in
        words, at a weight that reaches the eye second.
      */}
      <div className="tx-it-sub">
        {/*
          The figure and its two steps, always the same elements.

          Swapping a button for a field meant the count vanished and a control appeared
          in the same instant — the one kind of change a person notices and cannot
          follow. The steps are always here at no width; focus unfolds them either side
          of a number that stays where the eye left it.
        */}
        <div
          className="tx-qty"
          /*
            The whole box opens it, not just the digits inside. A 6px-wide "1" is a
            poor target for a finger, and the frame is drawn precisely to say "press
            here" — so pressing anywhere in it has to do what it promises.
          */
          onPointerDown={(e) => {
            if (open || (e.target as HTMLElement).closest("button")) return;
            e.preventDefault();
            qtyRef.current?.focus();
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            onClose();
            qtyRef.current?.blur();
          }}
        >
          <button
            type="button"
            onPointerDown={press(-1)}
            onPointerUp={repeat.stop}
            onPointerLeave={repeat.stop}
            onPointerCancel={repeat.stop}
            disabled={!open || row.qty <= 1}
            tabIndex={open ? 0 : -1}
            aria-hidden={!open}
            aria-label="One fewer"
            className="tx-qty-step"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <input
            ref={qtyRef}
            value={row.qty}
            onFocus={onOpen}
            onChange={(e) => {
              fresh.current = false;
              onPatch({ qty: clampQty(Number(e.target.value)) });
            }}
            onPointerDown={() => {
              fresh.current = false;
            }}
            onKeyDown={(e) => {
              if (fresh.current && /^\d$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
                /* The first digit after opening replaces; everything after it appends. */
                e.preventDefault();
                fresh.current = false;
                onPatch({ qty: clampQty(Number(e.key)) });
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                onClose();
                e.currentTarget.blur();
                return;
              }
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              fresh.current = false;
              onBump(e.key === "ArrowUp" ? 1 : -1);
            }}
            inputMode="numeric"
            aria-label="How many"
            className="mono"
          />
          <button
            type="button"
            onPointerDown={press(1)}
            onPointerUp={repeat.stop}
            onPointerLeave={repeat.stop}
            onPointerCancel={repeat.stop}
            disabled={!open || row.qty >= MAX_QTY}
            tabIndex={open ? 0 : -1}
            aria-hidden={!open}
            aria-label="One more"
            className="tx-qty-step"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="tx-it-kom">{row.qty === 1 ? "item" : "items"}</span>

        {/*
          What the line comes to, once there is more than one of the thing.

          It used to say the opposite — the amount divided by the count, printed as
          `59,5 each` — because the figure in the box was read as the line's total. It is
          the price of one now, so the arithmetic a person would otherwise do in their
          head runs the other way: two at 119 is 238, and 238 is the number that leaves
          the account. Shown only where it says something; at a count of one the box
          already is the answer.
        */}
        {row.qty > 1 && row.amount > 0 && (
          <>
            <span className="tx-it-dot" aria-hidden>
              ·
            </span>
            <span className="tx-it-unit mono">
              {groupMoney(typedMoney(lineTotal({ name: row.name, qty: row.qty, amount: row.amount })))}{" "}
              {currency}
            </span>
          </>
        )}

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${row.name || "this line"}`}
          className="tx-it-del"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
