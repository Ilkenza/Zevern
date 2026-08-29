"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type Chip = {
  value: string;
  label: string;
  /** Painted as a dot before the label, so a category keeps its colour here too. */
  color?: string | null;
};

/**
 * The number of chips past which the row stops being a row.
 *
 * Under it every choice is visible at once, and that is the whole point of chips — no
 * search box, no fold, nothing to operate. Over it the same control becomes a wall: at
 * thirty-five categories it stood eight rows deep, pushed the rest of the form off the
 * screen, and what you had already picked could be anywhere in it. So past this many the
 * control grows two things, and only then: a box to type in, and a fold.
 */
const CROWDED = 10;

/** Ignore case and diacritics both, so "odeca" finds "odeća". */
function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * A row of choices you can see all of at once — and, where there are too many for that
 * to be true, one you can search and fold.
 *
 * A `<select>` hides every option but the chosen one, which is the wrong trade for the
 * things this app picks between: they are the same handful every time, and the whole
 * decision is which of the visible set it was. A dropdown turns that into tap, read, tap.
 * It is also the only shape that works for picking several — the thing a budget's
 * categories need, and a multi-select `<select>` on a phone does very badly.
 *
 * What it adds past `CROWDED` chips is the smallest thing that keeps that promise: the
 * ones already chosen are pulled to the front, so they are never what the fold hides, and
 * the search narrows in place rather than navigating anywhere. Nothing ends up behind a
 * click that was not behind one before.
 *
 * It posts through hidden inputs rather than holding a value the caller has to thread
 * back, so it drops into a plain `<form action={…}>` beside every other field and the
 * server reads it with `formData.getAll(name)`.
 */
export function ChipPicker({
  label,
  name,
  chips,
  selected,
  onChange,
  multiple = false,
  emptyLabel,
  emptyMeans,
  help,
}: {
  label?: string;
  name: string;
  chips: Chip[];
  selected: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  /** The chip that means "none of them" — shown first, and clears the rest when picked. */
  emptyLabel?: string;
  /** What choosing nothing actually does, said out loud under the row. */
  emptyMeans?: string;
  help?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const crowded = chips.length > CROWDED;
  const typing = query.trim();

  /*
    Chosen first, then the rest in the order they were given.

    Without this the fold is a lottery: pick something near the bottom of thirty-five and
    it vanishes the moment the list folds, leaving a control that says three are chosen
    and shows none of them. Sorted this way, the fold can only ever hide what you have
    not picked.
  */
  const ordered = useMemo(() => {
    const chosen = new Set(selected);
    const hit = typing ? plain(typing) : "";
    return chips
      .filter((chip) => !hit || plain(chip.label).includes(hit))
      .sort((a, b) => Number(chosen.has(b.value)) - Number(chosen.has(a.value)));
  }, [chips, selected, typing]);

  const toggle = (value: string) => {
    if (!multiple) {
      onChange(selected[0] === value ? [] : [value]);
      return;
    }
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );
  };

  // Folded only while it is crowded, nothing is typed, and nobody has asked to see it all.
  const folded = crowded && !open && !typing;

  return (
    <div className="mb-3.25">
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold text-[#C6CAD6]">{label}</span>
          {crowded && (
            <span className="text-[11px] text-faint">
              {selected.length > 0
                ? `${selected.length} of ${chips.length} picked`
                : `${chips.length} to choose from`}
            </span>
          )}
        </div>
      )}

      {/* One input per chosen value. `getAll(name)` on the server, and nothing to keep in sync. */}
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}

      {crowded && (
        <div className="zv-chipsearch">
          <Search aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={label ? `Search ${label.toLowerCase()}` : "Search"}
            aria-label={`Search ${label ?? name}`}
            /* Enter here would save the budget from inside a search box. */
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
        </div>
      )}

      <div className={cn("zv-chips", folded && "is-folded")}>
        {emptyLabel && !typing && (
          <button
            type="button"
            onClick={() => onChange([])}
            aria-pressed={selected.length === 0}
            className={cn(
              "zv-press rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              selected.length === 0
                ? "border-gold/40 bg-active-bg text-gold"
                : "border-line text-muted hover:text-ink",
            )}
          >
            {emptyLabel}
          </button>
        )}

        {ordered.map((chip) => {
          const on = selected.includes(chip.value);
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => toggle(chip.value)}
              aria-pressed={on}
              className={cn(
                "zv-press flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                on
                  ? "border-gold/40 bg-active-bg text-gold"
                  : "border-line text-muted hover:text-ink",
              )}
            >
              {chip.color && (
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: chip.color }}
                  aria-hidden
                />
              )}
              {chip.label}
            </button>
          );
        })}

        {chips.length === 0 && (
          <span className="py-1.5 text-[12px] text-faint">Nothing to pick yet.</span>
        )}

        {typing && ordered.length === 0 && (
          <span className="py-1.5 text-[12px] text-faint">Nothing matches that.</span>
        )}
      </div>

      {crowded && !typing && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="zv-chipmore"
          aria-expanded={open}
        >
          {open ? "Show fewer" : `Show all ${chips.length}`}
        </button>
      )}

      {(help || (emptyMeans && selected.length === 0)) && (
        <p className="mt-1.25 text-[11.5px] text-muted">
          {selected.length === 0 && emptyMeans ? emptyMeans : help}
        </p>
      )}
    </div>
  );
}

