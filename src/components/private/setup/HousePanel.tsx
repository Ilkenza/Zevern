"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  addStock,
  logStockMove,
  removeStock,
  removeStockMove,
  type MoneyState,
} from "@/app/(app)/private/actions";
import { Button } from "@/components/ui/Button";
import { standingOf, STANDING_LABEL, type Standing } from "@/lib/money/stock";
import { formatDate, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MoneyItem, StockLine } from "@/lib/types";
import { AddCaption, RowError, SwapLabel, field, rowMotion } from "./kit";

/**
 * What is in the house, and the two things that can happen to it.
 *
 * The list exists because of one afternoon: bananas bought, forgotten, rotten in four
 * days, thrown out. The ledger recorded the purchase perfectly and had nothing to say
 * about the part that mattered.
 *
 * No money anywhere on this screen, and that is a decision rather than an omission — it
 * was offered and turned down. Most item lines carry no price, so a figure in dinars
 * would be the app splitting a shopping bag's total across nine things and printing the
 * estimate as a fact.
 *
 * What is left is counted in pieces, because that is how he asked for it and because it
 * is how a bowl works: ten bananas, one eaten, nine. Kilograms would need a decimal and a
 * unit picker on every line for an accuracy nobody is going to use.
 */

/**
 * What the press is called, per kind of thing.
 *
 * A juice is not eaten. The row said `Eaten` over a bottle of it because the column in
 * the database is called `eaten` — which is a fine name for a column and a wrong word on
 * a button. The stored value does not change; only what the row says it means.
 */
const GONE: Record<string, string> = { drink: "Drunk", food: "Eaten" };

/** How urgent a lot looks. Only the two that want attention are coloured at all. */
const TONE: Record<Standing, string> = {
  gone: "is-gone",
  today: "is-today",
  soon: "is-soon",
  later: "",
  none: "",
};

