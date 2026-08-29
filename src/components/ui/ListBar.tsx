"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ListTag = {
  /** What the caller filters by. Null is never a key — that is what `All` means. */
  key: string;
  label: string;
  /**
   * How many rows this tag holds.
   *
   * Not decoration. Unpressed, a row of counted tags is a census of the page — one line
   * saying how many are over, how many are quiet, how many were never finished — and
   * that readout is what makes a filter safe on a screen whose job is to hold
   * everything. Without it the same row is just a set of doors that hide things.
   */
  count?: number;
};

/**
 * One row above a list: what to show on the left, what order to show it in on the right.
 *
 * Written once because it had been written twice and was about to be written five times.
 * A person should not have to learn where each screen keeps its controls, and the way
 * that happens is not discipline — it is there being one component.
 *
 * Everything is optional and nothing is drawn that cannot change what you see: no tags
 * without at least two of them, no orders without at least two, no bar at all if neither
 * survives. A control that is a button doing nothing dressed as a choice is worse than
 * no control, because it costs a glance every time.
 */
export function ListBar({
  all,
  tags = [],
  tag = null,
  onTag,
  orders = [],
  order,
  onOrder,
  query,
  onQuery,
  searchLabel = "Search",
}: {
  /** The `All` chip: its word and how many rows it stands for. */
  all?: { label?: string; count: number };
  tags?: ListTag[];
  tag?: string | null;
  onTag?: (key: string | null) => void;
  orders?: [string, string][];
  order?: string;
  onOrder?: (key: string) => void;
  query?: string;
  onQuery?: (value: string) => void;
  searchLabel?: string;
}) {
  const showTags = tags.length >= 2 && Boolean(onTag);
  const showOrders = orders.length >= 2 && Boolean(onOrder);
  const showSearch = onQuery !== undefined;
  if (!showTags && !showOrders && !showSearch) return null;

  return (
    <div className={cn("zv-listbar", !showTags && !showSearch && "is-order-only")}>
      {(showSearch || showTags) && (
        <div className="zv-listbar-left">
          {showSearch && (
            <div className="zv-listbar-find">
              <Search className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
              <input
                type="search"
                value={query ?? ""}
                onChange={(e) => onQuery?.(e.target.value)}
                placeholder={searchLabel}
                aria-label={searchLabel}
                /* Enter in a search box on a page with a form would submit the form. */
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
              {(query ?? "") !== "" && (
                <button type="button" onClick={() => onQuery?.("")} aria-label="Clear search">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          )}

          {showTags && (
            <div className="zv-tags">
              {all && (
                <button
                  type="button"
                  onClick={() => onTag?.(null)}
                  aria-pressed={tag === null}
                  className={cn("zv-tag", tag === null && "is-on")}
                >
                  {all.label ?? "All"}
                  <i>{all.count}</i>
                </button>
              )}
              {tags.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  /* Pressing the one that is on takes it off, so the row never traps you. */
                  onClick={() => onTag?.(tag === t.key ? null : t.key)}
                  aria-pressed={tag === t.key}
                  className={cn("zv-tag", tag === t.key && "is-on")}
                >
                  {t.label}
                  {t.count !== undefined && <i>{t.count}</i>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showOrders && (
        <div className="zv-order" role="group" aria-label="Order">
          {orders.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onOrder?.(key)}
              aria-pressed={order === key}
              className={cn(order === key && "is-on")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

