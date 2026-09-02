"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fold } from "@/lib/money/entry-search";
import type { MoneyItem } from "@/lib/types";

/** How many suggestions are offered at once. Past this the list is scrolled, not longer. */
const OFFERED = 8;

/**
 * A name field that remembers what you have bought before.
 *
 * It is an ordinary text input first and a picker second, and that order is the whole
 * design. Anything can be typed, including something that has never been bought — a
 * control that insists on a list is a control that blocks the one case it cannot predict.
 * What the list does is save the typing on the case it *can*: `nivea men silver protect
 * stick` is thirty-two characters, spelled slightly differently every third time, and the
 * ledger's search is only as good as that spelling.
 *
 * Choosing a suggestion fills the price and the category as well, because that is the
 * rest of the same keystroke — the thing costs what it cost last time and gets filed
 * where it was filed last time, and both are corrections away.
 *
 * The menu is portalled into the body for the same reason `PickMany`'s is: this field
 * lives inside a slide-over panel that clips, and `position: fixed` cannot be trusted
 * under a transform.
 */
export function ItemPicker({
  name,
  label,
  items,
  defaultValue = "",
  placeholder,
  help,
  onPick,
  onExact,
  onValueChange,
  compact = false,
  inputClassName,
  autoFocus,
  onKeyDown,
  className,
}: {
  name: string;
  label: string;
  items: MoneyItem[];
  defaultValue?: string;
  placeholder?: string;
  help?: string;
  /** Called with the whole row when one is chosen, so the form can fill its other fields. */
  onPick?: (item: MoneyItem) => void;
  /**
   * Called when what has been typed *is* one of the known names, letter for letter.
   *
   * Not the same event as picking one, and it must not be treated as one. Choosing from
   * the menu is a decision about this entry, so it fills the fields over whatever was
   * there. Typing a name that happens to be known is only a name — the price and the
   * category that come with it are a suggestion, and a suggestion does not get to
   * overwrite something already answered. The form decides; this only reports the match.
   */
  onExact?: (item: MoneyItem) => void;
  /** Every keystroke, for a caller that keeps its own copy of the value. */
  onValueChange?: (value: string) => void;
  /**
   * The field as it appears inside a row rather than as a form question.
   *
   * A line on a receipt already has a heading over the column and three controls beside
   * it; a label, a help line and a count button would be four more things in a space
   * that is one line tall. The menu is the same one — the difference is only what the
   * field says about itself when nothing is open.
   */
  compact?: boolean;
  inputClassName?: string;
  autoFocus?: boolean;
  /** The row's own key handling — Enter to add a line, and so on — runs after ours. */
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  /*
    Which row the keyboard is on. `-1` means none — the field, not the list.

    A picker you can only reach with the mouse is a picker you stop using, because the
    hands are already on the keys typing the name. Arrows move, Enter takes, Escape
    leaves; the pointer moving over a row takes the mark from the keyboard, so the two
    never disagree about what is highlighted.
  */
  const [cursor, setCursor] = useState(-1);
  const field = useRef<HTMLInputElement>(null);
  /* The field and its arrow together — a press on either is a press inside the control. */
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const typed = fold(value.trim());
  /*
    Before anything is typed the list is what it already is — most used first — because
    that is the shape of the answer: the weekly things. Once there is something to match,
    matching wins over frequency.
  */
  const shown = (typed ? items.filter((i) => fold(i.name).includes(typed)) : items).slice(0, 24);
  /*
    When to open, including when there is nothing to show.

    Nothing matching used to close the menu, and a control that vanishes while you type
    is indistinguishable from one that is broken — which is exactly how it was read. With
    one thing on the list, everything else you could type produced silence. So a search
    that finds nothing now says so; only a list with nothing in it at all stays quiet,
    because then there is genuinely nothing to be said.

    Still nothing to offer when the only match is letter for letter what is already
    typed: the answer is already in the box.
  */
  const worth =
    items.length > 0 &&
    (shown.length > 0 ? !(shown.length === 1 && fold(shown[0].name) === typed) : typed.length > 0);

  const place = () => {
    const rect = field.current?.getBoundingClientRect();
    if (!rect) return;
    const tall = Math.min(menu.current?.offsetHeight ?? 0, 300) || 240;
    const below = window.innerHeight - rect.bottom;
    const up = below < tall + 12 && rect.top > below;
    setBox({
      top: up ? rect.top + window.scrollY - tall - 6 : rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const again = requestAnimationFrame(place);
    return () => cancelAnimationFrame(again);
  }, [open, shown.length]);

  /** Shut it. Nothing reopens it on its own any more, so this is the whole story. */
  const shut = () => {
    setOpen(false);
    setCursor(-1);
  };

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrap.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
      setCursor(-1);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") shut();
    };
    const move = () => place();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", move, true);
    window.addEventListener("resize", move);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", move, true);
      window.removeEventListener("resize", move);
    };
  }, [open]);

  const choose = (item: MoneyItem) => {
    setValue(item.name);
    onValueChange?.(item.name);
    shut();
    onPick?.(item);
    field.current?.focus();
  };

  return (
    <div className={cn(!compact && "mb-3.25", className)}>
      {!compact && (
        <label htmlFor={name} className="mb-1.5 block text-xs font-semibold text-[#C6CAD6]">
          {label}
        </label>
      )}

      {/*
        The count and the chevron are the door, and the only one.

        The menu used to open on focus as well, and on a phone that is wrong: tapping the
        field to type is not asking for a list, and the list it produced covered the rest
        of the form. Now the field says at rest how many things it knows, and pressing
        that number is what opens them.

        Typing still brings the list up — the help line under the field promises exactly
        that, and a promise printed on a control has to hold.
      */}
      <div ref={wrap} className="item-pick-wrap">
        <input
        ref={field}
        id={name}
        name={name}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          onValueChange?.(next);
          /*
            Typing does not open the list either.

            Between them, focus and typing meant the list appeared for anybody writing a
            name — including every name that was never going to be on it — and on a phone
            it covered the form while you were still filling it in. The arrow is now the
            only door, and it stays shut until it is pressed.

            Still filtered while open, so opening it after three letters shows the three
            letters' worth of list. A new search is a new list; the mark starts off it
            rather than on whatever row sat at that index a keystroke ago.
          */
          setCursor(-1);
          /*
            Typing the whole name is the same statement as picking it off the list, and
            it is the one people actually make: `Maxi` is four letters, faster to type
            than to hunt for. Told apart from picking by `onExact` rather than `onPick`,
            because what a typed name is allowed to fill in is narrower — see the prop.
          */
          const key = fold(next.trim());
          if (!key || !onExact) return;
          const same = items.find((i) => fold(i.name) === key);
          if (same) onExact(same);
        }}
        /*
          The list is reachable from the keys the hands are already on. Down opens it if
          it is shut, so the arrow is the one gesture that always means "show me".
        */
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            /*
              The first Escape belongs to the list, the second to the panel.

              Both listen on `document`, and the menu's own handler used to let the press
              carry on bubbling — so dismissing the suggestions also shut the slide-over
              and threw away everything typed into it. Stopping it here only while there
              is a list to close leaves the plain Escape doing what it does everywhere
              else in the app.
            */
            if (open) {
              event.stopPropagation();
              shut();
              return;
            }
            onKeyDown?.(event);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!open) {
              setOpen(true);
              return;
            }
            if (!worth || shown.length === 0) return;
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setCursor((was) => {
              const next = was + step;
              if (next < 0) return shown.length - 1;
              if (next >= shown.length) return 0;
              return next;
            });
            return;
          }
          if (event.key === "Enter" && open && cursor >= 0 && shown[cursor]) {
            // Only when a row is actually marked, so Enter still does what it does
            // everywhere else in this app the rest of the time.
            event.preventDefault();
            choose(shown[cursor]);
            return;
          }
          onKeyDown?.(event);
        }}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && worth}
        aria-controls={`${name}-suggestions`}
        aria-autocomplete="list"
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          inputClassName ??
            "zv-field w-full rounded-ctrl border border-line bg-white/[0.035] px-3 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring focus:outline-none",
          items.length > 0 && (compact ? "item-pick-field-compact" : "item-pick-field"),
        )}
      />

        {items.length > 0 && (
          <button
            type="button"
            className={cn("item-pick-open", compact && "is-compact")}
            aria-label={`${items.length} ${items.length === 1 ? "thing" : "things"} bought before`}
            title="Things you have bought before"
            /*
              `onPointerDown` and not `onClick`: the menu closes on a pointer press
              outside itself, and a press on this button lands before the click does —
              so an `onClick` toggle would fire second, on a menu that had just closed,
              and the arrow would never open anything.
            */
            onPointerDown={(event) => {
              event.preventDefault();
              if (open) {
                shut();
              } else {
                setOpen(true);
                setCursor(-1);
              }
              field.current?.focus();
            }}
          >
            {/*
              The count is the argument for pressing it, and a receipt row has no width to
              print one — the name, the price, the currency and the bin are already on that
              line. So the row gets the chevron alone, and the number moves to the label a
              screen reader hears.
            */}
            {!compact && <span className="mono item-pick-count">{items.length}</span>}
            <ChevronDown className={cn("h-3.5 w-3.5", open && "rotate-180")} strokeWidth={2.25} />
          </button>
        )}
      </div>

      {help && !compact && <p className="mt-1.25 text-[11.5px] text-muted">{help}</p>}

      {open &&
        worth &&
        box &&
        createPortal(
          <div
            ref={menu}
            id={`${name}-suggestions`}
            role="listbox"
            aria-label="Things you have bought before"
            className="item-menu"
            style={{ top: box.top, left: box.left, minWidth: box.width }}
          >
            {/*
              The menu names itself. Without it the panel is a floating rectangle of
              words that could be anything — a category filter, a recent search — and the
              one question it can answer at a glance is what these things are and how
              many of them there are.
            */}
            <div className="item-menu-head">
              <span className="item-menu-title">Bought before</span>
              <span className="mono item-menu-count">{items.length}</span>
              {/*
                The way out, for the hands that have no Escape key.

                On a phone the menu covers the whole form: there is no field left beside
                it to press, the keyboard has no Escape, and the arrow that opens it is
                behind the menu's own top edge. So the list could be opened and not shut —
                which is what "it stands there and I cannot get out of it" was.
              */}
              <button
                type="button"
                className="item-menu-close"
                aria-label="Close the list"
                onPointerDown={(event) => {
                  event.preventDefault();
                  shut();
                }}
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="item-menu-list">
              {shown.length === 0 && (
                <p className="item-none">
                  Ništa slično na listi — nastavi da kucaš, dodaje se kad sačuvaš.
                </p>
              )}
              {shown.slice(0, OFFERED * 3).map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => choose(item)}
                  onPointerEnter={() => setCursor(i)}
                  role="option"
                  aria-selected={i === cursor}
                  className={cn("item-opt", i === cursor && "is-on")}
                >
                  <span className="item-opt-main">
                    <span className="item-opt-name">{mark(item.name, value.trim())}</span>
                    <span className="item-opt-meta">{story(item)}</span>
                  </span>
                  {item.price !== null && Number(item.price) > 0 && (
                    <span className="mono item-opt-price">
                      {Number(item.price).toLocaleString("sr-RS")}
                      <span className="item-opt-cur"> {item.currency}</span>
                    </span>
                  )}
                </button>
              ))}
            </div>

            {shown.length > 0 && (
              <p className="item-menu-foot">
                <kbd>↑</kbd><kbd>↓</kbd> za kretanje · <kbd>↵</kbd> da izabereš
              </p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * The typed part of a name, made visible inside the whole name.
 *
 * The one thing that separates an autocomplete that feels precise from one that feels
 * like a guess: you can see *why* a row is on the list. Matched on the folded form —
 * accents and case removed — but sliced out of the original, so `Cokoladno` typed
 * against `Čokoladno mleko` still lights the right five letters rather than none.
 */
function mark(name: string, typed: string): React.ReactNode {
  const needle = fold(typed);
  if (!needle) return name;
  const at = fold(name).indexOf(needle);
  if (at < 0) return name;
  return (
    <>
      {name.slice(0, at)}
      <b className="item-opt-hit">{name.slice(at, at + needle.length)}</b>
      {name.slice(at + needle.length)}
    </>
  );
}

/** What the row knows about this thing besides its name. Absent rather than padded. */
function story(item: MoneyItem): string {
  const bits: string[] = [];
  if (item.uses > 0) bits.push(item.uses === 1 ? "kupljeno jednom" : `kupljeno ${item.uses}\u00d7`);
  if (item.last_used_on) bits.push(`poslednji put ${item.last_used_on.slice(8, 10)}.${item.last_used_on.slice(5, 7)}.`);
  return bits.join(" \u00b7 ");
}
