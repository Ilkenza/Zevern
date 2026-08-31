"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { RANGE_OPTIONS } from "@/lib/money/date-range";
import { PickMany } from "./PickMany";
import { SortPicker } from "./SortPicker";
import { control, type ListOption, type SortOption } from "./control";

/*
  The chrome and the option shapes live in `./control` now, and are handed back out from
  here because this is where every screen imports them from. Two components wear that
  chrome — this bar and the order picker inside it — and a constant that lives in one of
  its own users is an import cycle waiting to be written.
*/
export { control };
export type { ListOption, SortOption };

export type ListFilter = {
  value: string;
  onChange: (value: string) => void;
  /** For screen readers; the `all` option is what people actually read. */
  label: string;
  /** The option that means no narrowing — "All categories", "Any interval". */
  all: string;
  options: ListOption[];
  /*
    Answer it with several, when several is a sensible answer.

    Pass `values` and `onValues` and this filter is drawn as a picker with checkboxes
    instead of a select; `value`/`onChange` stay required so a caller cannot half-convert
    one and leave a control wired to nothing. Which filters get it is a judgement about
    the field, not about the list: an entry has one kind and one account, so *these three
    accounts* is a real question — while `Priced and not` is on or off, and offering to
    pick both sides of a switch is offering to pick nothing.
  */
  values?: string[];
  onValues?: (next: string[]) => void;
  /** The plural for the summary — `3 categories`. Only read when `values` is passed. */
  many?: string;
  /**
   * Draw it even with a single option.
   *
   * The two-option rule below is about no-op selects — "All accounts" plus the one
   * account every row already uses is a choice with nothing to choose. A flag is the
   * exception: `All 120 / No price yet (3)` is one option and still a real question,
   * because the two sides are not two values of a field, they are on and off.
   */
  always?: boolean;
};

/**
 * One toolbar over a list: search, what to narrow by, what order to show it in, and
 * what the narrowing is costing.
 *
 * Selects rather than chips, and that was a reversal. Chips carried a count each, so
 * unpressed the row read as a census — how many are over, how many are quiet — and that
 * readout was the argument for allowing a filter on a page whose job is to hold
 * everything. What it could not do is scale: three axes with fifteen values apiece is a
 * wall of chips, and every list in this app eventually has three axes.
 *
 * The census is not gone, it has moved twice. Each option carries its own count in its
 * label, so the breakdown is one click rather than zero; and the `N of M` on the right
 * says what is being left out, live, whenever anything is narrowed. A list that quietly
 * shrank is a list you cannot trust to be complete when you go looking for something.
 */
