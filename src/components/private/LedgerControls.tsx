"use client";

/**
 * Search, filters and order for a list of entries.
 *
 * Written once and used by both lists that show entries — the month's ledger and a
 * category's year — because they are the same object seen through two windows, and a
 * search that behaves differently in the two would be a search you have to learn twice.
 *
 * The rules themselves live in `entry-search`, tested without a screen. This is the
 * controls and nothing else.
 */

import { Search, X } from "lucide-react";
import type { EntrySort } from "@/lib/money/entry-search";

const SORTS: { value: EntrySort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "largest", label: "Largest first" },
  { value: "smallest", label: "Smallest first" },
];

export function FilterChip({
  on,
  onClick,
  count,
  children,
}: {
  on: boolean;
  onClick: () => void;
  /**
   * How many entries this chip would leave, counted against every *other* filter that is
   * currently on.
   *
   * Counted that way rather than against the whole month, because a chip that says 42 and
   * hands back 3 is a chip that lied — and once a search and a date range are on, against
   * the whole month is the only number that is easy to compute and always wrong.
   *
   * Optional: a caller with nothing to count leaves it off and gets the chip it had.
   */
  count?: number;
  children: React.ReactNode;
}) {
  // Nothing behind it and not the one you are standing on: still drawn, so the row does
  // not reshuffle under the pointer as you narrow, but not a door into an empty list.
  const dead = count === 0 && !on;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dead}
      aria-pressed={on}
      className={`zv-filter-chip${on ? " is-on" : ""}`}
    >
      {children}
      {count !== undefined && <i>{count}</i>}
    </button>
  );
}

export function LedgerControls({
  query,
  onQuery,
  sort,
  onSort,
  from,
  to,
  onFrom,
  onTo,
  minDate,
  maxDate,
  placeholder,
  label,
  children,
}: {
  query: string;
  onQuery: (value: string) => void;
  sort: EntrySort;
  onSort: (value: EntrySort) => void;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  /** The span the list covers, so the pickers cannot offer a day that holds nothing. */
  minDate: string;
  maxDate: string;
  placeholder: string;
  label: string;
  /** The chips this particular list offers — accounts, kinds, whatever it has. */
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="zv-search">
        <Search className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
        />
        {query !== "" && (
          <button type="button" onClick={() => onQuery("")} aria-label="Clear search">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {children}

        {/*
          Both ends of a range, and both optional.

          Bounded to the span the list actually covers: offering a day outside it is
          offering a filter whose only possible answer is an empty list. Marked when it is
          set, because a narrowed date is the one filter with nothing on screen to show for
          itself — a chip is obviously on, a date that quietly says "since the 12th" is not.
        */}
        <span className={`zv-range${from || to ? " is-on" : ""}`}>
          <input
            type="date"
            value={from}
            min={minDate}
            max={to || maxDate}
            onChange={(e) => onFrom(e.target.value)}
            aria-label="From date"
          />
          <i aria-hidden>→</i>
          <input
            type="date"
            value={to}
            min={from || minDate}
            max={maxDate}
            onChange={(e) => onTo(e.target.value)}
            aria-label="To date"
          />
          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                onFrom("");
                onTo("");
              }}
              aria-label="Clear dates"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </span>

        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as EntrySort)}
          aria-label="Sort entries"
          className="zv-sort ml-auto"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}


