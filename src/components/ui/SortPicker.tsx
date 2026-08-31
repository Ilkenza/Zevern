"use client";

import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { cn } from "@/lib/utils";
import { control, type SortOption } from "./control";

/**
 * One control for the whole question: what to sort by, and which way it runs.
 *
 * Three shapes were tried before this one. A select per direction — `Newest` above
 * `Oldest` — is what a shop uses, and it grows: three orders are six lines, four are
 * eight, and it makes you name the other end of a hand-made arrangement. A select and a
 * separate switch is what a project tool uses, and it is short, but the switch is a state
 * nothing writes down: leave it on and two days later the control says `Newest` over a
 * list that starts at the oldest.
 *
 * This is both. The switch turns the list around and every order in the menu is written
 * from the end you are now at, so the state is always in words. Airtable names both ends
 * of every sort for the same reason — `Earliest → Latest` beside `Latest → Earliest`,
 * typed to the field rather than a bare Asc/Desc.
 *
 * Its own component because the bar is not the only toolbar in this app that sorts, and
 * two copies of a control are two answers to the same question by the following week.
 */
export function SortPicker({
  value,
  onChange,
  label,
  options,
  direction,
  onDirection,
  chrome = control,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** For screen readers — the chosen option is what everyone else reads. */
  label: string;
  options: SortOption[];
  /**
   * Which way the chosen order runs. Optional, because a list is free to offer an order
   * without offering it backwards — but every list that can, should.
   */
  direction?: "asc" | "desc";
  onDirection?: (direction: "asc" | "desc") => void;
  /** The toolbar's own control chrome, for a bar that does not wear the standard one. */
  chrome?: string;
  className?: string;
}) {
  const reversed = direction === "desc";
  const here = options.find((o) => o.value === value);
  const there = reversed ? here?.label : here?.reverse;

  return (
    <div className={cn("zv-toolbar-order", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={chrome}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface">
            {reversed && o.reverse ? o.reverse : o.label}
          </option>
        ))}
      </select>

      {/*
        The end of the control turns the list around.

        It keeps its state while you change what you are ordering by: turn it on `Largest`
        and it stays on when you switch to `Name`, which is the one thing a select full of
        both ends cannot do. The tooltip names where a press would take you.
      */}
      {direction && onDirection && (
        <button
          type="button"
          onClick={() => onDirection(reversed ? "asc" : "desc")}
          aria-label={reversed ? "Back to the usual order" : "Reverse the order"}
          aria-pressed={reversed}
          title={there ? `Show ${there}` : reversed ? "Reversed" : "Reverse the order"}
          className={cn(chrome, "zv-toolbar-dir", reversed && "is-on")}
        >
          {reversed ? (
            <ArrowUpNarrowWide aria-hidden="true" />
          ) : (
            <ArrowDownWideNarrow aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}

