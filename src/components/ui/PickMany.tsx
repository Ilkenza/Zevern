"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { control, type ListOption } from "./control";

/** Past this many, the menu grows a box to type in. Under it, everything is visible. */
const CROWDED = 8;

/** Ignore case and diacritics both, so "odeca" finds "odeća". */
function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

/**
 * A toolbar filter you can answer with more than one thing.
 *
 * The bar was built out of `<select>`, which asks a question that only has one answer,
 * and for most of these that is right — an entry has one kind, a list is in one order.
 * It is wrong for the two questions people actually ask of a ledger: *these three
 * categories*, *those two accounts*. With a single select the only way to ask that is to
 * look at each one in turn and add the answers up in your head, which is the arithmetic
 * the screen was supposed to be doing.
 *
 * Shaped like the control beside it rather than like a form field: same height, same
 * outline, same chevron, so the row still reads as one row. What is behind the chevron is
 * a list of checkboxes instead of a list of options, and the button says how many are on.
 *
 * The menu is rendered into `document.body`.
 *
 * That is not a decoration. Half the toolbars in this app sit inside a `Panel`, which
 * clips what it holds, and an absolutely positioned menu inside one is cut off at the
 * panel edge — while `position: fixed` cannot be trusted either, because any ancestor
 * with a transform, a filter or a backdrop-filter silently becomes the thing it is fixed
 * to, and this app has all three. A portal to the body has no ancestor left to be caught
 * by. It is placed in page coordinates and follows the page as it scrolls; anything that
 * moves it out from under the button — an ancestor scrolling, a resize — repositions it.
 */
export function PickMany({
  values,
  onValues,
  label,
  all,
  many,
  options,
  chrome = control,
  className,
}: {
  values: string[];
  onValues: (next: string[]) => void;
  /** For screen readers; the button text is what people read. */
  label: string;
  /** What no narrowing is called — "All categories", "Every account". */
  all: string;
  /** The plural for the summary: `3 categories`. Falls back to "picked". */
  many?: string;
  options: ListOption[];
  chrome?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const [box, setBox] = useState<{
    top: number;
    left: number;
    width: number;
    up: boolean;
  } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const place = () => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;

    /*
      Downward unless there is no room downward.

      The menu is up to about 330px tall, and this control sits on toolbars that are
      often near the bottom of what is on screen — a panel's bar with the list scrolled
      past it, a phone in landscape. Opening down from there puts the options below the
      fold of a menu that cannot itself be scrolled to, so the flip is not a nicety.
      Above only when above is genuinely roomier, so the ordinary case never moves.
    */
    const tall = Math.min(menu.current?.offsetHeight ?? 0, 340) || 260;
    const below = window.innerHeight - rect.bottom;
    const up = below < tall + 12 && rect.top > below;

    setBox({
      top: up ? rect.top + window.scrollY - tall - 6 : rect.bottom + window.scrollY + 6,
      // Never off the left edge, and never so far right that the menu leaves the window.
      left: Math.max(
        8 + window.scrollX,
        Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 240),
      ),
      // Never narrower than the button.
      width: Math.max(rect.width, 224),
      up,
    });
  };

  /*
    Before paint, so the menu never shows up in the wrong place for a frame. Twice: the
    first pass has no menu to measure and uses a typical height, the second runs once it
    is in the document and corrects an upward flip to its real height. Downward placement
    does not depend on the height at all, so the ordinary case settles on the first pass.
  */
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const again = requestAnimationFrame(place);
    return () => cancelAnimationFrame(again);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    /*
      `pointerdown` on the document rather than a full-screen sheet behind the menu. A
      sheet is `position: fixed`, and fixed is exactly what cannot be trusted here — the
      same containing-block trap the portal above exists to avoid. Listening on the
      document has no geometry to get wrong.
    */
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (button.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    // Capture, so a scrolling ancestor is caught as well as the window.
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

  const toggle = (value: string) =>
    onValues(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);

  const crowded = options.length > CROWDED;
  const typed = plain(find.trim());
  const listed = typed ? options.filter((o) => plain(o.label).includes(typed)) : options;

  /*
    What the button says. One pick reads as itself — naming it is more use than counting
    it — and past that the count is the only thing that fits.
  */
  const summary =
    values.length === 0
      ? all
      : values.length === 1
        ? // Without the count. In the menu `(128)` is what the row is worth choosing for;
          // on the button it is a number nobody asked for, wrapped in a second bracket.
          (options.find((o) => o.value === values[0])?.label.replace(/\s*\(\d+\)\s*$/, "") ??
          all)
        : `${values.length} ${many ?? "picked"}`;

  return (
    <div className={cn("zv-pick", className)}>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(chrome, "zv-pick-button", values.length > 0 && "is-on")}
      >
        <span className="zv-pick-said">{summary}</span>
        <ChevronDown className="zv-pick-chevron h-3.5 w-3.5" aria-hidden />
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={menu}
            role="group"
            aria-label={label}
            className="zv-pick-menu"
            style={{ top: box.top, left: box.left, minWidth: box.width }}
          >
            {crowded && (
              <div className="zv-pick-find">
                <Search className="h-3.5 w-3.5" aria-hidden />
                <input
                  autoFocus
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="Find…"
                  aria-label={`Find within ${label}`}
                />
              </div>
            )}

            <div className="zv-pick-list">
              {listed.map((o) => {
                const on = values.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(o.value)}
                    className={cn("zv-pick-row", on && "is-on")}
                  >
                    <span className="zv-pick-tick" aria-hidden>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{o.label}</span>
                  </button>
                );
              })}

              {listed.length === 0 && <p className="zv-pick-none">Nothing matches that.</p>}
            </div>

            {/*
              The way back. A filter you cannot undo without remembering what you pressed
              is a filter that traps the list, and that is the one failure a narrowing
              control must never have.
            */}
            {values.length > 0 && (
              <button type="button" onClick={() => onValues([])} className="zv-pick-clear">
                {all}
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