export function ListBar({
  query,
  onQuery,
  searchLabel = "Search…",
  filters = [],
  dateRange,
  sort,
  shown,
  total,
  onClear,
  alwaysClear = false,
  inPanel = false,
  flush = false,
}: {
  query?: string;
  onQuery?: (value: string) => void;
  searchLabel?: string;
  filters?: ListFilter[];
  /**
   * When, as a named span.
   *
   * Its own prop rather than one more entry in `filters`, because it is the only
   * control here that can grow a second row: `Pick dates…` brings back the two
   * pickers, and everything else on this bar is exactly one element wide.
   */
  dateRange?: {
    value: string;
    onChange: (value: string) => void;
    from: string;
    to: string;
    onFrom: (value: string) => void;
    onTo: (value: string) => void;
    /**
     * The spans this particular list can be asked for. Defaults to the app's own set.
     *
     * A list that already covers one window needs a shorter vocabulary, not the same
     * one: inside a single month `This year`, `All time` and `Last 3 months` are three
     * different words for the whole list, and three options that do one thing is the
     * same no-op the two-option rule above exists to keep off this bar.
     */
    options?: { value: string; label: string }[];
    /** Bounds for the pickers. Nothing before the list starts, nothing after today. */
    minDate?: string;
    maxDate?: string;
  };
  sort?: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    options: SortOption[];
    /*
      Which way the chosen order runs. Optional, because a list is free to offer an
      order without offering it backwards — but every list that can, should.

      One switch rather than twice as many options, and the `reverse` names above are
      what keep that honest: the switch changes the direction, the menu changes its
      wording, and no state is left for the reader to remember. A list that gives the
      switch and no names still works; it just asks the arrow to carry the whole message.
    */
    direction?: "asc" | "desc";
    onDirection?: (direction: "asc" | "desc") => void;
  };
  /** How many rows survive, and how many there are. Together they draw the count line. */
  shown?: number;
  total?: number;
  onClear?: () => void;
  /**
   * Draw the way out even when the list on screen is the whole list.
   *
   * `shown === total` normally means nothing is narrowed, and on a list filtered entirely
   * in the browser that is true. It is false wherever part of the narrowing happens in the
   * read: standing in one category, the rows that came back *are* that category, so the
   * counts agree and the bar concludes there is nothing to clear — while the screen is
   * showing a fraction of the ledger and the reader is holding the only control that
   * would undo it. The caller knows which of its filters are on; this says so.
   */
  alwaysClear?: boolean;
  /** True when the bar sits inside a Panel and needs its gutter and rule rather than page spacing. */
  inPanel?: boolean;
  /**
   * The rows beside it already carry the gutter, so this bar takes none.
   *
   * Two conventions meet in this app and both are right where they are. Upcoming and
   * Setup put the padding on every row, because a row that lights up on hover has to
   * light up edge to edge — so a bar between them needs the same padding to line up
   * with them. A budget's entries do the opposite: the container is padded once and
   * the rows are flush inside it, and there a bar with its own gutter stands sixteen
   * pixels in from every date, every amount and every rule around it.
   */
  flush?: boolean;
}) {
  /*
    A select offering "All accounts" and the one account every row already uses is a no-op
    wearing the clothes of a choice, so it wants two real options before it is worth
    drawing. A picker with checkboxes does not: one option there is a switch — "only
    money that was spent" — the same shape as the flag filter below, and it is a real
    question with one box in it.

    The distinction matters for more than tidiness. Kinds are counted from the rows on
    screen, so picking a category that only ever had expenses in it left the kind filter
    with one option and the two-option rule took the control away — a control vanishing
    because of what you just did with it, which is the one thing a filter must never do.
  */
  const shownFilters = filters.filter(
    (f) => f.always || f.options.length >= (f.values ? 1 : 2),
  );
  const hasSearch = onQuery !== undefined;
  const hasSort = sort !== undefined && sort.options.length >= 2;
  if (!hasSearch && shownFilters.length === 0 && !hasSort && !dateRange) return null;

  const narrowed =
    shown !== undefined && total !== undefined && shown !== total;

  return (
    <div className={cn("zv-toolbar", inPanel && "is-in-panel", flush && "is-flush")}>
      {hasSearch && (
        <div className="zv-toolbar-find">
          <Search aria-hidden="true" className="zv-toolbar-find-icon" />
          <input
            value={query ?? ""}
            onChange={(e) => onQuery?.(e.target.value)}
            type="search"
            placeholder={searchLabel}
            aria-label={searchLabel}
            className={cn(control, "w-full py-1.5 pr-2.5 pl-8 placeholder:text-faint")}
          />
        </div>
      )}

      {dateRange && (
        <select
          value={dateRange.value}
          onChange={(e) => dateRange.onChange(e.target.value)}
          aria-label="Which dates to show"
          className={control}
        >
          {(dateRange.options ?? RANGE_OPTIONS).map((o) => (
            <option key={o.value} value={o.value} className="bg-surface">
              {o.label}
            </option>
          ))}
        </select>
      )}

      {dateRange?.value === "custom" && (
        <span className="zv-range">
          <input
            type="date"
            value={dateRange.from}
            min={dateRange.minDate}
            max={dateRange.to || dateRange.maxDate}
            onChange={(e) => dateRange.onFrom(e.target.value)}
            aria-label="From date"
          />
          <i aria-hidden>→</i>
          <input
            type="date"
            value={dateRange.to}
            min={dateRange.from || dateRange.minDate}
            max={dateRange.maxDate}
            onChange={(e) => dateRange.onTo(e.target.value)}
            aria-label="To date"
          />
        </span>
      )}

      {shownFilters.map((f) =>
        f.values && f.onValues ? (
          <PickMany
            key={f.label}
            values={f.values}
            onValues={f.onValues}
            label={f.label}
            all={f.all}
            many={f.many}
            options={f.options}
          />
        ) : (
          <select
            key={f.label}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            aria-label={f.label}
            className={control}
          >
            <option value="" className="bg-surface">
              {f.all}
            </option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value} className="bg-surface">
                {o.label}
              </option>
            ))}
          </select>
        ),
      )}

      {/*
        The order, as its own control — the bar only says where it goes.

        `SortPicker` is shared with the toolbars this bar has not replaced yet, so a list
        that sorts asks the question the same way wherever it lives.
      */}
      {hasSort && (
        <SortPicker
          value={sort.value}
          onChange={sort.onChange}
          label={sort.label}
          options={sort.options}
          direction={sort.direction}
          onDirection={sort.onDirection}
        />
      )}

      {(narrowed || (alwaysClear && onClear)) && (
        <div className="zv-toolbar-count">
          {narrowed && (
            <span aria-live="polite" className="mono">
              {shown} of {total}
            </span>
          )}
          {onClear && (
            <button type="button" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}












