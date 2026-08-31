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
import { ENTRY_SORTS, type EntrySort, type SortWay } from "@/lib/money/entry-search";
import { SortPicker } from "@/components/ui/SortPicker";
import { RANGE_OPTIONS, type RangeKey } from "@/lib/money/date-range";



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
  way,
  onWay,
  range,
  onRange,
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
  /** Which end of that order the list starts at. */
  way: SortWay;
  onWay: (value: SortWay) => void;
  /** Which named span the list is standing in. */
  range: RangeKey;
  onRange: (value: RangeKey) => void;
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
          When, as a span with a name.

          This was two empty `dd. mm. yyyy.` boxes and an arrow, which is the control a
          database hands you rather than one anybody asked for: six digits before it does
          anything, two calendar visits to ask "how did last week go", and once set it is
          a pair of dates you have to read and subtract to know what you are looking at.
          A named span is one click and says what it is afterwards.

          The pickers are still here, behind `Pick dates…`, for the case no preset covers.
          They are the exception now instead of the whole control.
        */}
        <select
          value={range}
          onChange={(e) => onRange(e.target.value as RangeKey)}
          aria-label="Which dates to show"
          className={`zv-sort${range === "all" ? "" : " is-on"}`}
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {range === "custom" && (
          <span className="zv-range">
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
        )}

        {/*
          The same order picker the list toolbars wear, in this bar's own chrome.

          This toolbar is the last one in Private that is not `ListBar`, and it keeps its
          pill controls until it is — but the question it asks about order is the app's
          question now, asked once, in one component.
        */}
        <SortPicker
          value={sort}
          onChange={(value) => onSort(value as EntrySort)}
          label="Order the entries"
          options={ENTRY_SORTS}
          direction={way}
          onDirection={onWay}
          chrome="zv-sort"
          className="is-pill ml-auto"
        />
      </div>
    </>
  );
}




