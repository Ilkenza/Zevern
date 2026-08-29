"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The chrome every control on this bar wears.
 *
 * Lifted verbatim from `upcoming/rule-filters`, which is where this shape was settled:
 * that toolbar was the one in the app people liked, so it is the one everything else
 * now copies rather than the other way round. Keep the two in step — or better, keep
 * there being only this one.
 */
export const control =
  "rounded-ctrl border border-line bg-white/[0.035] px-2.5 py-1.5 text-[12.5px] text-ink scheme-dark focus:border-gold focus:shadow-ring";

export type ListOption = { value: string; label: string };

export type ListFilter = {
  value: string;
  onChange: (value: string) => void;
  /** For screen readers; the `all` option is what people actually read. */
  label: string;
  /** The option that means no narrowing — "All categories", "Any interval". */
  all: string;
  options: ListOption[];
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
  sort,
  shown,
  total,
  onClear,
  inPanel = false,
}: {
  query?: string;
  onQuery?: (value: string) => void;
  searchLabel?: string;
  filters?: ListFilter[];
  sort?: { value: string; onChange: (value: string) => void; label: string; options: ListOption[] };
  /** How many rows survive, and how many there are. Together they draw the count line. */
  shown?: number;
  total?: number;
  onClear?: () => void;
  /** True when the bar sits inside a Panel and needs its gutter and rule rather than page spacing. */
  inPanel?: boolean;
}) {
  // A select offering "All accounts" and the one account every row already uses is a
  // no-op wearing the clothes of a choice. Two real options, or it is not drawn.
  const shownFilters = filters.filter((f) => f.options.length >= 2);
  const hasSearch = onQuery !== undefined;
  const hasSort = sort !== undefined && sort.options.length >= 2;
  if (!hasSearch && shownFilters.length === 0 && !hasSort) return null;

  const narrowed =
    shown !== undefined && total !== undefined && shown !== total;

  return (
    <div className={cn("zv-toolbar", inPanel && "is-in-panel")}>
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

      {shownFilters.map((f) => (
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
      ))}

      {hasSort && (
        <select
          value={sort.value}
          onChange={(e) => sort.onChange(e.target.value)}
          aria-label={sort.label}
          className={control}
        >
          {sort.options.map((o) => (
            <option key={o.value} value={o.value} className="bg-surface">
              {o.label}
            </option>
          ))}
        </select>
      )}

      {narrowed && (
        <div className="zv-toolbar-count">
          <span aria-live="polite" className="mono">
            {shown} of {total}
          </span>
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