function StockRow({ line, today }: { line: StockLine; today: string }) {
  /*
    How many the next press takes — and normally nobody says, because it is one.

    It began as a number box sitting between the row and its two buttons, on every line,
    always. That is a sum to do before you can say the simplest thing there is: I ate a
    banana. "Ovako je glupi iskreno", and it was.

    So the buttons take one, which is the answer almost every time, and the count is
    reached only by asking for it — the figure on the left is a button, and pressing it
    turns it into a field. When it is not one the buttons say so, because a control that
    is about to take three of something should not be labelled the same as one that takes
    one.
  */
  const [many, setMany] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"eaten" | "binned" | null>(null);
  const [open, setOpen] = useState(false);
  const standing = standingOf(line.expiresOn, today);
  const asked = many === null ? 1 : Number(many.replace(",", ".")) || 0;
  const label = asked === 1 ? "" : ` ${asked}`;
  const gone = GONE[line.kind] ?? "Eaten";

  async function take(kind: "eaten" | "binned") {
    setBusy(kind);
    setError(null);
    const result = await logStockMove(line.id, kind, asked);
    if (result?.error) setError(result.error);
    else setMany(null);
    setBusy(null);
  }

  return (
    <div className={cn("house-row", rowMotion, TONE[standing])}>
      <div className="house-row-in">
        <span className="min-w-0">
          <span className="house-name">{line.name}</span>
          <span className="house-sub">
            {/*
              What is left, against what was bought — because "9" on its own is a number
              and "9 of 10" is a fact about a shop trip you can remember.

              And it is the way in to the count: press it and it becomes a field. The one
              figure on the row that is about how many there are is also the one that says
              how many are going.
            */}
            {many === null ? (
              <button
                type="button"
                onClick={() => setMany("1")}
                title="Say how many are going"
                className="house-count"
              >
                <b className="mono">{line.left}</b>
                {line.left !== line.bought && <> of {line.bought}</>}
              </button>
            ) : (
              <span className="house-many">
                <input
                  value={many}
                  autoFocus
                  onChange={(e) => setMany(e.target.value)}
                  onBlur={() => setMany((v) => (v === null || v.trim() === "" ? null : v))}
                  inputMode="numeric"
                  aria-label={`How many ${line.name}`}
                  className={cn(field, "house-qty")}
                />
                {/*
                  The whole lot, without counting it.

                  `onMouseDown` rather than `onClick` for the guard: the field closes
                  itself on blur when it is empty, and a plain click would blur it first
                  and land on nothing. Preventing the default keeps the caret where it is,
                  so the press only ever fills the number in.
                */}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setMany(String(line.left))}
                  title={`All ${line.left}`}
                  className="house-all"
                >
                  all
                </button>
              </span>
            )}
            {" · bought "}
            {formatDate(line.boughtOn)}
            {line.expiresOn && (
              <>
                {" · "}
                <span className="house-when">
                  {STANDING_LABEL[standing]}
                  {standing !== "gone" && standing !== "today" && ` — ${formatDate(line.expiresOn)}`}
                </span>
              </>
            )}
          </span>
        </span>

        <span className="house-do">
          <Button
            type="button"
            variant="secondary"
            className="money-premium-button px-2.5 py-1 text-[11.5px]"
            disabled={busy !== null}
            onClick={() => take("eaten")}
          >
            <SwapLabel pending={busy === "eaten"} idle={`${gone}${label}`} busy="…" />
          </Button>
          {/*
            Binned sits beside eaten rather than under a menu, because it is the answer
            this whole list exists to make easy to give. Quieter than eaten, though: it is
            the one you would rather not be pressing.
          */}
          <Button
            type="button"
            variant="ghost"
            className="money-premium-button px-2.5 py-1 text-[11.5px]"
            disabled={busy !== null}
            onClick={() => take("binned")}
          >
            <SwapLabel pending={busy === "binned"} idle={`Binned${label}`} busy="…" />
          </Button>

          {/*
            The bin, on the same line as the two buttons rather than pinned to the corner
            above them.

            It was absolutely positioned at the top right, which lines up with nothing: on
            a one-line row it floated a few pixels above the centre of the buttons beside
            it, and the moment a row grew — a name that wraps, the movements unfolded — it
            stayed at the top while everything else stayed in the middle. Sitting in the
            row it is centred against them for free, at any height, the same way every
            other list in Setup ends its rows.

            Still quiet until the row is hovered, and still answering its own question: not
            what happened to the food, but that this row should never have existed.
          */}
          <button
            type="button"
            aria-label={`Remove ${line.name} from what is in the house`}
            title="Not actually in the house"
            className="house-forget"
            onClick={async () => {
              const result = await removeStock(line.id);
              if (result?.error) setError(result.error);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      </div>

      {line.moves.length > 0 && (
        <div className="house-moves">
          <button type="button" className="house-moves-trigger" onClick={() => setOpen(!open)}>
            {open ? "Hide" : `${line.moves.length} already gone`}
          </button>
          {open &&
            line.moves.map((move) => (
              <span key={move.id} className="house-move">
                <span className="mono">{move.qty}</span>{" "}
                {move.kind === "eaten" ? gone.toLowerCase() : move.kind} · {formatDate(move.on)}
                {/*
                  The undo, and the reason the movements are rows rather than a counter
                  being decremented: "I ate three" when it was two is corrected by removing
                  the three, not by typing a compensating minus one.
                */}
                <button
                  type="button"
                  aria-label={`Undo ${move.qty} ${move.kind === "eaten" ? gone.toLowerCase() : move.kind}`}
                  className="house-move-undo"
                  onClick={async () => {
                    const result = await removeStockMove(move.id);
                    if (result?.error) setError(result.error);
                  }}
                >
                  undo
                </button>
              </span>
            ))}
        </div>
      )}

      <RowError message={error ?? undefined} />
    </div>
  );
}

/**
 * Putting something in the house by hand.
 *
 * Buying is the ordinary way a lot appears — an entry with food on it makes them itself —
 * but not the only way. Things arrive as presents, in somebody else's shopping, or from a
 * purchase filed before the thing was ever marked as food. Without this the list would be
 * empty until the next shop, which is a feature that does nothing on the day it is
 * turned on.
 */
function AddStock({ items }: { items: MoneyItem[] }) {
  const [state, formAction, pending] = useActionState<MoneyState, FormData>(addStock, undefined);

  return (
    /* Fields shut while it saves — see `.is-saving` in the stylesheet for why. */
    <form action={formAction} className={cn("house-add", pending && "is-saving")}>
      <AddCaption>Put something in the house</AddCaption>
      <div className="house-add-in">
        <select
          name="item_id"
          required
          disabled={pending}
          aria-label="What it is"
          className={cn(field, "scheme-dark min-w-0")}
        >
          <option value="" className="bg-surface">
            Pick a thing…
          </option>
          {items.map((item) => (
            <option key={item.id} value={item.id} className="bg-surface">
              {item.name}
            </option>
          ))}
        </select>
        <input
          name="qty"
          defaultValue="1"
          inputMode="numeric"
          readOnly={pending}
          aria-label="How many"
          className={cn(field, "text-right")}
        />
        <input
          name="bought_on"
          type="date"
          defaultValue={todayISO()}
          readOnly={pending}
          aria-label="When it was bought"
          className={cn(field, "scheme-dark")}
        />
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

export function HousePanel({ stock, items }: { stock: StockLine[]; items: MoneyItem[] }) {
  const today = todayISO();
  /*
    Only things marked as food or drink can be put in the house, because only they are
    ever followed out of it. Offering the whole shopping list here would let somebody add
    a phone bill to the fridge and then wonder for a week why nothing asks about it.
  */
  const keepable = items.filter((i) => i.kind === "food" || i.kind === "drink");

  return (
    <div className="house-list">
      {stock.map((line) => (
        <StockRow key={line.id} line={line} today={today} />
      ))}
      {keepable.length > 0 ? (
        <AddStock items={keepable} />
      ) : (
        <p className="house-empty">
          Nothing is being followed yet. Mark something in <b>Things you buy</b> as food or
          drink — and say how long it keeps, if it is the kind of thing that goes off — and
          what you buy of it turns up here.
        </p>
      )}
    </div>
  );
}
