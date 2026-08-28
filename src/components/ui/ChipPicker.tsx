"use client";

import { cn } from "@/lib/utils";

export type Chip = {
  value: string;
  label: string;
  /** Painted as a dot before the label, so a category keeps its colour here too. */
  color?: string | null;
};

/**
 * A row of choices you can see all of at once.
 *
 * A `<select>` hides every option but the chosen one, which is the wrong trade for the
 * things this app picks between: there are four accounts and a dozen categories, they
 * are the same four and dozen every time, and the whole decision is which one of the
 * visible set it was. A dropdown turns that into tap, read, tap. It is also the only
 * shape that works for picking several — the thing a budget's categories need and a
 * multi-select `<select>` on a phone does very badly.
 *
 * It posts through hidden inputs rather than holding a value the caller has to thread
 * back, so it drops into a plain `<form action={…}>` next to every other field and the
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
  const toggle = (value: string) => {
    if (!multiple) {
      onChange(selected[0] === value ? [] : [value]);
      return;
    }
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );
  };

  return (
    <div className="mb-3.25">
      {label && (
        <div className="mb-1.5 text-[11.5px] font-semibold tracking-[0.2px] text-muted uppercase">
          {label}
        </div>
      )}

      {/* One input per chosen value. `getAll(name)` on the server, and nothing to keep in sync. */}
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}

      <div className="flex flex-wrap gap-1.5">
        {emptyLabel && (
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

        {chips.map((chip) => {
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
      </div>

      {(help || (emptyMeans && selected.length === 0)) && (
        <p className="mt-1.25 text-[11.5px] text-muted">
          {selected.length === 0 && emptyMeans ? emptyMeans : help}
        </p>
      )}
    </div>
  );
}
